use crate::core::constants::get_season_start as get_const_season_start;
use crate::db::models::{FirePriceRecord, FirePriceSnapshotRecord};
use crate::db::table_resolver::TableResolver;
use chrono::Utc;
use sqlx::SqlitePool;

/// Fetch season start timestamp from database.
/// Falls back to constant mapping if season not found in DB.
pub async fn get_season_start(
    pool: &SqlitePool,
    season_id: &str,
) -> Result<i64, crate::core::errors::AppError> {
    let started_at: Option<(i64,)> = sqlx::query_as("SELECT started_at FROM seasons WHERE id = ?")
        .bind(season_id)
        .fetch_optional(pool)
        .await?;

    match started_at.map(|(ts,)| ts) {
        Some(ts) => Ok(ts),
        None => {
            tracing::warn!(
                "Season {} not found in seasons table, using fallback from constants",
                season_id
            );
            get_const_season_start(season_id)
                .ok_or_else(|| crate::core::errors::AppError::NotFound(format!("Unknown season: {}", season_id)))
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::core::constants::calculate_season_day;

    #[test]
    fn test_calculate_season_day_ss12() {
        // SS12 start: 2026-04-17 00:00:00 UTC = 1776384000
        let ss12_start = 1776384000i64;

        // Day 1: 2026-04-17 12:00:00 UTC
        let day1 = ss12_start + 12 * 3600;
        assert_eq!(calculate_season_day(day1, ss12_start), 1);

        // Day 16: 2026-05-02 22:56:12 UTC (from DB)
        let day16 = 1777762572i64;
        assert_eq!(calculate_season_day(day16, ss12_start), 16);

        // Day 17: 2026-05-03 20:43:34 UTC (from DB)
        let day17 = 1777841014i64;
        assert_eq!(calculate_season_day(day17, ss12_start), 17);
    }

    #[test]
    fn test_calculate_season_day_ss11() {
        // SS11 start: 2026-01-16 00:00:00 UTC
        let ss11_start = chrono::DateTime::parse_from_rfc3339("2026-01-16T00:00:00+00:00")
            .unwrap()
            .timestamp();

        // Day 1
        let day1 = ss11_start + 12 * 3600;
        assert_eq!(calculate_season_day(day1, ss11_start), 1);

        // Day 30
        let day30 = ss11_start + 29 * 86400 + 12 * 3600;
        assert_eq!(calculate_season_day(day30, ss11_start), 30);
    }
}

pub async fn insert_fire_record(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    snapshot: &crate::core::state::FirePriceSnapshot,
) -> Result<FirePriceRecord, crate::core::errors::AppError> {
    let now = Utc::now().timestamp();
    let table = TableResolver::fire_price_table(season_id, market_mode);

    let result = sqlx::query(
        &format!(
            r#"INSERT OR IGNORE INTO {} (rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
            table
        )
    )
    .bind(snapshot.rmb_per_10k_fire)
    .bind(snapshot.fire_per_rmb)
    .bind(snapshot.increase_ratio)
    .bind(&snapshot.trading_volume)
    .bind(&snapshot.source)
    .bind(&snapshot.source_time)
    .bind(snapshot.scraped_at)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(FirePriceRecord {
        id: result.last_insert_rowid(),
        season_id: season_id.to_string(),
        market_mode: market_mode.to_string(),
        rmb_per_10k_fire: snapshot.rmb_per_10k_fire,
        fire_per_rmb: snapshot.fire_per_rmb,
        increase_ratio: snapshot.increase_ratio,
        trading_volume: snapshot.trading_volume.clone(),
        source: snapshot.source.clone(),
        source_time: snapshot.source_time.clone(),
        scraped_at: snapshot.scraped_at,
        created_at: now,
    })
}

pub async fn get_latest_fire(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Option<FirePriceRecord>, crate::core::errors::AppError> {
    let table = TableResolver::fire_price_table(season_id, market_mode);
    let record: Option<FirePriceRecord> = sqlx::query_as(
        &format!(
            r#"SELECT id, '{}' as season_id, '{}' as market_mode, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, created_at
           FROM {} 
           ORDER BY scraped_at DESC LIMIT 1"#,
            season_id, market_mode, table
        )
    )
    .fetch_optional(pool)
    .await?;
    Ok(record)
}

/// Get fire price history from snapshots table (hourly data).
/// All time ranges use fire_price_snapshots table for consistent hourly data.
pub async fn get_fire_history(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    hours: i64,
) -> Result<Vec<serde_json::Value>, crate::core::errors::AppError> {
    let cutoff = Utc::now().timestamp() - (hours * 3600);
    let table = TableResolver::fire_price_snapshots_table(season_id, market_mode);

    let records: Vec<FirePriceSnapshotRecord> = sqlx::query_as(
        &format!(
            r#"SELECT id, '{}' as season_id, '{}' as market_mode, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day, scraped_at as created_at
           FROM {} 
           WHERE scraped_at >= ? 
           ORDER BY scraped_at DESC"#,
            season_id, market_mode, table
        )
    )
    .bind(cutoff)
    .fetch_all(pool)
    .await?;

    let result: Vec<serde_json::Value> = records
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "id": r.id,
                "season_id": r.season_id,
                "market_mode": r.market_mode,
                "rmb_per_10k_fire": r.rmb_per_10k_fire,
                "fire_per_rmb": r.fire_per_rmb,
                "increase_ratio": r.increase_ratio,
                "scraped_at": r.scraped_at,
                "season_day": r.season_day,
            })
        })
        .collect();

    Ok(result)
}

/// Get all fire price history from snapshots table for a season.
/// Used for historical season comparison - always reads from fire_price_snapshots.
pub async fn get_fire_history_all(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<serde_json::Value>, crate::core::errors::AppError> {
    let table = TableResolver::fire_price_snapshots_table(season_id, market_mode);

    let records: Vec<FirePriceSnapshotRecord> = sqlx::query_as(
        &format!(
            r#"SELECT id, '{}' as season_id, '{}' as market_mode, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day, scraped_at as created_at
           FROM {} 
           ORDER BY scraped_at DESC"#,
            season_id, market_mode, table
        )
    )
    .fetch_all(pool)
    .await?;

    let result: Vec<serde_json::Value> = records
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "id": r.id,
                "season_id": r.season_id,
                "market_mode": r.market_mode,
                "rmb_per_10k_fire": r.rmb_per_10k_fire,
                "fire_per_rmb": r.fire_per_rmb,
                "increase_ratio": r.increase_ratio,
                "scraped_at": r.scraped_at,
                "season_day": r.season_day,
            })
        })
        .collect();

    Ok(result)
}
