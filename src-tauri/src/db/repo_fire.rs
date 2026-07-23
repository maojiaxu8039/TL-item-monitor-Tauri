use crate::core::constants::{
    get_previous_season_id, get_previous_season_start, get_season_start as get_const_season_start,
    SECONDS_PER_DAY, SECONDS_PER_HOUR,
};
use crate::db::models::{FirePriceRecord, FirePriceSnapshotRecord};
use crate::db::table_resolver::TableResolver;
use chrono::Utc;
use sqlx::SqlitePool;

pub async fn get_season_start(
    pool: &SqlitePool,
    season_id: &str,
) -> Result<i64, crate::core::errors::AppError> {
    get_season_start_from_db(pool, season_id).await
}

pub async fn get_season_start_from_db(
    pool: &SqlitePool,
    season_id: &str,
) -> Result<i64, crate::core::errors::AppError> {
    let started_at: Option<(i64,)> = sqlx::query_as("SELECT started_at FROM seasons WHERE id = ?")
        .bind(season_id)
        .fetch_optional(pool)
        .await?;

    match started_at.map(|(ts,)| ts) {
        Some(ts) if ts > 0 => Ok(ts),
        _ => {
            if let Some(fallback) = get_const_season_start(season_id) {
                tracing::warn!(
                    "Season {} has no valid started_at in DB (using fallback from constants)",
                    season_id
                );
                Ok(fallback)
            } else {
                Err(crate::core::errors::AppError::NotFound(format!(
                    "Unknown season: {}",
                    season_id
                )))
            }
        }
    }
}

pub async fn insert_fire_record(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    snapshot: &crate::core::state::FirePriceSnapshot,
) -> Result<FirePriceRecord, crate::core::errors::AppError> {
    let now = Utc::now().timestamp();
    TableResolver::validate(season_id, market_mode)?;
    let table = TableResolver::fire_price_table(season_id, market_mode);

    let result = sqlx::query(
        &format!(
            r#"INSERT INTO {} (rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(scraped_at) DO UPDATE SET
               rmb_per_10k_fire = excluded.rmb_per_10k_fire,
               fire_per_rmb = excluded.fire_per_rmb,
               increase_ratio = excluded.increase_ratio,
               trading_volume = excluded.trading_volume,
               source = excluded.source,
               source_time = excluded.source_time,
               created_at = excluded.created_at"#,
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
    TableResolver::validate(season_id, market_mode)?;
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
    TableResolver::validate(season_id, market_mode)?;
    let table = TableResolver::fire_price_snapshots_table(season_id, market_mode);

    let records: Vec<FirePriceSnapshotRecord> = sqlx::query_as(
        &format!(
            r#"SELECT id, '{}' as season_id, '{}' as market_mode, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day, scraped_at as created_at
           FROM {}
           WHERE scraped_at >= ?
           ORDER BY scraped_at ASC"#,
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

pub async fn get_previous_season_fire_by_season_day(
    pool: &SqlitePool,
    current_season_id: &str,
    market_mode: &str,
    current_season_day: i32,
    current_hour: i32,
) -> Result<Option<FirePriceRecord>, crate::core::errors::AppError> {
    let Some(prev_season_id) = get_previous_season_id(current_season_id) else {
        tracing::debug!("No previous season for {}", current_season_id);
        return Ok(None);
    };

    let Some(prev_season_start) = get_previous_season_start(current_season_id) else {
        tracing::debug!("No previous season start for {}", current_season_id);
        return Ok(None);
    };

    let prev_season_day = current_season_day;
    let prev_day_start = prev_season_start + (prev_season_day as i64 - 1) * SECONDS_PER_DAY;

    let hour_start = prev_day_start + (current_hour as i64) * SECONDS_PER_HOUR;
    let hour_end = hour_start + SECONDS_PER_HOUR;

    TableResolver::validate(prev_season_id, market_mode)?;

    let prev_table = TableResolver::fire_price_snapshots_table(prev_season_id, market_mode);

    let record: Option<FirePriceRecord> = sqlx::query_as(
        &format!(
            r#"SELECT id, '{}' as season_id, '{}' as market_mode, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, created_at
           FROM {}
           WHERE scraped_at >= ? AND scraped_at < ?
           ORDER BY scraped_at DESC LIMIT 1"#,
            prev_season_id, market_mode, prev_table
        )
    )
    .bind(hour_start)
    .bind(hour_end)
    .fetch_optional(pool)
    .await?;

    Ok(record)
}

pub async fn get_previous_season_fire_nearest(
    pool: &SqlitePool,
    current_season_id: &str,
    market_mode: &str,
    current_season_day: i32,
) -> Result<Option<FirePriceRecord>, crate::core::errors::AppError> {
    let Some(prev_season_id) = get_previous_season_id(current_season_id) else {
        tracing::debug!("No previous season for {}", current_season_id);
        return Ok(None);
    };

    let Some(prev_season_start) = get_previous_season_start(current_season_id) else {
        tracing::debug!("No previous season start for {}", current_season_id);
        return Ok(None);
    };

    let prev_season_day = current_season_day;
    let target_time =
        prev_season_start + (prev_season_day as i64 - 1) * SECONDS_PER_DAY + SECONDS_PER_HOUR;

    TableResolver::validate(prev_season_id, market_mode)?;

    let prev_table = TableResolver::fire_price_snapshots_table(prev_season_id, market_mode);

    let record: Option<FirePriceRecord> = sqlx::query_as(
        &format!(
            r#"SELECT id, '{}' as season_id, '{}' as market_mode, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, created_at
           FROM {}
           ORDER BY ABS(scraped_at - ?) ASC LIMIT 1"#,
            prev_season_id, market_mode, prev_table
        )
    )
    .bind(target_time)
    .fetch_optional(pool)
    .await?;

    Ok(record)
}

pub async fn get_fire_history_all(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    limit: i32,
    offset: i32,
) -> Result<Vec<serde_json::Value>, crate::core::errors::AppError> {
    TableResolver::validate(season_id, market_mode)?;
    let table = TableResolver::fire_price_snapshots_table(season_id, market_mode);

    let records: Vec<FirePriceSnapshotRecord> = sqlx::query_as(
        &format!(
            r#"SELECT id, '{}' as season_id, '{}' as market_mode, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day, scraped_at as created_at
           FROM {}
           ORDER BY scraped_at DESC
           LIMIT ?
           OFFSET ?"#,
            season_id, market_mode, table
        )
    )
    .bind(limit)
    .bind(offset)
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

/// Return at most one (the latest) fire-price sample for each season-day/hour bucket.
/// Hour buckets are absolute Unix hours; `season_day` provides the Beijing-day boundary.
pub async fn get_fire_history_hourly(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<serde_json::Value>, crate::core::errors::AppError> {
    TableResolver::validate(season_id, market_mode)?;
    let table = TableResolver::fire_price_snapshots_table(season_id, market_mode);
    let season_start = get_season_start_from_db(pool, season_id).await?;
    let records: Vec<FirePriceSnapshotRecord> = sqlx::query_as(&format!(
        r#"SELECT id, season_id, market_mode, rmb_per_10k_fire, fire_per_rmb,
                  increase_ratio, trading_volume, source, source_time, scraped_at,
                  season_day, created_at
           FROM (
             SELECT id, '{}' AS season_id, '{}' AS market_mode,
                    rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume,
                    source, source_time, scraped_at, season_day, scraped_at AS created_at,
                    ROW_NUMBER() OVER (
                      PARTITION BY season_day, CAST(scraped_at / 3600 AS INTEGER)
                      ORDER BY scraped_at DESC, id DESC
                    ) AS bucket_rank
             FROM {}
             WHERE scraped_at >= ?
               AND rmb_per_10k_fire > 0
               AND fire_per_rmb > 0
               AND ABS(rmb_per_10k_fire * fire_per_rmb - 10000.0) <= 100.0
           ) ranked
           WHERE bucket_rank = 1
           ORDER BY season_day ASC, scraped_at ASC"#,
        season_id, market_mode, table
    ))
    .bind(season_start)
    .fetch_all(pool)
    .await?;

    Ok(records
        .into_iter()
        .map(|r| serde_json::to_value(r).unwrap_or_default())
        .collect())
}

#[cfg(test)]
mod tests {
    use crate::core::constants::calculate_season_day;
    use sqlx::sqlite::SqlitePoolOptions;

    #[test]
    fn test_calculate_season_day_ss12() {
        let ss12_start = crate::core::constants::SS12_START_TIMESTAMP;
        assert_eq!(calculate_season_day(ss12_start, ss12_start), 1);
        assert_eq!(calculate_season_day(ss12_start + 86400, ss12_start), 2);
        assert_eq!(calculate_season_day(ss12_start - 86400, ss12_start), 1);
    }

    #[test]
    fn test_calculate_season_day_ss11() {
        let ss11_start = 1768521600i64;
        assert_eq!(calculate_season_day(ss11_start, ss11_start), 1);
        assert_eq!(calculate_season_day(ss11_start + 12 * 3600, ss11_start), 1);
        assert_eq!(
            calculate_season_day(ss11_start + 29 * 86400, ss11_start),
            30
        );
    }

    #[tokio::test]
    async fn hourly_history_keeps_latest_sample_per_bucket() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(":memory:")
            .await
            .expect("memory database should connect");
        sqlx::query("CREATE TABLE seasons (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL)")
            .execute(&pool)
            .await
            .expect("seasons table should be created");
        sqlx::query("INSERT INTO seasons (id, started_at) VALUES ('ss12', 100)")
            .execute(&pool)
            .await
            .expect("season should insert");
        sqlx::query(
            "CREATE TABLE fire_price_snapshots_ss12_normal (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rmb_per_10k_fire REAL NOT NULL,
                fire_per_rmb REAL NOT NULL,
                increase_ratio REAL,
                trading_volume TEXT,
                source TEXT NOT NULL,
                source_time TEXT,
                scraped_at INTEGER NOT NULL,
                season_day INTEGER NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .expect("snapshot table should be created");
        for (price, timestamp, day) in [
            (99.0, 50_i64, 1_i32),
            (20.0, 100, 1),
            (22.0, 200, 1),
            (30.0, 4000, 1),
        ] {
            sqlx::query(
                "INSERT INTO fire_price_snapshots_ss12_normal
                 (rmb_per_10k_fire, fire_per_rmb, source, scraped_at, season_day)
                 VALUES (?, ?, 'test', ?, ?)",
            )
            .bind(price)
            .bind(10_000.0 / price)
            .bind(timestamp)
            .bind(day)
            .execute(&pool)
            .await
            .expect("sample should insert");
        }

        let rows = super::get_fire_history_hourly(&pool, "ss12", "season_normal")
            .await
            .expect("hourly query should succeed");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0]["rmb_per_10k_fire"], 22.0);
        assert_eq!(rows[1]["rmb_per_10k_fire"], 30.0);
    }
}
