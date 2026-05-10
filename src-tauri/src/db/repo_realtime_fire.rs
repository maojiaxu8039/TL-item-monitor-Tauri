use crate::core::constants::{SECONDS_PER_HOUR, SECONDS_PER_MINUTE};
use crate::core::errors::AppError;
use crate::db::table_resolver::TableResolver;
use chrono::Utc;
use rand::{Rng, SeedableRng};
use serde::Serialize;
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize)]
pub struct FirePriceChangeItem {
    pub item_id: String,
    pub item_name: String,
    pub current_price: f64,
    pub price_3h_ago: Option<f64>,
    pub price_1h_ago: Option<f64>,
    pub price_30m_ago: Option<f64>,
    pub price_5m_ago: Option<f64>,
    pub change_amount_3h: Option<f64>,
    pub change_rate_3h: Option<f64>,
    pub change_rate_5m: Option<f64>,
    pub trend: String,
}

pub async fn insert_realtime_fire_price(
    pool: &SqlitePool,
    item_id: &str,
    item_name: &str,
    fire_price: f64,
    scraped_at: i64,
) -> Result<i64, AppError> {
    let table = TableResolver::realtime_fire_prices_table();
    let now = Utc::now().timestamp();

    let result = sqlx::query(
        &format!(
            "INSERT INTO {} (item_id, item_name, fire_price, scraped_at, created_at) VALUES (?, ?, ?, ?, ?)",
            table
        )
    )
    .bind(item_id)
    .bind(item_name)
    .bind(fire_price)
    .bind(scraped_at)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(result.last_insert_rowid())
}

pub async fn batch_insert_realtime_fire_prices(
    pool: &SqlitePool,
    records: &[(String, String, f64, i64)],
) -> Result<usize, AppError> {
    if records.is_empty() {
        return Ok(0);
    }

    let table = TableResolver::realtime_fire_prices_table();
    let now = Utc::now().timestamp();

    let mut count = 0;
    let mut tx = pool.begin().await?;

    for (item_id, item_name, fire_price, scraped_at) in records {
        sqlx::query(
            &format!(
                "INSERT INTO {} (item_id, item_name, fire_price, scraped_at, created_at) VALUES (?, ?, ?, ?, ?)",
                table
            )
        )
        .bind(item_id)
        .bind(item_name)
        .bind(fire_price)
        .bind(scraped_at)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        count += 1;
    }

    tx.commit().await?;
    Ok(count)
}

pub async fn get_realtime_fire_changes(
    pool: &SqlitePool,
) -> Result<Vec<FirePriceChangeItem>, AppError> {
    let now = Utc::now().timestamp();

    let current_table = TableResolver::item_snapshots_table("ss12", "season_normal");

    let three_hours_ago = now - 3 * SECONDS_PER_HOUR;

    let latest_records: Vec<(String, String, f64, i64)> = sqlx::query_as(&format!(
        r#"
            SELECT item_id, name, fire_price, scraped_at 
            FROM {table} 
            WHERE scraped_at > {cutoff}
            ORDER BY scraped_at DESC
        "#,
        table = current_table,
        cutoff = three_hours_ago
    ))
    .fetch_all(pool)
    .await?;

    if latest_records.is_empty() {
        return Ok(Vec::new());
    }

    let mut latest_by_item: std::collections::HashMap<String, (String, f64, i64)> =
        std::collections::HashMap::new();
    let mut price_3h: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    let mut price_1h: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    let mut price_30m: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    let mut price_5m: std::collections::HashMap<String, f64> = std::collections::HashMap::new();

    for (item_id, item_name, fire_price, scraped_at) in &latest_records {
        if !latest_by_item.contains_key(item_id) {
            latest_by_item.insert(item_id.clone(), (item_name.clone(), *fire_price, *scraped_at));
        }

        let age = now - scraped_at;
        if age >= 150 * SECONDS_PER_MINUTE && !price_3h.contains_key(item_id) {
            price_3h.insert(item_id.clone(), *fire_price);
        }
        if age >= 50 * SECONDS_PER_MINUTE && !price_1h.contains_key(item_id) {
            price_1h.insert(item_id.clone(), *fire_price);
        }
        if age >= 20 * SECONDS_PER_MINUTE && !price_30m.contains_key(item_id) {
            price_30m.insert(item_id.clone(), *fire_price);
        }
        if age >= 4 * SECONDS_PER_MINUTE && !price_5m.contains_key(item_id) {
            price_5m.insert(item_id.clone(), *fire_price);
        }
    }

    let mut result = Vec::new();
    for (item_id, (item_name, current_price, _)) in latest_by_item {
        let price_3h_ago = price_3h.get(&item_id).copied();
        let price_1h_ago = price_1h.get(&item_id).copied();
        let price_30m_ago = price_30m.get(&item_id).copied();
        let price_5m_ago = price_5m.get(&item_id).copied();

        let change_amount_3h = price_3h_ago.map(|p| current_price - p);
        let change_rate_3h = change_amount_3h
            .zip(price_3h_ago)
            .map(|(change, base)| (change / base) * 100.0);

        let change_rate_5m = price_5m_ago.map(|p| {
            let change = current_price - p;
            (change / p) * 100.0
        });

        let change_rate_for_trend = change_rate_5m.or(change_rate_3h);

        let trend = if let Some(rate) = change_rate_for_trend {
            if rate > 5.0 {
                "sharp_rise".to_string()
            } else if rate > 1.0 {
                "rise".to_string()
            } else if rate < -5.0 {
                "sharp_fall".to_string()
            } else if rate < -1.0 {
                "fall".to_string()
            } else {
                "stable".to_string()
            }
        } else {
            "stable".to_string()
        };

        result.push(FirePriceChangeItem {
            item_id,
            item_name,
            current_price,
            price_3h_ago,
            price_1h_ago,
            price_30m_ago,
            price_5m_ago,
            change_amount_3h,
            change_rate_3h,
            change_rate_5m,
            trend,
        });
    }

    result.sort_by(|a, b| {
        let rate_a = a.change_rate_5m.or(a.change_rate_3h).unwrap_or(0.0).abs();
        let rate_b = b.change_rate_5m.or(b.change_rate_3h).unwrap_or(0.0).abs();
        rate_b
            .partial_cmp(&rate_a)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(result)
}

pub async fn cleanup_old_records(pool: &SqlitePool) -> Result<usize, AppError> {
    let table = TableResolver::realtime_fire_prices_table();
    let three_hours_ago = Utc::now().timestamp() - 3 * SECONDS_PER_HOUR;

    let result = sqlx::query(&format!(
        "DELETE FROM {} WHERE scraped_at < {}",
        table, three_hours_ago
    ))
    .execute(pool)
    .await?;

    Ok(result.rows_affected() as usize)
}

pub async fn seed_test_data(pool: &SqlitePool) -> Result<usize, AppError> {
    let table = TableResolver::realtime_fire_prices_table();
    let now = Utc::now().timestamp();

    let items: Vec<(String, String, f64)> =
        sqlx::query_as("SELECT item_id, name, price FROM items_normal LIMIT 100")
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Db(e.to_string()))?;

    if items.is_empty() {
        return Ok(0);
    }

    let mut rng = rand::rngs::StdRng::seed_from_u64(now as u64);
    let mut count = 0;

    for (item_id, item_name, base_price) in &items {
        for minutes_ago in [180, 150, 120, 90, 60, 45, 30, 20, 15, 10, 8, 5, 4, 3, 2, 1] {
            let scraped_at = now - (minutes_ago as i64 * SECONDS_PER_MINUTE);

            let variation = if minutes_ago > 120 {
                rng.gen_range(-0.15..0.20)
            } else if minutes_ago > 60 {
                rng.gen_range(-0.10..0.15)
            } else if minutes_ago > 20 {
                rng.gen_range(-0.08..0.10)
            } else {
                rng.gen_range(-0.05..0.08)
            };

            let fire_price = base_price * (1.0 + variation);

            sqlx::query(
                &format!(
                    "INSERT INTO {} (item_id, item_name, fire_price, scraped_at, created_at) VALUES (?, ?, ?, ?, ?)",
                    table
                )
            )
            .bind(item_id)
            .bind(item_name)
            .bind(fire_price)
            .bind(scraped_at)
            .bind(scraped_at)
            .execute(pool)
            .await
            .map_err(|e| AppError::Db(e.to_string()))?;

            count += 1;
        }
    }

    tracing::info!("Seeded {} realtime fire price records", count);
    Ok(count)
}

pub async fn get_current_fire_price(pool: &SqlitePool) -> Result<f64, AppError> {
    let table = TableResolver::fire_price_table("ss12", "season_normal");

    let record: Option<(f64,)> = sqlx::query_as(&format!(
        "SELECT fire_per_rmb FROM {} ORDER BY scraped_at DESC LIMIT 1",
        table
    ))
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Db(e.to_string()))?;

    match record {
        Some((fire_per_rmb,)) if fire_per_rmb > 0.0 => Ok(fire_per_rmb),
        _ => Ok(0.0),
    }
}
