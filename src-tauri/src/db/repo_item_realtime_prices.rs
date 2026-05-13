use crate::core::constants::SECONDS_PER_HOUR;
use crate::core::errors::AppError;
use serde::Serialize;
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize)]
pub struct ItemRealtimePrice {
    pub item_id: String,
    pub name: String,
    pub fire_price: f64,
    pub scraped_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ItemPriceChange {
    pub item_id: String,
    pub name: String,
    pub current_price: f64,
    pub price_5m_ago: Option<f64>,
    pub price_30m_ago: Option<f64>,
    pub price_1h_ago: Option<f64>,
    pub price_3h_ago: Option<f64>,
    pub change_rate_5m: Option<f64>,
    pub change_rate_30m: Option<f64>,
    pub change_rate_1h: Option<f64>,
    pub change_rate_3h: Option<f64>,
    pub trend: String,
    pub score: f64,
}

pub async fn insert_realtime_price(
    pool: &SqlitePool,
    item_id: &str,
    name: &str,
    fire_price: f64,
    scraped_at: i64,
) -> Result<(), AppError> {
    sqlx::query(
        r#"INSERT INTO item_realtime_prices (item_id, name, fire_price, scraped_at)
           VALUES (?, ?, ?, ?)"#,
    )
    .bind(item_id)
    .bind(name)
    .bind(fire_price)
    .bind(scraped_at)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn batch_insert_realtime_prices(
    pool: &SqlitePool,
    records: &[(String, String, f64, i64)],
) -> Result<usize, AppError> {
    if records.is_empty() {
        return Ok(0);
    }

    let mut inserted = 0usize;
    let mut tx = pool.begin().await?;

    for chunk in records.chunks(2000) {
        let mut query_builder: sqlx::query_builder::QueryBuilder<sqlx::Sqlite> =
            sqlx::query_builder::QueryBuilder::new(
                "INSERT INTO item_realtime_prices (item_id, name, fire_price, scraped_at) ",
            );

        query_builder.push_values(chunk, |mut b, (item_id, name, fire_price, scraped_at)| {
            b.push_bind(item_id)
                .push_bind(name)
                .push_bind(fire_price)
                .push_bind(scraped_at);
        });

        let result = query_builder.build().execute(&mut *tx).await?;
        inserted += result.rows_affected() as usize;
    }

    tx.commit().await?;
    Ok(inserted)
}

pub async fn cleanup_old_records(pool: &SqlitePool) -> Result<usize, AppError> {
    let three_hours_ago = chrono::Utc::now().timestamp() - 3 * SECONDS_PER_HOUR;

    let result = sqlx::query("DELETE FROM item_realtime_prices WHERE scraped_at < ?")
        .bind(three_hours_ago)
        .execute(pool)
        .await?;

    Ok(result.rows_affected() as usize)
}

pub async fn get_price_changes(pool: &SqlitePool) -> Result<Vec<ItemPriceChange>, AppError> {
    let now = chrono::Utc::now().timestamp();
    let cutoff = now - 3 * SECONDS_PER_HOUR;

    let records: Vec<(String, String, f64, i64)> = sqlx::query_as(
        r#"
            SELECT item_id, name, fire_price, scraped_at 
            FROM item_realtime_prices 
            WHERE scraped_at > ?
            ORDER BY scraped_at DESC
        "#,
    )
    .bind(cutoff)
    .fetch_all(pool)
    .await?;

    if records.is_empty() {
        return Ok(Vec::new());
    }

    let mut latest_by_item: std::collections::HashMap<String, (String, f64, i64)> =
        std::collections::HashMap::with_capacity(records.len() / 4);

    // For each item, find the closest price to each time period
    let mut price_5m: std::collections::HashMap<String, (i64, f64)> =
        std::collections::HashMap::with_capacity(records.len() / 4);
    let mut price_30m: std::collections::HashMap<String, (i64, f64)> =
        std::collections::HashMap::with_capacity(records.len() / 4);
    let mut price_1h: std::collections::HashMap<String, (i64, f64)> =
        std::collections::HashMap::with_capacity(records.len() / 4);
    let mut price_3h: std::collections::HashMap<String, (i64, f64)> =
        std::collections::HashMap::with_capacity(records.len() / 4);

    const FIVE_MIN: i64 = 5 * 60;
    const THIRTY_MIN: i64 = 30 * 60;
    const ONE_HOUR: i64 = 60 * 60;
    const THREE_HOUR: i64 = 3 * 60 * 60;

    for (item_id, name, fire_price, scraped_at) in &records {
        latest_by_item
            .entry(item_id.clone())
            .or_insert_with(|| (name.clone(), *fire_price, *scraped_at));

        let age = now - scraped_at;

        // Find closest price for each time period
        let diff_3h = (age - THREE_HOUR).abs();
        if diff_3h <= 1800 {
            // Within 30 minutes of 3h
            price_3h
                .entry(item_id.clone())
                .and_modify(|(existing_diff, _)| {
                    if diff_3h < *existing_diff {
                        *existing_diff = diff_3h;
                    }
                })
                .or_insert((diff_3h, *fire_price));
        }

        let diff_1h = (age - ONE_HOUR).abs();
        if diff_1h <= 900 {
            // Within 15 minutes of 1h
            price_1h
                .entry(item_id.clone())
                .and_modify(|(existing_diff, _)| {
                    if diff_1h < *existing_diff {
                        *existing_diff = diff_1h;
                    }
                })
                .or_insert((diff_1h, *fire_price));
        }

        let diff_30m = (age - THIRTY_MIN).abs();
        if diff_30m <= 600 {
            // Within 10 minutes of 30m
            price_30m
                .entry(item_id.clone())
                .and_modify(|(existing_diff, _)| {
                    if diff_30m < *existing_diff {
                        *existing_diff = diff_30m;
                    }
                })
                .or_insert((diff_30m, *fire_price));
        }

        let diff_5m = (age - FIVE_MIN).abs();
        if diff_5m <= 600 {
            // Within 10 minutes of 5m
            price_5m
                .entry(item_id.clone())
                .and_modify(|(existing_diff, _)| {
                    if diff_5m < *existing_diff {
                        *existing_diff = diff_5m;
                    }
                })
                .or_insert((diff_5m, *fire_price));
        }
    }

    // Convert from (diff, price) to just price
    let price_5m: std::collections::HashMap<String, f64> =
        price_5m.into_iter().map(|(k, v)| (k, v.1)).collect();
    let price_30m: std::collections::HashMap<String, f64> =
        price_30m.into_iter().map(|(k, v)| (k, v.1)).collect();
    let price_1h: std::collections::HashMap<String, f64> =
        price_1h.into_iter().map(|(k, v)| (k, v.1)).collect();
    let price_3h: std::collections::HashMap<String, f64> =
        price_3h.into_iter().map(|(k, v)| (k, v.1)).collect();

    let mut result = Vec::new();
    for (item_id, (name, current_price, _)) in latest_by_item {
        let price_3h_ago = price_3h.get(&item_id).copied();
        let price_1h_ago = price_1h.get(&item_id).copied();
        let price_30m_ago = price_30m.get(&item_id).copied();
        let price_5m_ago = price_5m.get(&item_id).copied();

        let change_rate_3h = calculate_change_rate(current_price, price_3h_ago);
        let change_rate_1h = calculate_change_rate(current_price, price_1h_ago);
        let change_rate_30m = calculate_change_rate(current_price, price_30m_ago);
        let change_rate_5m = calculate_change_rate(current_price, price_5m_ago);

        let trend = determine_trend(
            change_rate_3h,
            change_rate_1h,
            change_rate_30m,
            change_rate_5m,
        );

        let max_change = [
            change_rate_3h.unwrap_or(0.0).abs(),
            change_rate_1h.unwrap_or(0.0).abs(),
            change_rate_30m.unwrap_or(0.0).abs(),
            change_rate_5m.unwrap_or(0.0).abs(),
        ]
        .into_iter()
        .fold(0.0f64, f64::max);

        let score = current_price * max_change / 100.0;

        result.push(ItemPriceChange {
            item_id,
            name,
            current_price,
            price_5m_ago,
            price_30m_ago,
            price_1h_ago,
            price_3h_ago,
            change_rate_5m,
            change_rate_30m,
            change_rate_1h,
            change_rate_3h,
            trend,
            score,
        });
    }

    result.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(result)
}

fn calculate_change_rate(current: f64, past: Option<f64>) -> Option<f64> {
    past.map(|p| ((current - p) / p) * 100.0)
}

fn determine_trend(
    change_3h: Option<f64>,
    change_1h: Option<f64>,
    change_30m: Option<f64>,
    change_5m: Option<f64>,
) -> String {
    let avg_change = match (change_3h, change_1h, change_30m, change_5m) {
        (Some(c3), Some(c1), Some(c30), Some(c5)) => (c3 + c1 + c30 + c5) / 4.0,
        (Some(c3), Some(c1), Some(c30), None) => (c3 + c1 + c30) / 3.0,
        (Some(c3), Some(c1), None, Some(c5)) => (c3 + c1 + c5) / 3.0,
        (Some(c3), Some(c1), None, None) => (c3 + c1) / 2.0,
        (Some(c3), None, Some(c30), Some(c5)) => (c3 + c30 + c5) / 3.0,
        (Some(c3), None, Some(c30), None) => (c3 + c30) / 2.0,
        (Some(c3), None, None, Some(c5)) => (c3 + c5) / 2.0,
        (Some(c3), None, None, None) => c3,
        (None, Some(c1), Some(c30), Some(c5)) => (c1 + c30 + c5) / 3.0,
        (None, Some(c1), Some(c30), None) => (c1 + c30) / 2.0,
        (None, Some(c1), None, Some(c5)) => (c1 + c5) / 2.0,
        (None, Some(c1), None, None) => c1,
        (None, None, Some(c30), Some(c5)) => (c30 + c5) / 2.0,
        (None, None, Some(c30), None) => c30,
        (None, None, None, Some(c5)) => c5,
        (None, None, None, None) => 0.0,
    };

    if avg_change >= 15.0 {
        "sharp_rise".to_string()
    } else if avg_change >= 5.0 {
        "rise".to_string()
    } else if avg_change <= -15.0 {
        "sharp_fall".to_string()
    } else if avg_change <= -5.0 {
        "fall".to_string()
    } else {
        "stable".to_string()
    }
}
