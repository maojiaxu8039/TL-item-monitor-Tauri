//! 数据库操作模块

use sqlx::{SqlitePool, Row};
use serde::Serialize;
use tracing::{info, error};
use uuid::Uuid;

use crate::scraper::{FirePriceSnapshot, Item};

/// 运行数据库迁移
pub async fn run_migrations(pool: &SqlitePool) -> Result<(), String> {
    info!("执行数据库迁移...");

    // 创建表
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS fire_price_hourly (
            id TEXT PRIMARY KEY,
            season_id TEXT NOT NULL,
            market_mode TEXT NOT NULL,
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
    .map_err(|e| format!("创建 fire_price_hourly 表失败: {}", e))?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS items_hourly (
            id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL,
            season_id TEXT NOT NULL,
            market_mode TEXT NOT NULL,
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
    .map_err(|e| format!("创建 items_hourly 表失败: {}", e))?;

    // 创建索引
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_fire_hourly_recorded ON fire_price_hourly(recorded_at)"
    )
    .execute(pool)
    .await
    .ok();

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_items_hourly_recorded ON items_hourly(recorded_at)"
    )
    .execute(pool)
    .await
    .ok();

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_items_hourly_item ON items_hourly(item_id, season_id, market_mode, recorded_at)"
    )
    .execute(pool)
    .await
    .ok();

    info!("数据库迁移完成");
    Ok(())
}

/// 保存火价记录（新增，不去重）
pub async fn insert_fire_record(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    fire: &FirePriceSnapshot,
    recorded_at: i64,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    sqlx::query(
        r#"
        INSERT INTO fire_price_hourly 
        (id, season_id, market_mode, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, recorded_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(season_id)
    .bind(market_mode)
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

/// 保存物品价格记录（新增，不去重）
pub async fn insert_items_record(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    items: &[Item],
    recorded_at: i64,
) -> Result<usize, String> {
    let now = chrono::Utc::now().timestamp();
    let mut count = 0;

    for item in items {
        let id = Uuid::new_v4().to_string();

        if let Err(e) = sqlx::query(
            r#"
            INSERT INTO items_hourly 
            (id, item_id, season_id, market_mode, name, item_type, price, last_time, recorded_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&item.item_id)
        .bind(season_id)
        .bind(market_mode)
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

/// 查询火价历史记录
pub async fn get_fire_history(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    limit: i32,
) -> Result<Vec<FirePriceRecord>, String> {
    let rows = sqlx::query(
        r#"
        SELECT id, season_id, market_mode, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, recorded_at, created_at
        FROM fire_price_hourly
        WHERE season_id = ? AND market_mode = ?
        ORDER BY recorded_at DESC
        LIMIT ?
        "#,
    )
    .bind(season_id)
    .bind(market_mode)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询火价历史失败: {}", e))?;

    let records: Vec<FirePriceRecord> = rows
        .into_iter()
        .map(|row| FirePriceRecord {
            id: row.get("id"),
            season_id: row.get("season_id"),
            market_mode: row.get("market_mode"),
            rmb_per_10k_fire: row.get("rmb_per_10k_fire"),
            fire_per_rmb: row.get("fire_per_rmb"),
            increase_ratio: row.get("increase_ratio"),
            trading_volume: row.get("trading_volume"),
            source: row.get("source"),
            source_time: row.get("source_time"),
            recorded_at: row.get("recorded_at"),
            created_at: row.get("created_at"),
        })
        .collect();

    Ok(records)
}

/// 查询所有火价历史记录（不带 limit）
pub async fn get_fire_history_all(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<FirePriceRecord>, String> {
    let rows = sqlx::query(
        r#"
        SELECT id, season_id, market_mode, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, recorded_at, created_at
        FROM fire_price_hourly
        WHERE season_id = ? AND market_mode = ?
        ORDER BY recorded_at DESC
        "#,
    )
    .bind(season_id)
    .bind(market_mode)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("查询火价历史失败: {}", e))?;

    let records: Vec<FirePriceRecord> = rows
        .into_iter()
        .map(|row| FirePriceRecord {
            id: row.get("id"),
            season_id: row.get("season_id"),
            market_mode: row.get("market_mode"),
            rmb_per_10k_fire: row.get("rmb_per_10k_fire"),
            fire_per_rmb: row.get("fire_per_rmb"),
            increase_ratio: row.get("increase_ratio"),
            trading_volume: row.get("trading_volume"),
            source: row.get("source"),
            source_time: row.get("source_time"),
            recorded_at: row.get("recorded_at"),
            created_at: row.get("created_at"),
        })
        .collect();

    Ok(records)
}

/// 查询物品价格历史
pub async fn get_items_history(
    pool: &SqlitePool,
    item_id: &str,
    season_id: &str,
    market_mode: &str,
    limit: i32,
) -> Result<Vec<ItemPriceRecord>, String> {
    let rows = sqlx::query(
        r#"
        SELECT id, item_id, season_id, market_mode, name, item_type, price, last_time, recorded_at, created_at
        FROM items_hourly
        WHERE item_id = ? AND season_id = ? AND market_mode = ?
        ORDER BY recorded_at DESC
        LIMIT ?
        "#,
    )
    .bind(item_id)
    .bind(season_id)
    .bind(market_mode)
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
            market_mode: row.get("market_mode"),
            name: row.get("name"),
            item_type: row.get("item_type"),
            price: row.get("price"),
            last_time: row.get("last_time"),
            recorded_at: row.get("recorded_at"),
            created_at: row.get("created_at"),
        })
        .collect();

    Ok(records)
}

#[derive(Debug, Clone, Serialize)]
pub struct FirePriceRecord {
    pub id: String,
    pub season_id: String,
    pub market_mode: String,
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
    pub market_mode: String,
    pub name: String,
    pub item_type: String,
    pub price: f64,
    pub last_time: Option<i64>,
    pub recorded_at: i64,
    pub created_at: i64,
}
