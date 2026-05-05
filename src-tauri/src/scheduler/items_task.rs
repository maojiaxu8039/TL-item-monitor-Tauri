use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::broadcast;
use tracing::{error, info};

use crate::core::state::AppState;
use crate::db::repo_items;
use crate::scraper;

pub async fn run_items_reload_task(
    app: tauri::AppHandle,
    state: Arc<AppState>,
    mut abort: broadcast::Receiver<()>,
) {
    info!("Items reload task started");
    loop {
        tokio::select! {
            result = abort.recv() => {
                match result {
                    Ok(_) => {
                        info!("Items reload task received abort");
                        break;
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        info!("Items reload task abort channel closed, exiting");
                        break;
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        continue;
                    }
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(10)) => {
                let fresh_config = match crate::core::config::load_config() {
                    Ok(cfg) => cfg,
                    Err(e) => {
                        error!("Failed to load config: {}", e);
                        continue;
                    }
                };

                if !fresh_config.scrape.auto_reload {
                    continue;
                }

                let interval_secs = fresh_config.scrape.items_reload_interval.max(60);
                let items_source = fresh_config.scrape.items_source.clone();
                let json_path = fresh_config.scrape.items_json_path.clone();
                let source_name = if items_source == "api" { "luosi" } else { "local_json" };

                let ctx = state.active_context.read().clone();
                let start = std::time::Instant::now();

                let (items_result, source_type) = if items_source == "api" {
                    info!("Auto reload: fetching from API for {}/{:?}", ctx.season_id, ctx.market_mode);
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

                        tokio::time::sleep(std::time::Duration::from_secs(interval_secs as u64)).await;
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

                        tokio::time::sleep(std::time::Duration::from_secs(interval_secs as u64)).await;
                    }
                }
            }
        }
    }
}
