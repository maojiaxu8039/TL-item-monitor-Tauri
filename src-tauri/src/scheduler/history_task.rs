use chrono::{Timelike, Utc};
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::time::{interval, Duration};
use tracing::{error, info, warn};

use crate::core::state::AppState;
use crate::db::repo_history;

fn next_hour_timestamp() -> Option<i64> {
    let now = Utc::now();
    let next = (now + chrono::Duration::hours(1))
        .with_minute(0)
        .and_then(|t| t.with_second(0))
        .and_then(|t| t.with_nanosecond(0))?;
    Some(next.timestamp())
}

async fn record_hourly_snapshot(state: &Arc<AppState>, snapshot_at: i64) {
    let ctx = state.active_context.read().clone();
    let fire_opt = state.fire_price.read().clone();
    let items = state.items_cache.read().clone();

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

pub async fn run_hourly_snapshot_task(
    _app: tauri::AppHandle,
    state: Arc<AppState>,
    mut abort: broadcast::Receiver<()>,
) {
    info!("Hourly snapshot task started");

    let next_hour_ts = match next_hour_timestamp() {
        Some(ts) => ts,
        None => {
            error!("Failed to calculate next hour timestamp");
            return;
        }
    };

    let initial_wait = Duration::from_secs(
        (next_hour_ts - Utc::now().timestamp()).max(0) as u64
    );

    info!(
        "Hourly snapshot waiting until: {}",
        chrono::DateTime::from_timestamp(next_hour_ts, 0)
            .map(|t| t.format("%Y-%m-%d %H:%M:%S UTC").to_string())
            .unwrap_or_else(|| "unknown".to_string())
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
        _ = tokio::time::sleep(initial_wait) => {}
    }

    let mut ticker = interval(Duration::from_secs(3600));
    ticker.tick().await;

    let snapshot_at = next_hour_ts;
    record_hourly_snapshot(&state, snapshot_at).await;

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
            _ = ticker.tick() => {
                let snapshot_at = Utc::now()
                    .with_minute(0)
                    .and_then(|t| t.with_second(0))
                    .and_then(|t| t.with_nanosecond(0))
                    .map(|t| t.timestamp())
                    .unwrap_or_else(|| chrono::Utc::now().timestamp());

                record_hourly_snapshot(&state, snapshot_at).await;
            }
        }
    }
}