use crate::core::state::AppState;
use crate::db::repo_realtime_fire;
use crate::db::table_resolver::TableResolver;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::broadcast;
use tokio::time::{interval, Duration};

pub async fn run_realtime_fire_price_collect_task(
    _app: AppHandle,
    state: Arc<AppState>,
    mut abort_rx: broadcast::Receiver<()>,
) {
    tracing::info!("Realtime fire price collect task started");

    {
        if let Err(e) = collect_fire_prices_internal(&state.db, &state).await {
            tracing::error!("Initial collection failed: {}", e);
        } else {
            tracing::info!("Initial collection completed");
        }
    }

    let state_clone = state.clone();
    let mut tick = interval(Duration::from_secs(30));

    loop {
        tokio::select! {
            _ = abort_rx.recv() => {
                tracing::info!("Realtime fire price collect task received abort signal");
                break;
            }
            _ = tick.tick() => {
                if let Err(e) = collect_fire_prices_internal(&state_clone.db, &state_clone).await {
                    tracing::error!("Failed to collect realtime fire prices: {}", e);
                }

                if let Err(e) = repo_realtime_fire::cleanup_old_records(&state_clone.db).await {
                    tracing::error!("Failed to cleanup old records: {}", e);
                }
            }
        }
    }

    tracing::info!("Realtime fire price collect task stopped");
}

async fn collect_fire_prices_internal(
    pool: &sqlx::SqlitePool,
    state: &Arc<AppState>,
) -> Result<usize, String> {
    let ctx = state.active_context.read().clone();
    let season_id = &ctx.season_id;
    let market_mode = ctx.market_mode.as_str();

    tracing::debug!(
        "Collecting realtime fire prices for {}/{}",
        season_id,
        market_mode
    );

    let items_table = TableResolver::items_table(season_id, market_mode);
    let fire_table = TableResolver::fire_price_table(season_id, market_mode);
    let now = chrono::Utc::now().timestamp();

    let fire_price: Option<(f64,)> = sqlx::query_as(&format!(
        "SELECT rmb_per_10k_fire FROM {} ORDER BY scraped_at DESC LIMIT 1",
        fire_table
    ))
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let fire_per_rmb = fire_price.map(|(rmb,)| 10000.0 / rmb);

    let items: Vec<(String, String, f64)> =
        sqlx::query_as(&format!("SELECT item_id, name, price FROM {}", items_table))
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;

    if items.is_empty() {
        return Ok(0);
    }

    let records: Vec<(String, String, f64, i64)> = items
        .into_iter()
        .map(|(item_id, name, price)| {
            let price_per_item = fire_per_rmb.map(|fp| price * fp).unwrap_or(price);
            (item_id, name, price_per_item, now)
        })
        .collect();

    let count = repo_realtime_fire::batch_insert_realtime_fire_prices(pool, &records)
        .await
        .map_err(|e| e.to_string())?;

    if count > 0 {
        tracing::info!("Collected {} realtime fire prices", count);
    }

    Ok(count)
}
