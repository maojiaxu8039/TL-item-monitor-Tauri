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

    let mut first_run = true;

    loop {
        info!("[DEBUG] === TOP OF LOOP ===");
        
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
            let ctx = state.active_context.read().clone();
            match repo_items::get_items_count(&state.db, &ctx.season_id, ctx.market_mode.as_str()).await {
                Ok(count) if count > 0 => {
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
        let season_id = ctx.season_id.clone();

        // Scrape both modes simultaneously
        let start = std::time::Instant::now();
        
        let (normal_result, expert_result) = tokio::join!(
            scrape_for_mode(&season_id, "season_normal", &items_source, &json_path),
            scrape_for_mode(&season_id, "season_expert", &items_source, &json_path),
        );

        let duration_ms = start.elapsed().as_millis() as i64;

        // Process normal mode
        let normal_count = process_scrape_result(
            &state, 
            &normal_result, 
            &season_id, 
            "season_normal", 
            source_name,
            "api"
        ).await;

        // Process expert mode (may fail if season not started)
        let expert_count = process_scrape_result(
            &state, 
            &expert_result, 
            &season_id, 
            "season_expert", 
            source_name,
            "api"
        ).await;

        let now = chrono::Utc::now().timestamp();

        // Update status
        {
            let mut status = state.task_status.write();
            status.last_items_reload = Some(now);
        }

        // Update cache with current mode items
        if normal_count > 0 {
            let current_mode = ctx.market_mode.as_str();
            if current_mode == "season_normal" || normal_count > 0 {
                if let Ok(items) = repo_items::get_items_from_realtime_table(
                    &state.db, 
                    &season_id, 
                    if current_mode == "season_normal" { current_mode } else { "season_normal" }
                ).await {
                    let mut cache = state.items_cache.write();
                    *cache = items;
                }
            }
        }

        // Emit event if at least one mode succeeded
        if normal_count > 0 || expert_count > 0 {
            let _ = app.emit("items-updated", serde_json::json!({
                "normal_count": normal_count,
                "expert_count": expert_count,
                "updated_at": now
            }));
            info!("Items reload complete: normal={}, expert={}, source={}", normal_count, expert_count, items_source);
        }
    }
}

async fn scrape_for_mode(
    season_id: &str,
    mode: &str,
    source: &str,
    json_path: &str,
) -> Result<Vec<crate::db::models::Item>, String> {
    if source == "api" {
        info!("[DEBUG] Auto reload: fetching {} items from API for {}/{}", mode, season_id, mode);
        scraper::scrape_items(season_id, mode)
            .await
            .map_err(|e| format!("API scrape failed for {}: {}", mode, e))
    } else {
        info!("Auto reload: loading {} items from JSON for {}/{}", mode, season_id, mode);
        crate::app::load_items_from_json(season_id, mode, json_path)
            .map_err(|e| format!("JSON load failed for {}: {}", mode, e))
    }
}

async fn process_scrape_result(
    state: &Arc<AppState>,
    result: &Result<Vec<crate::db::models::Item>, String>,
    season_id: &str,
    mode: &str,
    source_name: &str,
    source_type: &str,
) -> i64 {
    match result {
        Ok(items) if !items.is_empty() => {
            let count = items.len() as i64;
            info!("[DEBUG] API returned {} {} items", count, mode);

            if let Err(e) = repo_items::bulk_insert_items(&state.db, season_id, mode, items).await {
                error!("Failed to bulk-insert {} items: {}", mode, e);
                0
            } else {
                let now = chrono::Utc::now().timestamp();
                let realtime_records: Vec<(String, String, f64, i64)> = items
                    .iter()
                    .map(|item| (item.item_id.clone(), item.name.clone(), item.price, now))
                    .collect();

                if let Err(e) = repo_item_realtime_prices::batch_insert_realtime_prices(&state.db, &realtime_records).await {
                    error!("Failed to insert {} realtime prices: {}", mode, e);
                }

                count
            }
        }
        Ok(_) => {
            info!("[DEBUG] No {} items fetched (season may not be started)", mode);
            0
        }
        Err(e) => {
            info!("[DEBUG] {} items reload skipped: {}", mode, e);
            0
        }
    }
}
