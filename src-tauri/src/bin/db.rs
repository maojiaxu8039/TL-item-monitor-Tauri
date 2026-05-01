//! 数据库操作模块 - 分表版本

use sqlx::{SqlitePool, Row};
use serde::Serialize;
use tracing::{info, error};
use uuid::Uuid;

use crate::scraper::{FirePriceSnapshot, Item};

pub enum MarketMode {
    Normal,
    Expert,
}

impl MarketMode {
    pub fn from_str(s: &str) -> Self {
        match s {
            "season_expert" => MarketMode::Expert,
            _ => MarketMode::Normal,
        }
    }
    
    pub fn as_str(&self) -> &'static str {
        match self {
            MarketMode::Normal => "normal",
            MarketMode::Expert => "expert",
        }
    }
    
    pub fn fire_table(&self) -> &'static str {
        match self {
            MarketMode::Normal => "fire_history_normal",
            MarketMode::Expert => "fire_history_expert",
        }
    }
    
    pub fn items_table(&self) -> &'static str {
        match self {
            MarketMode::Normal => "items_history_normal",
            MarketMode::Expert => "items_history_expert",
        }
    }
}

/// 运行数据库迁移
pub async fn run_migrations(pool: &SqlitePool) -> Result<(), String> {
    info!("执行数据库迁移...");
    
    // 创建火价历史表（普通）
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS fire_history_normal (
            id TEXT PRIMARY KEY,
            season_id TEXT NOT NULL,
            rmb_per_10k_fire REAL NOT NULL,
            fire_per_rmb REAL NOT NULL DEFAULT 0,
            increase_ratio REAL,
            trading_volume TEXT,
            source TEXT NOT NULL,
            source_time TEXT,
            recorded_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("创建 fire_history_normal 表失败: {}", e))?;
    
    // 创建火价历史表（专家）
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS fire_history_expert (
            id TEXT PRIMARY KEY,
            season_id TEXT NOT NULL,
            rmb_per_10k_fire REAL NOT NULL,
            fire_per_rmb REAL NOT NULL DEFAULT 0,
            increase_ratio REAL,
            trading_volume TEXT,
            source TEXT NOT NULL,
            source_time TEXT,
            recorded_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("创建 fire_history_expert 表失败: {}", e))?;
    
    // 创建物品历史表（普通）
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS items_history_normal (
            id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL,
            season_id TEXT NOT NULL,
            name TEXT NOT NULL,
            item_type TEXT,
            price REAL NOT NULL DEFAULT 0,
            last_time INTEGER,
            recorded_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("创建 items_history_normal 表失败: {}", e))?;
    
    // 创建物品历史表（专家）
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS items_history_expert (
            id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL,
            season_id TEXT NOT NULL,
            name TEXT NOT NULL,
            item_type TEXT,
            price REAL NOT NULL DEFAULT 0,
            last_time INTEGER,
            recorded_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("创建 items_history_expert 表失败: {}", e))?;
    
    // 创建索引
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_fire_normal_recorded ON fire_history_normal(recorded_at)")
        .execute(pool).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_fire_expert_recorded ON fire_history_expert(recorded_at)")
        .execute(pool).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_items_normal_recorded ON items_history_normal(recorded_at)")
        .execute(pool).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_items_expert_recorded ON items_history_expert(recorded_at)")
        .execute(pool).await.ok();
    
    info!("数据库迁移完成");
    Ok(())
}

/// 保存火价记录（按模式分表）
pub async fn insert_fire_record(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    fire: &FirePriceSnapshot,
    recorded_at: i64,
) -> Result<(), String> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.fire_table();
    let now = chrono::Utc::now().timestamp();
    
    let query = format!(
        r#"
        INSERT INTO {} 
        (id, season_id, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, recorded_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
        table
    );
    
    sqlx::query(&query)
        .bind(Uuid::new_v4().to_string())
        .bind(season_id)
        .bind(fire.rmb_per_10k_fire)
        .bind(fire.fire_per_rmb)
        .bind(fire.increase_ratio)
        .bind(&fire.trading_volume)
        .bind(&fire.source)
        .bind(&fire.source_time)
        .bind(recorded_at)
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| format!("插入火价记录失败: {}", e))?;
    
    info!("火价记录已保存: {} (recorded_at: {})", fire.rmb_per_10k_fire, recorded_at);
    Ok(())
}

/// 保存物品价格记录（按模式分表）
pub async fn insert_items_record(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    items: &[Item],
    recorded_at: i64,
) -> Result<usize, String> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.items_table();
    let now = chrono::Utc::now().timestamp();
    let mut count = 0;
    
    for item in items {
        let query = format!(
            r#"
            INSERT INTO {} 
            (id, item_id, season_id, name, item_type, price, last_time, recorded_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
            table
        );
        
        if let Err(e) = sqlx::query(&query)
            .bind(Uuid::new_v4().to_string())
            .bind(&item.item_id)
            .bind(season_id)
            .bind(&item.name)
            .bind(&item.item_type)
            .bind(item.price)
            .bind(item.last_time)
            .bind(recorded_at)
            .bind(now)
            .execute(pool)
            .await
        {
            error!("插入物品记录失败 {}: {}", item.item_id, e);
        } else {
            count += 1;
        }
    }
    
    info!("已保存 {} 个物品价格记录 (recorded_at: {})", count, recorded_at);
    Ok(count)
}

#[derive(Debug, Clone, Serialize)]
pub struct FirePriceRecord {
    pub id: String,
    pub season_id: String,
    pub rmb_per_10k_fire: f64,
    pub fire_per_rmb: f64,
    pub increase_ratio: f64,
    pub trading_volume: String,
    pub source: String,
    pub source_time: String,
    pub recorded_at: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ItemPriceRecord {
    pub id: String,
    pub item_id: String,
    pub season_id: String,
    pub name: String,
    pub item_type: String,
    pub price: f64,
    pub last_time: Option<i64>,
    pub recorded_at: i64,
    pub created_at: i64,
}

/// 查询火价历史记录（按模式）
pub async fn get_fire_history(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    limit: i32,
) -> Result<Vec<FirePriceRecord>, String> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.fire_table();
    
    let query = format!(
        r#"
        SELECT id, season_id, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, recorded_at, created_at
        FROM {}
        WHERE season_id = ?
        ORDER BY recorded_at DESC
        LIMIT ?
        "#,
        table
    );
    
    let rows = sqlx::query(&query)
        .bind(season_id)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询火价历史失败: {}", e))?;
    
    let mode_str = mode.as_str();
    let records: Vec<FirePriceRecord> = rows
        .into_iter()
        .map(|row| FirePriceRecord {
            id: row.get("id"),
            season_id: row.get("season_id"),
            rmb_per_10k_fire: row.get("rmb_per_10k_fire"),
            fire_per_rmb: row.get("fire_per_rmb"),
            increase_ratio: row.get::<Option<f64>, _>("increase_ratio").unwrap_or(0.0),
            trading_volume: row.get::<Option<String>, _>("trading_volume").unwrap_or_default(),
            source: row.get("source"),
            source_time: row.get::<Option<String>, _>("source_time").unwrap_or_default(),
            recorded_at: row.get("recorded_at"),
            created_at: row.get("created_at"),
        })
        .collect();
    
    let _ = mode_str;
    Ok(records)
}

/// 查询物品价格历史（按模式）
pub async fn get_items_history(
    pool: &SqlitePool,
    item_id: &str,
    season_id: &str,
    market_mode: &str,
    limit: i32,
) -> Result<Vec<ItemPriceRecord>, String> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.items_table();
    
    let query = format!(
        r#"
        SELECT id, item_id, season_id, name, item_type, price, last_time, recorded_at, created_at
        FROM {}
        WHERE item_id = ? AND season_id = ?
        ORDER BY recorded_at DESC
        LIMIT ?
        "#,
        table
    );
    
    let rows = sqlx::query(&query)
        .bind(item_id)
        .bind(season_id)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询物品历史失败: {}", e))?;
    
    let records: Vec<ItemPriceRecord> = rows
        .into_iter()
        .map(|row| ItemPriceRecord {
            id: row.get("id"),
            item_id: row.get("item_id"),
            season_id: row.get("season_id"),
            name: row.get("name"),
            item_type: row.get::<Option<String>, _>("item_type").unwrap_or_default(),
            price: row.get("price"),
            last_time: row.get("last_time"),
            recorded_at: row.get("recorded_at"),
            created_at: row.get("created_at"),
        })
        .collect();
    
    Ok(records)
}
