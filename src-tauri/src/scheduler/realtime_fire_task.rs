use crate::core::state::AppState;
use crate::db::table_resolver::TableResolver;
use crate::db::repo_realtime_fire;
use tauri::AppHandle;
use std::sync::Arc;
use tokio::time::{interval, Duration};

pub async fn run_realtime_fire_price_collect_task(_app: AppHandle, state: Arc<AppState>) {
    tracing::info!("Realtime fire price collect task started");
    
    let mut tick = interval(Duration::from_secs(30));
    
    loop {
        tick.tick().await;
        
        let ctx = state.active_context.read().clone();
        let season_id = &ctx.season_id;
        let market_mode = ctx.market_mode.as_str();
        
        tracing::debug!(
            "Collecting realtime fire prices for {}/{}",
            season_id, market_mode
        );
        
        match collect_fire_prices(&state.db, season_id, market_mode).await {
            Ok(count) => {
                if count > 0 {
                    tracing::info!("Collected {} realtime fire prices", count);
                }
            }
            Err(e) => {
                tracing::error!("Failed to collect realtime fire prices: {}", e);
            }
        }
        
        if let Err(e) = repo_realtime_fire::cleanup_old_records(&state.db).await {
            tracing::error!("Failed to cleanup old records: {}", e);
        }
    }
}

async fn collect_fire_prices(
    pool: &sqlx::SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<usize, String> {
    let items_table = TableResolver::items_table(season_id, market_mode);
    let fire_table = TableResolver::fire_price_table(season_id, market_mode);
    let now = chrono::Utc::now().timestamp();
    
    let fire_price: Option<(f64,)> = sqlx::query_as(
        &format!(
            "SELECT rmb_per_10k_fire FROM {} ORDER BY scraped_at DESC LIMIT 1",
            fire_table
        )
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    let fire_per_rmb = fire_price.map(|(rmb,)| 10000.0 / rmb);
    
    let items: Vec<(String, String, f64)> = sqlx::query_as(
        &format!(
            "SELECT item_id, name, price FROM {}",
            items_table
        )
    )
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
    
    repo_realtime_fire::batch_insert_realtime_fire_prices(pool, &records)
        .await
        .map_err(|e| e.to_string())
}