use std::sync::Arc;
use tokio::sync::broadcast;
use chrono::Timelike;
use tracing::{error, info, warn};

use crate::core::state::AppState;
use crate::db::repo_history;

/// Hourly snapshot task: records fire price and all items at the top of each hour.
pub async fn run_hourly_snapshot_task(
    _app: tauri::AppHandle,
    state: Arc<AppState>,
    mut abort: broadcast::Receiver<()>,
) {
    info!("Hourly snapshot task started");

    // Sleep until the next top of hour
    let now = chrono::Utc::now();
    let next_hour = (now + chrono::Duration::hours(1))
        .with_minute(0).unwrap()
        .with_second(0).unwrap()
        .with_nanosecond(0).unwrap();
    let initial_sleep = (next_hour - now).to_std().unwrap_or(std::time::Duration::from_secs(0));

    info!("Hourly snapshot waiting until: {}", next_hour.format("%Y-%m-%d %H:%M:%S UTC"));

    tokio::select! {
        _ = abort.recv() => {
            info!("Hourly snapshot task aborted during initial wait");
            return;
        }
        _ = tokio::time::sleep(initial_sleep) => {}
    }

    loop {
        tokio::select! {
            _ = abort.recv() => {
                info!("Hourly snapshot task received abort");
                break;
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(3600)) => {
                let snapshot_at = chrono::Utc::now()
                    .with_minute(0).unwrap()
                    .with_second(0).unwrap()
                    .with_nanosecond(0).unwrap()
                    .timestamp();

                // Read consistent snapshot from state
                let ctx = state.active_context.read().clone();
                let fire_opt = state.fire_price.read().clone();
                let items = state.items_cache.read().clone();

                // Record fire price snapshot (deduplicated)
                if let Some(ref fire) = fire_opt {
                    if let Err(e) = repo_history::insert_fire_snapshot(
                        &state.db,
                        &ctx.season_id,
                        ctx.market_mode.as_str(),
                        fire,
                        snapshot_at,
                    ).await {
                        warn!("Hourly fire snapshot failed: {}", e);
                    } else {
                        info!("Hourly fire snapshot recorded at {}", snapshot_at);
                    }
                }

                // Record item price snapshots (deduplicated)
                if !items.is_empty() {
                    match repo_history::insert_item_price_snapshots(
                        &state.db,
                        &ctx.season_id,
                        ctx.market_mode.as_str(),
                        &items,
                        snapshot_at,
                    ).await {
                        Ok(count) => {
                            info!("Hourly item snapshot recorded: {} items at {}", count, snapshot_at);
                        }
                        Err(e) => {
                            error!("Hourly item snapshot failed: {}", e);
                        }
                    }
                }
            }
        }
    }
}
