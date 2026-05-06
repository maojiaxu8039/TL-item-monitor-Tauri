use chrono::Timelike;
use std::sync::Arc;
use tokio::sync::broadcast;
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
    let next_hour = match (now + chrono::Duration::hours(1))
        .with_minute(0)
        .and_then(|t| t.with_second(0))
        .and_then(|t| t.with_nanosecond(0))
    {
        Some(t) => t,
        None => {
            error!("Failed to calculate next hour timestamp");
            return;
        }
    };
    let initial_sleep = (next_hour - now)
        .to_std()
        .unwrap_or(std::time::Duration::from_secs(0));

    info!(
        "Hourly snapshot waiting until: {}",
        next_hour.format("%Y-%m-%d %H:%M:%S UTC")
    );

    tokio::select! {
        result = abort.recv() => {
            match result {
                Ok(_) => info!("Hourly snapshot task aborted during initial wait"),
                Err(broadcast::error::RecvError::Closed) => info!("Hourly snapshot task abort channel closed during initial wait"),
                Err(broadcast::error::RecvError::Lagged(_)) => {}
            }
            return;
        }
        _ = tokio::time::sleep(initial_sleep) => {}
    }

    loop {
        tokio::select! {
            result = abort.recv() => {
                match result {
                    Ok(_) => {
                        info!("Hourly snapshot task received abort");
                        break;
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        info!("Hourly snapshot task abort channel closed, exiting");
                        break;
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        continue;
                    }
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(3600)) => {
                let snapshot_at = match chrono::Utc::now()
                    .with_minute(0)
                    .and_then(|t| t.with_second(0))
                    .and_then(|t| t.with_nanosecond(0)) {
                    Some(t) => t.timestamp(),
                    None => {
                        error!("Failed to calculate snapshot timestamp");
                        continue;
                    }
                };

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
