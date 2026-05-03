use crate::db::models::FirePriceRecord;
use crate::db::table_resolver::TableResolver;
use sqlx::SqlitePool;
use chrono::Utc;

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

pub async fn get_fire_history(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    hours: i64,
) -> Result<Vec<serde_json::Value>, crate::core::errors::AppError> {
    let cutoff = Utc::now().timestamp() - (hours * 3600);
    let table = TableResolver::fire_price_table(season_id, market_mode);

    let records: Vec<FirePriceRecord> = sqlx::query_as(
        &format!(
            r#"SELECT id, '{}' as season_id, '{}' as market_mode, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, created_at
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
            })
        })
        .collect();

    Ok(result)
}
