//! Database repository for split tables by market mode (normal/expert)
//! 
//! Tables:
//! - fire_price_normal, fire_price_expert
//! - items_normal, items_expert
//! - fire_history_normal, fire_history_expert
//! - items_history_normal, items_history_expert
//! - section_items_normal, section_items_expert

use sqlx::{SqlitePool, Row};
use chrono::Utc;
use uuid::Uuid;

pub enum MarketMode {
    Normal,
    Expert,
}

impl MarketMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            MarketMode::Normal => "normal",
            MarketMode::Expert => "expert",
        }
    }
    
    pub fn from_str(s: &str) -> Self {
        match s {
            "season_expert" => MarketMode::Expert,
            _ => MarketMode::Normal,
        }
    }
    
    pub fn fire_table(&self) -> &'static str {
        match self {
            MarketMode::Normal => "fire_price_normal",
            MarketMode::Expert => "fire_price_expert",
        }
    }
    
    pub fn fire_history_table(&self) -> &'static str {
        match self {
            MarketMode::Normal => "fire_history_normal",
            MarketMode::Expert => "fire_history_expert",
        }
    }
    
    pub fn items_table(&self) -> &'static str {
        match self {
            MarketMode::Normal => "items_normal",
            MarketMode::Expert => "items_expert",
        }
    }
    
    pub fn items_history_table(&self) -> &'static str {
        match self {
            MarketMode::Normal => "items_history_normal",
            MarketMode::Expert => "items_history_expert",
        }
    }
    
    pub fn section_items_table(&self) -> &'static str {
        match self {
            MarketMode::Normal => "section_items_normal",
            MarketMode::Expert => "section_items_expert",
        }
    }
}

// ============= Fire Price =============

pub async fn insert_fire_price(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    rmb_per_10k_fire: f64,
    fire_per_rmb: f64,
    increase_ratio: Option<f64>,
    trading_volume: Option<String>,
    source: &str,
    source_time: Option<String>,
    scraped_at: i64,
) -> Result<(), crate::core::errors::AppError> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.fire_table();
    let now = Utc::now().timestamp();
    
    let query = format!(
        r#"INSERT INTO {} (id, season_id, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        table
    );
    
    sqlx::query(&query)
        .bind(Uuid::new_v4().to_string())
        .bind(season_id)
        .bind(rmb_per_10k_fire)
        .bind(fire_per_rmb)
        .bind(increase_ratio)
        .bind(&trading_volume)
        .bind(source)
        .bind(&source_time)
        .bind(scraped_at)
        .bind(now)
        .execute(pool)
        .await?;
    
    Ok(())
}

pub async fn update_fire_price_current(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    rmb_per_10k_fire: f64,
    fire_per_rmb: f64,
    increase_ratio: Option<f64>,
    trading_volume: Option<String>,
    source: &str,
    source_time: Option<String>,
    scraped_at: i64,
) -> Result<(), crate::core::errors::AppError> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.fire_table();
    let now = Utc::now().timestamp();
    
    let query = format!(
        r#"INSERT OR REPLACE INTO {} (id, season_id, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        table
    );
    
    sqlx::query(&query)
        .bind(Uuid::new_v4().to_string())
        .bind(season_id)
        .bind(rmb_per_10k_fire)
        .bind(fire_per_rmb)
        .bind(increase_ratio)
        .bind(&trading_volume)
        .bind(source)
        .bind(&source_time)
        .bind(scraped_at)
        .bind(now)
        .execute(pool)
        .await?;
    
    Ok(())
}

pub async fn get_fire_price(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Option<serde_json::Value>, crate::core::errors::AppError> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.fire_table();
    
    let query = format!(
        r#"SELECT id, season_id, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, created_at
           FROM {} WHERE season_id = ? ORDER BY scraped_at DESC LIMIT 1"#,
        table
    );
    
    let row: Option<sqlx::sqlite::SqliteRow> = sqlx::query(&query)
        .bind(season_id)
        .fetch_optional(pool)
        .await?;
    
    Ok(row.map(|r| {
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "season_id": r.get::<String, _>("season_id"),
            "rmb_per_10k_fire": r.get::<f64, _>("rmb_per_10k_fire"),
            "fire_per_rmb": r.get::<f64, _>("fire_per_rmb"),
            "increase_ratio": r.get::<Option<f64>, _>("increase_ratio"),
            "trading_volume": r.get::<Option<String>, _>("trading_volume"),
            "source": r.get::<String, _>("source"),
            "source_time": r.get::<Option<String>, _>("source_time"),
            "scraped_at": r.get::<i64, _>("scraped_at"),
            "created_at": r.get::<i64, _>("created_at"),
        })
    }))
}

// ============= Fire History =============

pub async fn insert_fire_history(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    rmb_per_10k_fire: f64,
    fire_per_rmb: f64,
    increase_ratio: Option<f64>,
    trading_volume: Option<String>,
    source: &str,
    source_time: Option<String>,
    recorded_at: i64,
) -> Result<(), crate::core::errors::AppError> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.fire_history_table();
    let now = Utc::now().timestamp();
    
    let query = format!(
        r#"INSERT INTO {} (id, season_id, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, recorded_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        table
    );
    
    sqlx::query(&query)
        .bind(Uuid::new_v4().to_string())
        .bind(season_id)
        .bind(rmb_per_10k_fire)
        .bind(fire_per_rmb)
        .bind(increase_ratio)
        .bind(&trading_volume)
        .bind(source)
        .bind(&source_time)
        .bind(recorded_at)
        .bind(now)
        .execute(pool)
        .await?;
    
    Ok(())
}

pub async fn get_fire_history(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    limit: i32,
) -> Result<Vec<serde_json::Value>, crate::core::errors::AppError> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.fire_history_table();
    
    let query = format!(
        r#"SELECT id, season_id, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, recorded_at, created_at
           FROM {} WHERE season_id = ? ORDER BY recorded_at DESC LIMIT ?"#,
        table
    );
    
    let rows: Vec<sqlx::sqlite::SqliteRow> = sqlx::query(&query)
        .bind(season_id)
        .bind(limit)
        .fetch_all(pool)
        .await?;
    
    let result: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "season_id": r.get::<String, _>("season_id"),
                "rmb_per_10k_fire": r.get::<f64, _>("rmb_per_10k_fire"),
                "fire_per_rmb": r.get::<f64, _>("fire_per_rmb"),
                "increase_ratio": r.get::<Option<f64>, _>("increase_ratio"),
                "trading_volume": r.get::<Option<String>, _>("trading_volume"),
                "source": r.get::<String, _>("source"),
                "source_time": r.get::<Option<String>, _>("source_time"),
                "recorded_at": r.get::<i64, _>("recorded_at"),
                "created_at": r.get::<i64, _>("created_at"),
            })
        })
        .collect();
    
    Ok(result)
}

// ============= Items =============

pub async fn upsert_item(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    item_id: &str,
    name: &str,
    item_type: Option<&str>,
    price: f64,
    last_time: Option<i64>,
) -> Result<(), crate::core::errors::AppError> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.items_table();
    let now = Utc::now().timestamp();
    
    let query = format!(
        r#"INSERT OR REPLACE INTO {} (id, item_id, season_id, name, item_type, price, last_time, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
        table
    );
    
    sqlx::query(&query)
        .bind(Uuid::new_v4().to_string())
        .bind(item_id)
        .bind(season_id)
        .bind(name)
        .bind(item_type.unwrap_or(""))
        .bind(price)
        .bind(last_time)
        .bind(now)
        .execute(pool)
        .await?;
    
    Ok(())
}

pub async fn bulk_upsert_items(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    items: &[(String, String, Option<String>, f64, Option<i64>)],
) -> Result<usize, crate::core::errors::AppError> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.items_table();
    let now = Utc::now().timestamp();
    let mut count = 0;
    
    for (item_id, name, item_type, price, last_time) in items {
        let query = format!(
            r#"INSERT OR REPLACE INTO {} (id, item_id, season_id, name, item_type, price, last_time, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
            table
        );
        
        if sqlx::query(&query)
            .bind(Uuid::new_v4().to_string())
            .bind(item_id)
            .bind(season_id)
            .bind(name)
            .bind(item_type.as_deref().unwrap_or(""))
            .bind(price)
            .bind(last_time)
            .bind(now)
            .execute(pool)
            .await
            .is_ok()
        {
            count += 1;
        }
    }
    
    Ok(count)
}

pub async fn get_item(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    item_id: &str,
) -> Result<Option<serde_json::Value>, crate::core::errors::AppError> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.items_table();
    
    let query = format!(
        r#"SELECT id, item_id, season_id, name, item_type, price, last_time, updated_at
           FROM {} WHERE season_id = ? AND item_id = ?"#,
        table
    );
    
    let row: Option<sqlx::sqlite::SqliteRow> = sqlx::query(&query)
        .bind(season_id)
        .bind(item_id)
        .fetch_optional(pool)
        .await?;
    
    Ok(row.map(|r| {
        serde_json::json!({
            "id": r.get::<String, _>("id"),
            "item_id": r.get::<String, _>("item_id"),
            "season_id": r.get::<String, _>("season_id"),
            "name": r.get::<String, _>("name"),
            "item_type": r.get::<Option<String>, _>("item_type"),
            "price": r.get::<f64, _>("price"),
            "last_time": r.get::<Option<i64>, _>("last_time"),
            "updated_at": r.get::<i64, _>("updated_at"),
        })
    }))
}

pub async fn search_items(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    keyword: &str,
    limit: i32,
) -> Result<Vec<serde_json::Value>, crate::core::errors::AppError> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.items_table();
    
    let query = format!(
        r#"SELECT id, item_id, season_id, name, item_type, price, last_time, updated_at
           FROM {} WHERE season_id = ? AND name LIKE ? LIMIT ?"#,
        table
    );
    
    let search_pattern = format!("%{}%", keyword);
    
    let rows: Vec<sqlx::sqlite::SqliteRow> = sqlx::query(&query)
        .bind(season_id)
        .bind(search_pattern)
        .bind(limit)
        .fetch_all(pool)
        .await?;
    
    let result: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "id": r.get::<String, _>("id"),
                "item_id": r.get::<String, _>("item_id"),
                "season_id": r.get::<String, _>("season_id"),
                "name": r.get::<String, _>("name"),
                "item_type": r.get::<Option<String>, _>("item_type"),
                "price": r.get::<f64, _>("price"),
                "last_time": r.get::<Option<i64>, _>("last_time"),
                "updated_at": r.get::<i64, _>("updated_at"),
            })
        })
        .collect();
    
    Ok(result)
}

pub async fn get_items_count(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<i64, crate::core::errors::AppError> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.items_table();
    
    let query = format!(
        r#"SELECT COUNT(*) as count FROM {} WHERE season_id = ?"#,
        table
    );
    
    let row: sqlx::sqlite::SqliteRow = sqlx::query(&query)
        .bind(season_id)
        .fetch_one(pool)
        .await?;
    
    Ok(row.get::<i64, _>("count"))
}

// ============= Items History =============

pub async fn insert_items_history(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    item_id: &str,
    name: &str,
    item_type: Option<&str>,
    price: f64,
    last_time: Option<i64>,
    recorded_at: i64,
) -> Result<(), crate::core::errors::AppError> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.items_history_table();
    let now = Utc::now().timestamp();
    
    let query = format!(
        r#"INSERT INTO {} (id, item_id, season_id, name, item_type, price, last_time, recorded_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        table
    );
    
    sqlx::query(&query)
        .bind(Uuid::new_v4().to_string())
        .bind(item_id)
        .bind(season_id)
        .bind(name)
        .bind(item_type.unwrap_or(""))
        .bind(price)
        .bind(last_time)
        .bind(recorded_at)
        .bind(now)
        .execute(pool)
        .await?;
    
    Ok(())
}
