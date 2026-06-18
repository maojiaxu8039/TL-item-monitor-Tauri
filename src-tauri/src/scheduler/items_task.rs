use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::broadcast;
use tokio::time::{sleep, Duration};
use tracing::{error, info, warn};

use crate::core::state::AppState;
use crate::db::repo_item_realtime_prices;
use crate::db::repo_items;
use crate::scraper;

pub async fn run_items_reload_task(
    app: tauri::AppHandle,
    state: Arc<AppState>,
    mut abort: broadcast::Receiver<()>,
) {
    info!("[ITEMS-TASK] ============== ITEMS RELOAD TASK STARTED ==============");
    info!("[ITEMS-TASK] AppState initialized, beginning task loop");

    let cfg = crate::core::config::load_config().unwrap_or_default();
    info!(
        "[ITEMS-TASK] Loaded config: auto_reload={}, interval={}s, source={}, scrape_normal={}, scrape_expert={}",
        cfg.scrape.auto_reload,
        cfg.scrape.items_reload_interval,
        cfg.scrape.items_source,
        cfg.scrape.items_scrape_normal_enabled,
        cfg.scrape.items_scrape_expert_enabled
    );

    info!("[ITEMS-TASK] Starting main loop");

    let mut first_run = true;
    let mut consecutive_errors = 0u32;
    const MAX_CONSECUTIVE_ERRORS: u32 = 5;
    const MAX_RETRY_DELAY_SECS: u64 = 300;

    loop {
        let loop_start = std::time::Instant::now();
        info!("[ITEMS-TASK] === TOP OF LOOP === (loop iteration)");

        let fresh_config = match crate::core::config::load_config() {
            Ok(cfg) => cfg,
            Err(e) => {
                error!("Failed to load config: {}", e);
                consecutive_errors += 1;
                let retry_delay = retry_delay_secs(consecutive_errors, MAX_RETRY_DELAY_SECS);
                warn!(
                    "[ITEMS-TASK] Config reload failed {} time(s), retrying in {}s",
                    consecutive_errors, retry_delay
                );
                if wait_or_abort(
                    &mut abort,
                    Duration::from_secs(retry_delay),
                    "config reload retry",
                )
                .await
                {
                    break;
                }
                continue;
            }
        };

        info!(
            "[ITEMS-TASK] Checking config: auto_reload={}",
            fresh_config.scrape.auto_reload
        );

        if !fresh_config.scrape.auto_reload {
            info!(
                "[ITEMS-TASK] auto_reload is DISABLED, skipping this tick, will check again in 10s"
            );
            consecutive_errors = 0; // Reset error count on normal flow
            if wait_or_abort(
                &mut abort,
                Duration::from_secs(10),
                "disabled auto_reload check",
            )
            .await
            {
                break;
            }
            continue;
        }

        info!("[ITEMS-TASK] auto_reload is enabled, proceeding with scrape...");

        let current_interval = fresh_config.scrape.items_reload_interval.max(30);
        let items_source = fresh_config.scrape.items_source.clone();
        let json_path = fresh_config.scrape.items_json_path.clone();
        let configured_scrape_normal = fresh_config.scrape.items_scrape_normal_enabled;
        let configured_scrape_expert = fresh_config.scrape.items_scrape_expert_enabled;

        if !first_run {
            let wait_start = std::time::Instant::now();
            info!(
                "[ITEMS-TASK] Waiting {} seconds for next refresh...",
                current_interval
            );
            if wait_or_abort(
                &mut abort,
                Duration::from_secs(current_interval),
                "items refresh interval",
            )
            .await
            {
                break;
            }
            info!(
                "[ITEMS-TASK] Timer complete. Waited {}s, proceeding with refresh...",
                wait_start.elapsed().as_secs()
            );
        } else {
            let ctx = state.active_context.read().clone();
            let cached_item_count = tokio::time::timeout(
                Duration::from_secs(5),
                repo_items::get_items_count(&state.db, &ctx.season_id, ctx.market_mode.as_str()),
            )
            .await;
            match cached_item_count {
                Ok(Ok(count)) if count > 0 => {
                    info!(
                        "[ITEMS-TASK] Database has {} cached items, proceeding with first background refresh",
                        count
                    );
                }
                Ok(Ok(count)) => {
                    info!("[ITEMS-TASK] Database is empty ({} items), proceeding with first scrape immediately", count);
                }
                Ok(Err(e)) => {
                    info!("[ITEMS-TASK] Error checking database: {}, proceeding with first scrape immediately", e);
                }
                Err(_) => {
                    warn!(
                        "[ITEMS-TASK] Cached item count check timed out, proceeding with first scrape"
                    );
                }
            }
            first_run = false;
        }

        let ctx = state.active_context.read().clone();
        let scrape_normal = configured_scrape_normal || ctx.market_mode.as_str() == "season_normal";
        let scrape_expert = configured_scrape_expert || ctx.market_mode.as_str() == "season_expert";
        let season_id = ctx.season_id.clone();
        let market_mode = ctx.market_mode.as_str();

        info!(
            "[ITEMS-TASK] === TICK === auto_reload={}, interval={}s, season={}, market_mode={}",
            fresh_config.scrape.auto_reload,
            fresh_config.scrape.items_reload_interval,
            season_id,
            market_mode
        );

        // Scrape normal mode items
        info!("[ITEMS-TASK] Fetching normal items from {}", items_source);
        let normal_future = async {
            if scrape_normal {
                Some(scrape_for_mode(&season_id, "season_normal", &items_source, &json_path).await)
            } else {
                None
            }
        };
        let expert_future = async {
            if scrape_expert {
                Some(scrape_for_mode(&season_id, "season_expert", &items_source, &json_path).await)
            } else {
                None
            }
        };

        let (normal_result, expert_result) = tokio::join!(normal_future, expert_future);

        // Process normal mode
        let mut attempted_failure = false;
        let normal_count = if let Some(result) = normal_result {
            match &result {
                Ok(items) => {
                    info!("[ITEMS-TASK] Normal items fetched: {} items", items.len());
                }
                Err(e) => {
                    info!("[ITEMS-TASK] Normal items fetch FAILED: {}", e);
                    attempted_failure = true;
                }
            }
            process_scrape_result(&state, &result, &season_id, "season_normal").await
        } else {
            info!("[ITEMS-TASK] Normal mode disabled, skipping normal items");
            0
        };
        info!(
            "[ITEMS-TASK] Normal mode processing complete, count={}",
            normal_count
        );

        // Process expert mode
        let expert_count = if let Some(result) = expert_result {
            match &result {
                Ok(items) => {
                    info!("[ITEMS-TASK] Expert items fetched: {} items", items.len());
                }
                Err(e) => {
                    info!("[ITEMS-TASK] Expert items fetch FAILED: {}", e);
                    attempted_failure = true;
                }
            }
            process_scrape_result(&state, &result, &season_id, "season_expert").await
        } else {
            info!("[ITEMS-TASK] Expert mode disabled, skipping expert items");
            0
        };

        let now = chrono::Utc::now().timestamp();
        let any_success = normal_count > 0 || expert_count > 0;

        // Update cache with current mode items
        if any_success {
            let current_mode = ctx.market_mode.as_str();
            match repo_items::get_items_from_realtime_table(&state.db, &season_id, current_mode)
                .await
            {
                Ok(items) => {
                    let mut cache = state.items_cache.write();
                    *cache = Arc::new(items);
                }
                Err(e) => {
                    warn!("[ITEMS-TASK] Failed to update items cache: {}", e);
                }
            }
        }

        // Emit event if at least one mode succeeded
        if any_success {
            {
                let mut status = state.task_status.write();
                status.last_items_reload = Some(now);
            }
            consecutive_errors = 0;

            if let Err(e) = app.emit(
                "items-updated",
                serde_json::json!({
                    "normal_count": normal_count,
                    "expert_count": expert_count,
                    "updated_at": now
                }),
            ) {
                warn!("[ITEMS-TASK] Failed to emit items-updated event: {}", e);
            }
            info!(
                "Items reload complete: normal={}, expert={}, source={}",
                normal_count, expert_count, items_source
            );
        } else {
            if attempted_failure {
                consecutive_errors += 1;
            }
            warn!(
                "[ITEMS-TASK] Items refresh finished without successful modes; preserving last successful reload timestamp"
            );
        }

        if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
            let retry_delay = retry_delay_secs(consecutive_errors, MAX_RETRY_DELAY_SECS);
            warn!(
                "[ITEMS-TASK] {} consecutive errors; backing off for {}s instead of stopping task",
                consecutive_errors, retry_delay
            );
            if wait_or_abort(
                &mut abort,
                Duration::from_secs(retry_delay),
                "items error backoff",
            )
            .await
            {
                break;
            }
        }

        let total_loop_time = loop_start.elapsed().as_secs();
        info!(
            "[ITEMS-TASK] === LOOP ITERATION COMPLETE === Total loop time: {}s",
            total_loop_time
        );
    }
}

fn retry_delay_secs(consecutive_errors: u32, max_delay_secs: u64) -> u64 {
    let exponent = consecutive_errors.saturating_sub(1).min(4);
    (30u64.saturating_mul(1u64 << exponent)).min(max_delay_secs)
}

async fn scrape_for_mode(
    season_id: &str,
    mode: &str,
    source: &str,
    json_path: &str,
) -> Result<Vec<crate::db::models::Item>, String> {
    if source == "api" {
        info!(
            "[ITEMS-TASK] Fetching {} items from API for {}/{}",
            mode, season_id, mode
        );
        tokio::time::timeout(
            Duration::from_secs(45),
            scraper::scrape_items(season_id, mode),
        )
        .await
        .map_err(|_| format!("API scrape timed out for {} after 45s", mode))?
        .map_err(|e| format!("API scrape failed for {}: {}", mode, e))
    } else {
        info!(
            "[ITEMS-TASK] Loading {} items from JSON for {}/{}",
            mode, season_id, mode
        );
        crate::app::load_items_from_json(season_id, mode, json_path)
            .await
            .map_err(|e| format!("JSON load failed for {}: {}", mode, e))
    }
}

async fn wait_or_abort(
    abort: &mut broadcast::Receiver<()>,
    duration: Duration,
    reason: &str,
) -> bool {
    tokio::select! {
        _ = sleep(duration) => false,
        result = abort.recv() => {
            match result {
                Ok(_) => {
                    info!("[ITEMS-TASK] Abort received during {}, stopping task", reason);
                    true
                }
                Err(broadcast::error::RecvError::Closed) => {
                    info!("[ITEMS-TASK] Abort channel closed during {}, stopping task", reason);
                    true
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    info!("[ITEMS-TASK] Abort receiver lagged during {}, continuing", reason);
                    false
                }
            }
        }
    }
}

async fn process_scrape_result(
    state: &Arc<AppState>,
    result: &Result<Vec<crate::db::models::Item>, String>,
    season_id: &str,
    mode: &str,
) -> i64 {
    let mode_name = if mode == "season_normal" {
        "Normal"
    } else {
        "Expert"
    };

    match result {
        Ok(items) if !items.is_empty() => {
            let count = items.len() as i64;
            info!(
                "[PROCESS] {} mode: {} items to insert into {}/{}",
                mode_name, count, season_id, mode
            );

            match repo_items::bulk_insert_items(&state.db, season_id, mode, items).await {
                Ok(_) => {
                    info!("[PROCESS] {} bulk insert SUCCESS", mode_name);

                    // Also insert realtime prices.
                    if let Err(e) = repo_item_realtime_prices::record_item_prices(
                        &state.db, items, season_id, mode,
                    )
                    .await
                    {
                        error!(
                            "[PROCESS] {} realtime prices insert FAILED: {}",
                            mode_name, e
                        );
                    } else {
                        info!(
                            "[PROCESS] {} realtime prices insert SUCCESS: {} records",
                            mode_name,
                            items.len()
                        );
                    }

                    count
                }
                Err(e) => {
                    error!("[PROCESS] {} bulk insert FAILED: {}", mode_name, e);
                    0
                }
            }
        }
        Ok(_) => {
            info!(
                "[PROCESS] {} mode: No items fetched (empty result)",
                mode_name
            );
            0
        }
        Err(e) => {
            error!("[PROCESS] {} mode: FAILED to fetch items: {}", mode_name, e);
            0
        }
    }
}
