use crate::db::models::Item;
use crate::core::state::FirePriceSnapshot;
use crate::core::errors::AppError;
use sqlx::{SqlitePool, Row};
use chrono::Utc;
use serde::Serialize;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ItemHistoryRecord {
    pub item_id: String,
    pub season_id: String,
    pub market_mode: String,
    pub fire_price: f64,
    pub scraped_at: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SeasonSummary {
    pub current_fire_price: f64,
    pub item_count: i64,
    pub fire_high_24h: f64,
    pub fire_low_24h: f64,
    pub fire_avg_24h: f64,
}

/// Bulk insert item price snapshots for hourly history.
/// Uses INSERT OR IGNORE to deduplicate by (season_id, item_id, market_mode, snapshot_at).
pub async fn insert_item_price_snapshots(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    items: &[Item],
    snapshot_at: i64,
) -> Result<usize, crate::core::errors::AppError> {
    if items.is_empty() {
        return Ok(0);
    }

    let mut tx = pool.begin().await?;
    let mut inserted = 0usize;

    const BATCH_SIZE: usize = 200;
    for chunk in items.chunks(BATCH_SIZE) {
        let mut qb: sqlx::query_builder::QueryBuilder<sqlx::Sqlite> =
            sqlx::query_builder::QueryBuilder::new(
                "INSERT OR IGNORE INTO item_price_snapshots (item_id, season_id, market_mode, fire_price, scraped_at) "
            );
        let _now = Utc::now().timestamp();
        qb.push_values(chunk, |mut b, item| {
            b.push_bind(&item.item_id)
                .push_bind(season_id)
                .push_bind(market_mode)
                .push_bind(item.price)
                .push_bind(snapshot_at);
        });
        let result = qb.build().execute(&mut *tx).await?;
        inserted += result.rows_affected() as usize;
    }

    tx.commit().await?;
    Ok(inserted)
}

/// Insert a fire price record for hourly snapshot.
/// Uses INSERT OR IGNORE to deduplicate by (season_id, market_mode, scraped_at).
pub async fn insert_fire_snapshot(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    snapshot: &FirePriceSnapshot,
    scraped_at: i64,
) -> Result<(), crate::core::errors::AppError> {
    let now = Utc::now().timestamp();

    sqlx::query(
        r#"INSERT OR IGNORE INTO fire_price_records
           (season_id, market_mode, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#
    )
    .bind(season_id)
    .bind(market_mode)
    .bind(snapshot.rmb_per_10k_fire)
    .bind(snapshot.fire_per_rmb)
    .bind(snapshot.increase_ratio)
    .bind(&snapshot.trading_volume)
    .bind(&snapshot.source)
    .bind(&snapshot.source_time)
    .bind(scraped_at)
    .bind(now)
    .execute(pool)
    .await
    ?;

    Ok(())
}

/// Get item price history from snapshots.
pub async fn get_item_history(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    item_id: &str,
    limit: i64,
) -> Result<Vec<ItemHistoryRecord>, crate::core::errors::AppError> {
    let records = sqlx::query_as::<_, ItemHistoryRecord>(
        "SELECT item_id, season_id, market_mode, fire_price, scraped_at \
         FROM item_price_snapshots \
         WHERE season_id = ? AND market_mode = ? AND item_id = ? \
         ORDER BY scraped_at DESC LIMIT ?"
    )
    .bind(season_id)
    .bind(market_mode)
    .bind(item_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(records)
}

pub async fn insert_item_snapshot(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    item_id: &str,
    name: &str,
    item_type: Option<&str>,
    price: f64,
    last_time: Option<i64>,
    recorded_at: i64,
) -> Result<(), AppError> {
    let now = Utc::now().timestamp();
    
    let result = sqlx::query(
        r#"INSERT INTO item_history (season_id, market_mode, item_id, name, item_type, price, last_time, recorded_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"#
    )
    .bind(season_id)
    .bind(market_mode)
    .bind(item_id)
    .bind(name)
    .bind(item_type)
    .bind(price)
    .bind(last_time)
    .bind(recorded_at)
    .bind(now)
    .execute(pool)
    .await?;
    
    Ok(())
}

/// Get season summary: current fire price, item count, 24h stats.
pub async fn get_season_summary(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<SeasonSummary, crate::core::errors::AppError> {
    let since_24h = Utc::now().timestamp() - 86400;

    let row = sqlx::query_as::<_, SeasonSummary>(
        "SELECT \
            COALESCE((SELECT rmb_per_10k_fire FROM fire_price_records WHERE season_id = ?1 AND market_mode = ?2 ORDER BY scraped_at DESC LIMIT 1), 0.0) as current_fire_price, \
            COALESCE((SELECT COUNT(*) FROM items WHERE season_id = ?1 AND market_mode = ?2), 0) as item_count, \
            COALESCE((SELECT MAX(rmb_per_10k_fire) FROM fire_price_records WHERE season_id = ?1 AND market_mode = ?2 AND scraped_at > ?3), 0.0) as fire_high_24h, \
            COALESCE((SELECT MIN(rmb_per_10k_fire) FROM fire_price_records WHERE season_id = ?1 AND market_mode = ?2 AND scraped_at > ?3), 0.0) as fire_low_24h, \
            COALESCE((SELECT AVG(rmb_per_10k_fire) FROM fire_price_records WHERE season_id = ?1 AND market_mode = ?2 AND scraped_at > ?3), 0.0) as fire_avg_24h"
    )
    .bind(season_id)
    .bind(market_mode)
    .bind(since_24h)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SeasonTrendHour {
    pub hour: String,
    pub avg_fire_price: f64,
    pub max_fire_price: f64,
    pub min_fire_price: f64,
    pub record_count: i64,
}

/// Get season fire price trends aggregated by hour.
pub async fn get_season_trends(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    hours: i64,
) -> Result<Vec<SeasonTrendHour>, crate::core::errors::AppError> {
    let since = Utc::now().timestamp() - hours * 3600;

    let records = sqlx::query_as::<_, SeasonTrendHour>(
        "SELECT \
            strftime('%Y-%m-%d %H:00:00', datetime(scraped_at, 'unixepoch')) as hour, \
            AVG(rmb_per_10k_fire) as avg_fire_price, \
            MAX(rmb_per_10k_fire) as max_fire_price, \
            MIN(rmb_per_10k_fire) as min_fire_price, \
            COUNT(*) as record_count \
         FROM fire_price_records \
         WHERE season_id = ? AND market_mode = ? AND scraped_at > ? \
         GROUP BY hour \
         ORDER BY hour ASC"
    )
    .bind(season_id)
    .bind(market_mode)
    .bind(since)
    .fetch_all(pool)
    .await?;

    Ok(records)
}
