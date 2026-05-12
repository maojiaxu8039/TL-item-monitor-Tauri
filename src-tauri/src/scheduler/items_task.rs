use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::broadcast;
use tokio::time::Duration;
use tracing::{error, info};

use crate::core::state::AppState;
use crate::db::repo_items;
use crate::db::repo_item_realtime_prices;
use crate::scraper;

pub async fn run_items_reload_task(
    app: tauri::AppHandle,
    state: Arc<AppState>,
    mut abort: broadcast::Receiver<()>,
) {
    info!("[DEBUG] Items reload task started - entering main loop");
    info!("[DEBUG] Config: auto_reload={}, interval={}s", 
        {
            let cfg = crate::core::config::load_config().unwrap_or_default();
            cfg.scrape.auto_reload
        },
        {
            let cfg = crate::core::config::load_config().unwrap_or_default();
            cfg.scrape.items_reload_interval
        }
    );

    info!("[DEBUG] Starting main loop");

    // First iteration: wait a short delay before first scrape to allow app to start
    let mut first_run = true;

    loop {
        info!("[DEBUG] === TOP OF LOOP ===");
        
        // Load fresh config first
        let fresh_config = match crate::core::config::load_config() {
            Ok(cfg) => cfg,
            Err(e) => {
                error!("Failed to load config: {}", e);
                continue;
            }
        };

        info!("[DEBUG] Items reload tick - auto_reload={}, interval={}s", 
            fresh_config.scrape.auto_reload, fresh_config.scrape.items_reload_interval);

        if !fresh_config.scrape.auto_reload {
            info!("[DEBUG] auto_reload is false, skipping refresh");
            tokio::time::sleep(Duration::from_secs(10)).await;
            continue;
        }

        let current_interval = fresh_config.scrape.items_reload_interval.max(60);
        let items_source = fresh_config.scrape.items_source.clone();
        let json_path = fresh_config.scrape.items_json_path.clone();
        let source_name = if items_source == "api" { "luosi" } else { "local_json" };

        if !first_run {
            info!("[DEBUG] Waiting {} seconds for next refresh...", current_interval);
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(current_interval)) => {
                    info!("[DEBUG] >>> WAIT COMPLETE, proceeding with refresh <<<");
                }
                result = abort.recv() => {
                    match result {
                        Ok(_) => {
                            info!("[DEBUG] Abort received, breaking loop");
                            break;
                        }
                        Err(broadcast::error::RecvError::Closed) => {
                            info!("[DEBUG] Abort channel closed, breaking loop");
                            break;
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => {
                            info!("[DEBUG] Abort lagged, continuing");
                            continue;
                        }
                    }
                }
            }
        } else {
            // On first run, check if database already has items
            let ctx = state.active_context.read().clone();
            match repo_items::get_items_count(&state.db, &ctx.season_id, ctx.market_mode.as_str()).await {
                Ok(count) if count > 0 => {
                    // Database already has items, wait for a few seconds before first scrape
                    info!("[DEBUG] Database already has {} items, waiting 5s before first scrape", count);
                    tokio::select! {
                        _ = tokio::time::sleep(Duration::from_secs(5)) => {
                            info!("[DEBUG] Initial delay complete, proceeding with first scrape");
                        }
                        result = abort.recv() => {
                            match result {
                                Ok(_) => {
                                    info!("[DEBUG] Abort received during initial delay, breaking loop");
                                    break;
                                }
                                Err(broadcast::error::RecvError::Closed) => {
                                    info!("[DEBUG] Abort channel closed during initial delay, breaking loop");
                                    break;
                                }
                                Err(broadcast::error::RecvError::Lagged(_)) => {
                                    info!("[DEBUG] Abort lagged during initial delay, continuing");
                                }
                            }
                        }
                    }
                }
                _ => {
                    info!("[DEBUG] No items in database or error checking, proceeding with first scrape immediately");
                }
            }
            first_run = false;
        }

        let ctx = state.active_context.read().clone();
        let start = std::time::Instant::now();

        let (items_result, source_type) = if items_source == "api" {
            info!("[DEBUG] Auto reload: fetching from API for {}/{:?}", ctx.season_id, ctx.market_mode);
            
            match scraper::scrape_items(&ctx.season_id, ctx.market_mode.as_str()).await {
                Ok(items) => (Ok(items), "api"),
                Err(e) => (Err(format!("API scrape failed: {}", e)), "api"),
            }
        } else {
            info!("Auto reload: loading from JSON: {}", json_path);
            match crate::app::load_items_from_json(&ctx.season_id, ctx.market_mode.as_str(), &json_path) {
                Ok(items) => (Ok(items), "local"),
                Err(e) => (Err(format!("JSON load failed: {}", e)), "local"),
            }
        };

        let duration_ms = start.elapsed().as_millis() as i64;

        match items_result {
            Ok(items) => {
                let count = items.len() as i64;
                info!("[DEBUG] API returned {} items", count);

                if let Err(e) = repo_items::bulk_insert_items(&state.db, &ctx.season_id, ctx.market_mode.as_str(), &items).await {
                    error!("Failed to bulk-insert items: {}", e);
                    let _ = crate::db::repo_source_diagnostics::upsert_diagnostic(
                        &state.db,
                        source_name,
                        source_type,
                        true,
                        Some(ctx.market_mode.as_str()),
                        None,
                        false,
                        duration_ms,
                        Some(count),
                        Some(&e.to_string()),
                    ).await;
                } else {
                    let now = chrono::Utc::now().timestamp();
                    info!("[DEBUG] Bulk insert success, inserting {} realtime records with timestamp {}", count, now);

                    let realtime_records: Vec<(String, String, f64, i64)> = items
                        .iter()
                        .map(|item| (item.item_id.clone(), item.name.clone(), item.price, now))
                        .collect();

                    if let Err(e) = repo_item_realtime_prices::batch_insert_realtime_prices(&state.db, &realtime_records).await {
                        error!("Failed to insert realtime prices: {}", e);
                    }

                    if let Err(e) = repo_item_realtime_prices::cleanup_old_records(&state.db).await {
                        error!("Failed to cleanup old realtime records: {}", e);
                    }

                    let _ = crate::db::repo_source_diagnostics::upsert_diagnostic(
                        &state.db,
                        source_name,
                        source_type,
                        true,
                        Some(ctx.market_mode.as_str()),
                        None,
                        true,
                        duration_ms,
                        Some(count),
                        None,
                    ).await;

                    {
                        let mut cache = state.items_cache.write();
                        *cache = items;
                    }

                    {
                        let mut status = state.task_status.write();
                        status.last_items_reload = Some(now);
                    }

                    let _ = app.emit("items-updated", serde_json::json!({
                        "count": count,
                        "updated_at": now
                    }));

                    info!("Items reload complete: {} items from {}", count, items_source);
                }
            }
            Err(e) => {
                error!("Items reload failed: {}", e);
                let _ = crate::db::repo_source_diagnostics::upsert_diagnostic(
                    &state.db,
                    source_name,
                    source_type,
                    true,
                    Some(ctx.market_mode.as_str()),
                    None,
                    false,
                    duration_ms,
                    None,
                    Some(&e),
                ).await;
                {
                    let mut status = state.task_status.write();
                    status.last_items_reload = Some(chrono::Utc::now().timestamp());
                }

            }
        }
    }
}
