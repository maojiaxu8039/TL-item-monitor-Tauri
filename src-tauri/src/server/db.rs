//! 数据库操作模块 - 与客户端一致的表结构
//! 
//! 表结构设计：
//! - fire_price_snapshots_{season}_{mode}: 火价快照，按赛季和模式分表
//! - item_snapshots_{season}_{mode}: 物品价格快照，按赛季和模式分表

use sqlx::{SqlitePool, Row};
use serde::Serialize;
use tracing::{info, error};

use super::scraper::{FirePriceSnapshot, Item};

#[derive(Debug, Clone)]
pub enum MarketMode {
    Normal,
    Expert,
}

impl MarketMode {
    pub fn from_str(s: &str) -> Self {
        match s {
            "season_expert" | "expert" => MarketMode::Expert,
            _ => MarketMode::Normal,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            MarketMode::Normal => "normal",
            MarketMode::Expert => "expert",
        }
    }

    pub fn fire_table(&self, season_id: &str) -> String {
        format!("fire_price_snapshots_{}_{}", season_id, self.as_str())
    }

    pub fn items_table(&self, season_id: &str) -> String {
        format!("item_snapshots_{}_{}", season_id, self.as_str())
    }
}

/// 计算赛季天数 (从赛季开始到指定时间戳的天数)
fn calculate_season_day(season_start: i64, recorded_at: i64) -> i32 {
    let diff_seconds = recorded_at - season_start;
    let days = diff_seconds / 86400;
    (days + 1) as i32
}

/// 获取赛季开始时间戳（从数据库查询，失败时回退到硬编码）
async fn get_season_start(pool: &SqlitePool, season_id: &str) -> i64 {
    let started_at: Option<(i64,)> = sqlx::query_as(
        "SELECT started_at FROM seasons WHERE id = ?"
    )
    .bind(season_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    started_at.map(|(ts,)| ts).unwrap_or_else(|| {
        match season_id {
            "ss12" => 1776384000,
            "ss11" => 1768521600,
            _ => 1776384000,
        }
    })
}

/// 运行数据库迁移
pub async fn run_migrations(pool: &SqlitePool) -> Result<(), String> {
    info!("执行数据库迁移...");

    // 为每个赛季创建火价快照表（普通）
    for season in ["ss12", "ss11"] {
        let table = format!("fire_price_snapshots_{}_normal", season);
        sqlx::query(&format!(
            r#"
            CREATE TABLE IF NOT EXISTS {} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rmb_per_10k_fire REAL NOT NULL,
                fire_per_rmb REAL NOT NULL DEFAULT 0,
                increase_ratio REAL,
                trading_volume TEXT,
                source TEXT NOT NULL DEFAULT '',
                source_time TEXT,
                scraped_at INTEGER NOT NULL,
                season_day INTEGER NOT NULL DEFAULT 1,
                UNIQUE(scraped_at)
            )
            "#,
            table
        ))
        .execute(pool)
        .await
        .map_err(|e| format!("创建 {} 表失败: {}", table, e))?;

        // 物品快照表（普通）
        let items_table = format!("item_snapshots_{}_normal", season);
        sqlx::query(&format!(
            r#"
            CREATE TABLE IF NOT EXISTS {} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id TEXT NOT NULL,
                fire_price REAL NOT NULL,
                scraped_at INTEGER NOT NULL,
                season_day INTEGER NOT NULL DEFAULT 1,
                UNIQUE(item_id, scraped_at)
            )
            "#,
            items_table
        ))
        .execute(pool)
        .await
        .map_err(|e| format!("创建 {} 表失败: {}", items_table, e))?;

        // 火价快照表（专家）
        let expert_table = format!("fire_price_snapshots_{}_expert", season);
        sqlx::query(&format!(
            r#"
            CREATE TABLE IF NOT EXISTS {} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rmb_per_10k_fire REAL NOT NULL,
                fire_per_rmb REAL NOT NULL DEFAULT 0,
                increase_ratio REAL,
                trading_volume TEXT,
                source TEXT NOT NULL DEFAULT '',
                source_time TEXT,
                scraped_at INTEGER NOT NULL,
                season_day INTEGER NOT NULL DEFAULT 1,
                UNIQUE(scraped_at)
            )
            "#,
            expert_table
        ))
        .execute(pool)
        .await
        .map_err(|e| format!("创建 {} 表失败: {}", expert_table, e))?;

        // 物品快照表（专家）
        let expert_items_table = format!("item_snapshots_{}_expert", season);
        sqlx::query(&format!(
            r#"
            CREATE TABLE IF NOT EXISTS {} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id TEXT NOT NULL,
                fire_price REAL NOT NULL,
                scraped_at INTEGER NOT NULL,
                season_day INTEGER NOT NULL DEFAULT 1,
                UNIQUE(item_id, scraped_at)
            )
            "#,
            expert_items_table
        ))
        .execute(pool)
        .await
        .map_err(|e| format!("创建 {} 表失败: {}", expert_items_table, e))?;

        // 创建索引
        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS idx_{}_scraped ON {}(scraped_at)",
            table.replace("-", "_"), table
        ))
        .execute(pool).await.ok();
        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS idx_{}_item_scraped ON {}(item_id, scraped_at)",
            items_table.replace("-", "_"), items_table
        ))
        .execute(pool).await.ok();
        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS idx_{}_scraped ON {}(scraped_at)",
            expert_table.replace("-", "_"), expert_table
        ))
        .execute(pool).await.ok();
        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS idx_{}_item_scraped ON {}(item_id, scraped_at)",
            expert_items_table.replace("-", "_"), expert_items_table
        ))
        .execute(pool).await.ok();

        info!("已创建/验证赛季 {} 的表结构", season);
    }

    info!("数据库迁移完成");
    Ok(())
}

/// 保存火价快照（按赛季+模式分表）
pub async fn insert_fire_snapshot(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    fire: &FirePriceSnapshot,
    scraped_at: i64,
) -> Result<(), String> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.fire_table(season_id);
    let season_start = get_season_start(pool, season_id).await;
    let season_day = calculate_season_day(season_start, scraped_at);

    sqlx::query(&format!(
        r#"
        INSERT OR IGNORE INTO {}
        (rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#,
        table
    ))
    .bind(fire.rmb_per_10k_fire)
    .bind(fire.fire_per_rmb)
    .bind(fire.increase_ratio)
    .bind(&fire.trading_volume)
    .bind(&fire.source)
    .bind(&fire.source_time)
    .bind(scraped_at)
    .bind(season_day)
    .execute(pool)
    .await
    .map_err(|e| format!("插入火价快照失败: {}", e))?;

    info!("火价快照已保存: {} (scraped_at: {}, season_day: {})", fire.rmb_per_10k_fire, scraped_at, season_day);
    Ok(())
}

/// 保存物品价格快照（按赛季+模式分表）
pub async fn insert_items_snapshots(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    fire_per_rmb: f64,
    items: &[Item],
    scraped_at: i64,
) -> Result<usize, String> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.items_table(season_id);
    let season_start = get_season_start(pool, season_id).await;
    let season_day = calculate_season_day(season_start, scraped_at);
    let mut count = 0;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    for item in items {
        let fire_price = item.price * fire_per_rmb;

        if let Err(e) = sqlx::query(&format!(
            r#"
            INSERT OR IGNORE INTO {}
            (item_id, fire_price, scraped_at, season_day)
            VALUES (?, ?, ?, ?)
            "#,
            table
        ))
        .bind(&item.item_id)
        .bind(fire_price)
        .bind(scraped_at)
        .bind(season_day)
        .execute(&mut *tx)
        .await
        {
            error!("插入物品快照失败 {}: {}", item.item_id, e);
        } else {
            count += 1;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    info!("已保存 {} 个物品价格快照 (scraped_at: {}, season_day: {})", count, scraped_at, season_day);
    Ok(count)
}

#[derive(Debug, Clone, Serialize)]
pub struct FireSnapshotRecord {
    pub rmb_per_10k_fire: f64,
    pub fire_per_rmb: f64,
    pub increase_ratio: f64,
    pub trading_volume: String,
    pub source: String,
    pub source_time: String,
    pub scraped_at: i64,
    pub season_day: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ItemSnapshotRecord {
    pub item_id: String,
    pub fire_price: f64,
    pub scraped_at: i64,
    pub season_day: i32,
}

/// 查询火价快照历史（按模式）
pub async fn get_fire_history(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    limit: i32,
) -> Result<Vec<FireSnapshotRecord>, String> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.fire_table(season_id);

    let query = format!(
        r#"
        SELECT rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day
        FROM {}
        ORDER BY scraped_at DESC
        LIMIT ?
        "#,
        table
    );

    let rows = sqlx::query(&query)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询火价快照失败: {}", e))?;

    let records: Vec<FireSnapshotRecord> = rows
        .into_iter()
        .map(|row| FireSnapshotRecord {
            rmb_per_10k_fire: row.get("rmb_per_10k_fire"),
            fire_per_rmb: row.get("fire_per_rmb"),
            increase_ratio: row.get::<Option<f64>, _>("increase_ratio").unwrap_or(0.0),
            trading_volume: row.get::<Option<String>, _>("trading_volume").unwrap_or_default(),
            source: row.get("source"),
            source_time: row.get::<Option<String>, _>("source_time").unwrap_or_default(),
            scraped_at: row.get("scraped_at"),
            season_day: row.get("season_day"),
        })
        .collect();

    Ok(records)
}

/// 初始化新赛季的数据库表
pub async fn init_new_season(
    pool: &SqlitePool,
    season_id: &str,
    season_name: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut created_tables = Vec::new();

    for mode in ["normal", "expert"] {
        let fire_table = format!("fire_price_snapshots_{}_{}", season_id, mode);
        let items_table = format!("item_snapshots_{}_{}", season_id, mode);

        sqlx::query(&format!(
            r#"
            CREATE TABLE IF NOT EXISTS {} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rmb_per_10k_fire REAL NOT NULL,
                fire_per_rmb REAL NOT NULL DEFAULT 0,
                increase_ratio REAL,
                trading_volume TEXT,
                source TEXT NOT NULL DEFAULT '',
                source_time TEXT,
                scraped_at INTEGER NOT NULL,
                season_day INTEGER NOT NULL DEFAULT 1,
                UNIQUE(scraped_at)
            )
            "#,
            fire_table
        ))
        .execute(pool)
        .await
        .map_err(|e| format!("创建火价表失败: {}", e))?;
        created_tables.push(fire_table);

        sqlx::query(&format!(
            r#"
            CREATE TABLE IF NOT EXISTS {} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id TEXT NOT NULL,
                fire_price REAL NOT NULL,
                scraped_at INTEGER NOT NULL,
                season_day INTEGER NOT NULL DEFAULT 1,
                UNIQUE(item_id, scraped_at)
            )
            "#,
            items_table
        ))
        .execute(pool)
        .await
        .map_err(|e| format!("创建物品表失败: {}", e))?;
        created_tables.push(items_table);
    }

    info!("新赛季 {} 已初始化，创建了 {} 张表", season_id, created_tables.len());
    Ok(created_tables)
}

/// 查询所有火价快照历史（不分页，用于数据同步）
pub async fn get_fire_history_all(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    _limit: i32,
) -> Result<Vec<FireSnapshotRecord>, String> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.fire_table(season_id);

    let query = format!(
        r#"
        SELECT rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day
        FROM {}
        ORDER BY scraped_at DESC
        "#,
        table
    );

    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询火价快照失败: {}", e))?;

    let records: Vec<FireSnapshotRecord> = rows
        .into_iter()
        .map(|row| FireSnapshotRecord {
            rmb_per_10k_fire: row.get("rmb_per_10k_fire"),
            fire_per_rmb: row.get("fire_per_rmb"),
            increase_ratio: row.get::<Option<f64>, _>("increase_ratio").unwrap_or(0.0),
            trading_volume: row.get::<Option<String>, _>("trading_volume").unwrap_or_default(),
            source: row.get("source"),
            source_time: row.get::<Option<String>, _>("source_time").unwrap_or_default(),
            scraped_at: row.get("scraped_at"),
            season_day: row.get("season_day"),
        })
        .collect();

    Ok(records)
}

/// 查询单个物品的快照历史
pub async fn get_items_history(
    pool: &SqlitePool,
    item_id: &str,
    season_id: &str,
    market_mode: &str,
    limit: i32,
) -> Result<Vec<ItemSnapshotRecord>, String> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.items_table(season_id);

    let query = format!(
        r#"
        SELECT item_id, fire_price, scraped_at, season_day
        FROM {}
        WHERE item_id = ?
        ORDER BY scraped_at DESC
        LIMIT ?
        "#,
        table
    );

    let rows = sqlx::query(&query)
        .bind(item_id)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询物品快照失败: {}", e))?;

    let records: Vec<ItemSnapshotRecord> = rows
        .into_iter()
        .map(|row| ItemSnapshotRecord {
            item_id: row.get("item_id"),
            fire_price: row.get("fire_price"),
            scraped_at: row.get("scraped_at"),
            season_day: row.get("season_day"),
        })
        .collect();

    Ok(records)
}

/// 查询所有物品的快照（按时间分组，返回最新时间点的数据）
#[derive(Debug, Clone, Serialize)]
pub struct ItemSnapshotWithInfo {
    pub item_id: String,
    pub fire_price: f64,
    pub scraped_at: i64,
    pub season_day: i32,
    pub name: Option<String>,
}

pub async fn get_items_history_all(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    limit: i32,
) -> Result<Vec<ItemSnapshotWithInfo>, String> {
    let mode = MarketMode::from_str(market_mode);
    let table = mode.items_table(season_id);

    let query = format!(
        r#"
        SELECT item_id, fire_price, scraped_at, season_day
        FROM {}
        ORDER BY scraped_at DESC
        LIMIT ?
        "#,
        table
    );

    let rows = sqlx::query(&query)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询所有物品快照失败: {}", e))?;

    let records: Vec<ItemSnapshotWithInfo> = rows
        .into_iter()
        .map(|row| ItemSnapshotWithInfo {
            item_id: row.get("item_id"),
            fire_price: row.get("fire_price"),
            scraped_at: row.get("scraped_at"),
            season_day: row.get("season_day"),
            name: None,
        })
        .collect();

    Ok(records)
}
