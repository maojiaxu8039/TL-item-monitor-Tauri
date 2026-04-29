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
            _ = abort.recv() => {
                info!("Items reload task received abort");
                break;
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(300)) => {
                let ctx = state.active_context.read().clone();
                let start = std::time::Instant::now();
                match scraper::scrape_items(&ctx.season_id, ctx.market_mode.as_str()).await {
                    Ok(items) => {
                        let duration_ms = start.elapsed().as_millis() as i64;
                        let count = items.len() as i64;

                        if let Err(e) = repo_items::bulk_insert_items(&state.db, &items).await {
                            error!("Failed to bulk-insert items: {}", e);
                            let _ = crate::db::repo_source_diagnostics::upsert_diagnostic(
                                &state.db,
                                "luosi",
                                "api",
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
                                "luosi",
                                "api",
                                true,
                                Some(ctx.market_mode.as_str()),
                                None,
                                true,
                                duration_ms,
                                Some(count),
                                None,
                            ).await;

                            // Update cache
                            {
                                let mut cache = state.items_cache.write();
                                *cache = items;
                            }

                            // Update task status
                            {
                                let mut status = state.task_status.write();
                                status.last_items_reload = Some(now);
                            }

                            // Emit items-updated event
                            let _ = app.emit("items-updated", serde_json::json!({
                                "count": count,
                                "updated_at": now
                            }));

                            info!("Items reload complete: {} items", count);
                        }
                    }
                    Err(e) => {
                        let duration_ms = start.elapsed().as_millis() as i64;
                        let _ = crate::db::repo_source_diagnostics::upsert_diagnostic(
                            &state.db,
                            "luosi",
                            "api",
                            true,
                            Some(ctx.market_mode.as_str()),
                            None,
                            false,
                            duration_ms,
                            None,
                            Some(&e.to_string()),
                        ).await;
                        error!("Items reload failed: {}", e);
                        {
                            let mut status = state.task_status.write();
                            status.last_items_reload = Some(chrono::Utc::now().timestamp());
                        }
                    }
                }
            }
        }
    }
}
