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

/// Get all item price history for a season.
pub async fn get_all_item_history(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    hours: i64,
) -> Result<Vec<ItemHistoryRecord>, crate::core::errors::AppError> {
    let since = chrono::Utc::now().timestamp() - hours * 3600;
    let records = sqlx::query_as::<_, ItemHistoryRecord>(
        "SELECT item_id, season_id, market_mode, fire_price, scraped_at \
         FROM item_price_snapshots \
         WHERE season_id = ? AND market_mode = ? AND scraped_at > ? \
         ORDER BY scraped_at DESC"
    )
    .bind(season_id)
    .bind(market_mode)
    .bind(since)
    .fetch_all(pool)
    .await?;
    Ok(records)
}

/// Get item price history by specific season.
pub async fn get_item_history_by_season(
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

#[derive(Debug, Clone, Serialize)]
pub struct ItemPriceCompare {
    pub item_id: String,
    pub name: String,
    pub current_price: f64,
    pub history_price: Option<f64>,
    pub premium_rate: Option<f64>,
    pub price_diff: Option<f64>,
    pub percentile: Option<f64>,
}

/// Get items price comparison between current and history season.
pub async fn get_items_price_compare(
    pool: &SqlitePool,
    current_season: &str,
    history_season: &str,
    market_mode: &str,
) -> Result<Vec<ItemPriceCompare>, crate::core::errors::AppError> {
    // Get current season items
    let current_items: Vec<(String, String, f64)> = sqlx::query_as(
        "SELECT item_id, name, price FROM items WHERE season_id = ? AND market_mode = ?"
    )
    .bind(current_season)
    .bind(market_mode)
    .fetch_all(pool)
    .await?;

    // Get history season snapshots for comparison
    let history_records: Vec<(String, f64)> = sqlx::query_as(
        "SELECT item_id, AVG(fire_price) as avg_price \
         FROM item_price_snapshots \
         WHERE season_id = ? AND market_mode = ? \
         GROUP BY item_id"
    )
    .bind(history_season)
    .bind(market_mode)
    .fetch_all(pool)
    .await?;

    let history_map: std::collections::HashMap<String, f64> = history_records
        .into_iter()
        .collect();

    // Get all history prices for percentile calculation
    let all_history: Vec<(String, f64)> = sqlx::query_as(
        "SELECT item_id, fire_price FROM item_price_snapshots \
         WHERE season_id = ? AND market_mode = ?"
    )
    .bind(history_season)
    .bind(market_mode)
    .fetch_all(pool)
    .await?;

    let mut history_prices_by_item: std::collections::HashMap<String, Vec<f64>> = std::collections::HashMap::new();
    for (item_id, price) in all_history {
        history_prices_by_item.entry(item_id).or_default().push(price);
    }

    let mut result = Vec::new();
    for (item_id, name, current_price) in current_items {
        let history_price = history_map.get(&item_id).copied();
        let premium_rate = history_price.map(|hp| ((current_price - hp) / hp * 100.0));
        let price_diff = history_price.map(|hp| current_price - hp);
        
        // Calculate percentile
        let percentile = if let Some(prices) = history_prices_by_item.get(&item_id) {
            let mut sorted = prices.clone();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let pos = sorted.iter().position(|&p| p >= current_price).unwrap_or(sorted.len());
            Some((pos as f64 / sorted.len() as f64 * 100.0).min(100.0))
        } else {
            None
        };

        result.push(ItemPriceCompare {
            item_id,
            name,
            current_price,
            history_price,
            premium_rate,
            price_diff,
            percentile,
        });
    }

    Ok(result)
}

#[derive(Debug, Clone, Serialize)]
pub struct FirePriceCompareResult {
    pub current_price: f64,
    pub current_day: i64,
    pub current_hour: i64,
    pub history_avg: f64,
    pub history_high: f64,
    pub history_low: f64,
    pub price_level: String,
    pub price_trend: String,
    pub reference_price: f64,
    pub suggested_price: f64,
    pub risk_tip: String,
    pub compare_data: Vec<ComparePoint>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ComparePoint {
    pub day: i64,
    pub hour: i64,
    pub history_price: f64,
    pub current_price: Option<f64>,
}

pub async fn get_fire_price_compare(
    pool: &SqlitePool,
    current_season: &str,
    history_season: &str,
    market_mode: &str,
) -> Result<FirePriceCompareResult, AppError> {
    let now = Utc::now().timestamp();
    let now_chrono = chrono::DateTime::from_timestamp(now, 0).unwrap();
    
    let current_record: Option<(f64, i64)> = sqlx::query_as(
        "SELECT rmb_per_10k_fire, scraped_at FROM fire_price_records \
         WHERE season_id = ? AND market_mode = ? AND scraped_at >= ? \
         ORDER BY scraped_at DESC LIMIT 1"
    )
    .bind(current_season)
    .bind(market_mode)
    .bind(now - 3600)
    .fetch_optional(pool)
    .await?;
    
    let (current_price, current_scraped_at) = if let Some((price, scraped)) = current_record {
        (price, scraped)
    } else {
        return Ok(FirePriceCompareResult {
            current_price: 0.0,
            current_day: 0,
            current_hour: 0,
            history_avg: 0.0,
            history_high: 0.0,
            history_low: 0.0,
            price_level: "无数据".to_string(),
            price_trend: "未知".to_string(),
            reference_price: 0.0,
            suggested_price: 0.0,
            risk_tip: "暂无当前火价数据".to_string(),
            compare_data: vec![],
        });
    };
    
    let current_day = ((current_scraped_at / 86400) % 365) as i64;
    let current_hour = ((current_scraped_at / 3600) % 24) as i64;
    
    let history_records: Vec<(f64, i64, i64)> = sqlx::query_as(
        "SELECT rmb_per_10k_fire, scraped_at FROM fire_price_records \
         WHERE season_id = ? AND market_mode = ? \
         ORDER BY scraped_at ASC"
    )
    .bind(history_season)
    .bind(market_mode)
    .fetch_all(pool)
    .await?;
    
    if history_records.is_empty() {
        return Ok(FirePriceCompareResult {
            current_price,
            current_day,
            current_hour,
            history_avg: 0.0,
            history_high: 0.0,
            history_low: 0.0,
            price_level: "无历史数据".to_string(),
            price_trend: "未知".to_string(),
            reference_price: 0.0,
            suggested_price: 0.0,
            risk_tip: "历史赛季暂无数据".to_string(),
            compare_data: vec![],
        });
    }
    
    let mut same_day_prices: Vec<f64> = vec![];
    let mut same_day_hour_prices: Vec<f64> = vec![];
    let mut all_prices: Vec<f64> = vec![];
    let mut compare_data: Vec<ComparePoint> = vec![];
    
    for (price, scraped, _) in &history_records {
        let day = ((scraped / 86400) % 365) as i64;
        let hour = ((scraped / 3600) % 24) as i64;
        all_prices.push(*price);
        
        if day == current_day {
            same_day_prices.push(*price);
            compare_data.push(ComparePoint {
                day,
                hour,
                history_price: *price,
                current_price: if hour == current_hour { Some(current_price) } else { None },
            });
            
            if hour == current_hour {
                same_day_hour_prices.push(*price);
            }
        }
    }
    
    let history_avg = if all_prices.is_empty() { 0.0 } else { all_prices.iter().sum::<f64>() / all_prices.len() as f64 };
    let history_high = all_prices.iter().cloned().fold(0.0, f64::max);
    let history_low = all_prices.iter().cloned().fold(current_price, f64::min);
    
    let same_day_avg = if same_day_prices.is_empty() { history_avg } else { same_day_prices.iter().sum::<f64>() / same_day_prices.len() as f64 };
    
    let price_level = if current_price > history_high * 1.1 {
        "偏高".to_string()
    } else if current_price < history_low * 0.9 {
        "偏低".to_string()
    } else if current_price > same_day_avg * 1.05 {
        "偏高".to_string()
    } else if current_price < same_day_avg * 0.95 {
        "偏低".to_string()
    } else {
        "正常".to_string()
    };
    
    let (price_trend, trend_change) = if all_prices.len() >= 3 {
        let recent: Vec<f64> = all_prices.iter().rev().take(3).cloned().collect();
        let trend_diff = recent[0] - recent[2];
        if trend_diff > 0.5 {
            ("上涨", trend_diff)
        } else if trend_diff < -0.5 {
            ("下跌", -trend_diff)
        } else {
            ("平稳", 0.0)
        }
    } else {
        ("平稳", 0.0)
    };
    
    let reference_price = same_day_avg;
    let suggested_price = if price_level == "偏高" {
        history_low * 1.05
    } else if price_level == "偏低" {
        current_price * 1.02
    } else {
        current_price
    };
    
    let risk_tip = format!(
        "当前火价 {} 元/10K，较历史{}时段均价 {} 元/10K {}{:.1}%",
        format!("{:.2}", current_price),
        if same_day_hour_prices.is_empty() { "同期" } else { "同时段" },
        format!("{:.2}", same_day_avg),
        if current_price > same_day_avg { "高" } else { "低" },
        ((current_price - same_day_avg) / same_day_avg * 100.0).abs()
    );
    
    Ok(FirePriceCompareResult {
        current_price,
        current_day,
        current_hour,
        history_avg,
        history_high,
        history_low,
        price_level,
        price_trend: price_trend.to_string(),
        reference_price,
        suggested_price,
        risk_tip,
        compare_data,
    })
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
