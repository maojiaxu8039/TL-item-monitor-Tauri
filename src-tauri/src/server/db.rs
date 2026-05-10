//! 数据库操作模块 - 与客户端一致的表结构
//!
//! 表结构设计：
//! - fire_price_snapshots_{season}_{mode}: 火价快照，按赛季和模式分表
//! - item_snapshots_{season}_{mode}: 物品价格快照，按赛季和模式分表

use serde::Serialize;
use sqlx::{Row, SqlitePool};
use tracing::{debug, info, warn};

use super::scraper::{FirePriceSnapshot, Item};

/// 校验 season_id 是否安全（只允许 ss + 数字格式）
pub fn validate_season_id(season_id: &str) -> Result<(), String> {
    if season_id.len() < 3
        || &season_id[..2] != "ss"
        || !season_id[2..].chars().all(|c| c.is_ascii_digit())
    {
        return Err(format!(
            "无效的 season_id: {}，只允许 ss + 数字格式（如 ss12, ss13）",
            season_id
        ));
    }
    Ok(())
}

#[derive(Debug, Clone)]
pub enum MarketMode {
    Normal,
    Expert,
}

impl std::str::FromStr for MarketMode {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "season_expert" | "expert" => Ok(MarketMode::Expert),
            "season_normal" | "normal" => Ok(MarketMode::Normal),
            _ => Err(format!("Unknown market mode: {}", s)),
        }
    }
}

impl MarketMode {
    pub fn parse(s: &str) -> Self {
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

async fn table_exists(pool: &SqlitePool, table: &str) -> Result<bool, String> {
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?")
            .bind(table)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("检查表 {} 失败: {}", table, e))?;
    Ok(count > 0)
}

async fn column_exists(pool: &SqlitePool, table: &str, column: &str) -> Result<bool, String> {
    if !table_exists(pool, table).await? {
        return Ok(false);
    }

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pragma_table_info(?) WHERE name=?")
        .bind(table)
        .bind(column)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("检查字段 {}.{} 失败: {}", table, column, e))?;
    Ok(count > 0)
}

async fn add_column_if_missing(
    pool: &SqlitePool,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    if !table_exists(pool, table).await? || column_exists(pool, table, column).await? {
        return Ok(());
    }

    sqlx::query(&format!(
        "ALTER TABLE {} ADD COLUMN {} {}",
        table, column, definition
    ))
    .execute(pool)
    .await
    .map_err(|e| format!("补充字段 {}.{} 失败: {}", table, column, e))?;
    Ok(())
}

/// 获取赛季开始时间戳（从数据库查询，必须存在且 > 0）
async fn get_season_start(pool: &SqlitePool, season_id: &str) -> Result<i64, String> {
    let started_at: Option<i64> = sqlx::query_scalar("SELECT started_at FROM seasons WHERE id = ?")
        .bind(season_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("查询赛季开始时间失败: {}", e))?;

    match started_at {
        Some(ts) if ts > 0 => Ok(ts),
        _ => {
            let fallback = get_fallback_season_start(season_id);
            if let Some(fallback_ts) = fallback {
                tracing::warn!(
                    "赛季 {} 的 started_at 为 {} 或不存在，使用常量表兜底: {}",
                    season_id,
                    started_at.unwrap_or(0),
                    fallback_ts
                );
                Ok(fallback_ts)
            } else {
                Err(format!(
                    "赛季 {} 不存在或未设置有效的 started_at，请先调用 /admin/init-season 初始化并设置开服时间",
                    season_id
                ))
            }
        }
    }
}

fn get_fallback_season_start(season_id: &str) -> Option<i64> {
    match season_id {
        "ss12" => Some(1776384000),
        "ss11" => Some(1768521600),
        "ss10" => Some(1760140800),
        _ => None,
    }
}

/// 公开函数：获取赛季开始时间戳（供 API 使用）
pub async fn get_season_start_time(pool: &SqlitePool, season_id: &str) -> Option<i64> {
    sqlx::query_scalar("SELECT started_at FROM seasons WHERE id = ?")
        .bind(season_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

/// 获取所有赛季列表
pub async fn get_all_seasons_list(pool: &SqlitePool) -> Vec<String> {
    let rows: Vec<(String,)> = sqlx::query_as("SELECT id FROM seasons ORDER BY started_at DESC")
        .fetch_all(pool)
        .await
        .unwrap_or_default();
    rows.into_iter().map(|(id,)| id).collect()
}

/// 获取当前活跃赛季（is_current=1 且 ended_at 为空）
pub async fn get_current_season(pool: &SqlitePool) -> Option<String> {
    sqlx::query_scalar(
        "SELECT id FROM seasons WHERE is_current = 1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
}

fn get_migration_started_at(season_id: &str) -> i64 {
    match season_id {
        "ss12" => 1776384000,
        "ss11" => 1768521600,
        "ss10" => 1760140800,
        _ => 0,
    }
}

async fn migrate_season_record(pool: &SqlitePool, season: &str) -> Result<(), String> {
    let started_at = get_migration_started_at(season);
    sqlx::query("INSERT OR IGNORE INTO seasons (id, started_at) VALUES (?, ?)")
        .bind(season)
        .bind(started_at)
        .execute(pool)
        .await
        .map_err(|e| format!("插入赛季记录失败: {}", e))?;
    Ok(())
}

/// 运行数据库迁移
pub async fn run_migrations(pool: &SqlitePool) -> Result<(), String> {
    info!("执行数据库迁移...");

    // 首先创建 seasons 表（如果不存在）
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS seasons (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            started_at INTEGER NOT NULL,
            ended_at INTEGER
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("创建 seasons 表失败: {}", e))?;

    // 添加 is_current 字段（如果不存在）
    sqlx::query("ALTER TABLE seasons ADD COLUMN is_current INTEGER NOT NULL DEFAULT 0")
        .execute(pool)
        .await
        .ok(); // 忽略错误，因为字段可能已存在

    // 从数据库获取已有的赛季，如果为空则使用默认赛季列表
    let seasons = get_all_seasons_list(pool).await;

    let seasons_to_migrate = if seasons.is_empty() {
        info!("seasons 表为空，使用默认赛季列表: ss12, ss11");
        vec!["ss12".to_string(), "ss11".to_string()]
    } else {
        seasons
    };

    // 确保赛季记录存在（插入或忽略）
    for season in &seasons_to_migrate {
        migrate_season_record(pool, season).await?;
    }

    for season in &seasons_to_migrate {
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
	                name TEXT NOT NULL DEFAULT '',
	                item_type TEXT NOT NULL DEFAULT '',
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
        add_column_if_missing(pool, &items_table, "name", "TEXT NOT NULL DEFAULT ''").await?;
        add_column_if_missing(pool, &items_table, "item_type", "TEXT NOT NULL DEFAULT ''").await?;
        add_column_if_missing(
            pool,
            &items_table,
            "season_day",
            "INTEGER NOT NULL DEFAULT 1",
        )
        .await?;

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
	                name TEXT NOT NULL DEFAULT '',
	                item_type TEXT NOT NULL DEFAULT '',
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
        add_column_if_missing(
            pool,
            &expert_items_table,
            "name",
            "TEXT NOT NULL DEFAULT ''",
        )
        .await?;
        add_column_if_missing(
            pool,
            &expert_items_table,
            "item_type",
            "TEXT NOT NULL DEFAULT ''",
        )
        .await?;
        add_column_if_missing(
            pool,
            &expert_items_table,
            "season_day",
            "INTEGER NOT NULL DEFAULT 1",
        )
        .await?;

        // 创建索引
        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS idx_{}_scraped ON {}(scraped_at)",
            table.replace("-", "_"),
            table
        ))
        .execute(pool)
        .await
        .ok();
        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS idx_{}_item_scraped ON {}(item_id, scraped_at)",
            items_table.replace("-", "_"),
            items_table
        ))
        .execute(pool)
        .await
        .ok();
        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS idx_{}_scraped ON {}(scraped_at)",
            expert_table.replace("-", "_"),
            expert_table
        ))
        .execute(pool)
        .await
        .ok();
        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS idx_{}_item_scraped ON {}(item_id, scraped_at)",
            expert_items_table.replace("-", "_"),
            expert_items_table
        ))
        .execute(pool)
        .await
        .ok();

        info!("已创建/验证赛季 {} 的表结构", season);
    }

    info!("数据库迁移完成");
    Ok(())
}

/// WAL 检查点 - 将 WAL 文件写入主数据库，减少磁盘空间占用
/// 应该定期调用（如每小时或每天）
pub async fn wal_checkpoint(pool: &SqlitePool) -> Result<WalCheckpointResult, String> {
    info!("执行 WAL checkpoint...");

    let page_count: i64 = sqlx::query_scalar("PRAGMA page_count")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("获取页数失败: {}", e))?;

    let freelist_count: i64 = sqlx::query_scalar("PRAGMA freelist_count")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("获取空闲页数失败: {}", e))?;

    let wal_size: i64 = sqlx::query_scalar("PRAGMA wal_checkpoint(PASSIVE)")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("WAL checkpoint 失败: {}", e))?;

    info!(
        "WAL checkpoint 完成: 数据库页数={}, 空闲页数={}, WAL页数={}",
        page_count, freelist_count, wal_size
    );

    Ok(WalCheckpointResult {
        page_count,
        freelist_count,
        wal_pages_checkpointed: wal_size,
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct WalCheckpointResult {
    pub page_count: i64,
    pub freelist_count: i64,
    pub wal_pages_checkpointed: i64,
}

/// 获取数据库文件大小信息
pub async fn get_db_size_info(pool: &SqlitePool) -> Result<DbSizeInfo, String> {
    let page_size: i64 = sqlx::query_scalar("PRAGMA page_size")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("获取页大小失败: {}", e))?;

    let page_count: i64 = sqlx::query_scalar("PRAGMA page_count")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("获取页数失败: {}", e))?;

    let freelist_count: i64 = sqlx::query_scalar("PRAGMA freelist_count")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("获取空闲页数失败: {}", e))?;

    let database_size_kb = (page_count * page_size) / 1024;
    let wal_info: (i64, i64, i64) = sqlx::query_as::<_, (i64, i64, i64)>("PRAGMA wal_checkpoint(PASSIVE)")
        .fetch_one(pool)
        .await
        .unwrap_or((0, 0, 0));

    let wal_size_kb = (wal_info.2 * page_size) / 1024;

    Ok(DbSizeInfo {
        page_size_bytes: page_size,
        total_pages: page_count,
        freelist_pages: freelist_count,
        database_size_kb,
        wal_size_kb,
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct DbSizeInfo {
    pub page_size_bytes: i64,
    pub total_pages: i64,
    pub freelist_pages: i64,
    pub database_size_kb: i64,
    pub wal_size_kb: i64,
}

/// 保存火价快照（按赛季+模式分表）
pub async fn insert_fire_snapshot(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    fire: &FirePriceSnapshot,
    scraped_at: i64,
) -> Result<(), String> {
    let mode = MarketMode::parse(market_mode);
    let table = mode.fire_table(season_id);
    let season_start = get_season_start(pool, season_id).await?;
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

    debug!(
        "火价快照已保存: {} (scraped_at: {}, season_day: {})",
        fire.rmb_per_10k_fire, scraped_at, season_day
    );
    Ok(())
}

/// 保存物品价格快照（按赛季+模式分表）- 批量插入优化（分批处理）
const BATCH_SIZE: usize = 500;

pub async fn insert_items_snapshots(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    fire_per_rmb: f64,
    items: &[Item],
    scraped_at: i64,
) -> Result<usize, String> {
    let mode = MarketMode::parse(market_mode);
    let table = mode.items_table(season_id);
    let season_start = get_season_start(pool, season_id).await?;
    let season_day = calculate_season_day(season_start, scraped_at);

    if items.is_empty() {
        return Ok(0);
    }

    let mut total_count = 0;
    let total_batches = (items.len() + BATCH_SIZE - 1) / BATCH_SIZE;

    for (batch_idx, batch) in items.chunks(BATCH_SIZE).enumerate() {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

        let mut placeholders = String::new();
        for i in 0..batch.len() {
            if i > 0 {
                placeholders.push_str(", ");
            }
            placeholders.push_str("(?, ?, ?, ?, ?, ?)");
        }

        let sql_string = format!(
            "INSERT OR IGNORE INTO {} (item_id, name, item_type, fire_price, scraped_at, season_day) VALUES {}",
            table,
            placeholders
        );
        let mut sqlx_query = sqlx::query(&sql_string);

        for item in batch {
            let fire_price = item.price * fire_per_rmb;
            sqlx_query = sqlx_query
                .bind(&item.item_id)
                .bind(&item.name)
                .bind(&item.item_type)
                .bind(fire_price)
                .bind(scraped_at)
                .bind(season_day);
        }

        let result = sqlx_query.execute(&mut *tx).await.map_err(|e| e.to_string())?;
        let count = result.rows_affected() as usize;
        total_count += count;

        tx.commit().await.map_err(|e| e.to_string())?;

        debug!(
            "物品快照批次 {}/{}: 插入 {} 条 (scraped_at: {}, season_day: {})",
            batch_idx + 1, total_batches, count, scraped_at, season_day
        );
    }

    debug!(
        "已保存 {} 个物品价格快照 (共 {} 批次, scraped_at: {}, season_day: {})",
        total_count, total_batches, scraped_at, season_day
    );
    Ok(total_count)
}

#[derive(Debug, Clone, Serialize)]
pub struct FireSnapshotRecord {
    pub season_id: String,
    pub market_mode: String,
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
    pub season_id: String,
    pub market_mode: String,
    pub name: String,
    pub item_type: String,
    pub fire_price: f64,
    pub scraped_at: i64,
    pub season_day: i32,
}

/// 查询火价快照历史（按模式，可选赛季天数范围筛选）
pub async fn get_fire_history(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    limit: i32,
    min_day: Option<i32>,
    max_day: Option<i32>,
) -> Result<Vec<FireSnapshotRecord>, String> {
    let mode = MarketMode::parse(market_mode);
    let table = mode.fire_table(season_id);

    let where_clause = match (min_day, max_day) {
        (Some(min), Some(max)) if min > 0 && max > 0 => {
            format!(" WHERE season_day >= {} AND season_day <= {} ", min, max)
        }
        (Some(min), _) if min > 0 => {
            format!(" WHERE season_day >= {} ", min)
        }
        (_, Some(max)) if max > 0 => {
            format!(" WHERE season_day <= {} ", max)
        }
        _ => String::new(),
    };

    let query = format!(
        r#"
        SELECT rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day
        FROM {}
        {}
        ORDER BY scraped_at DESC
        LIMIT ?
        "#,
        table,
        where_clause
    );

    let rows = sqlx::query(&query)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询火价快照失败: {}", e))?;

    let records: Vec<FireSnapshotRecord> = rows
        .into_iter()
        .map(|row| FireSnapshotRecord {
            season_id: season_id.to_string(),
            market_mode: market_mode.to_string(),
            rmb_per_10k_fire: row.get("rmb_per_10k_fire"),
            fire_per_rmb: row.get("fire_per_rmb"),
            increase_ratio: row.get::<Option<f64>, _>("increase_ratio").unwrap_or(0.0),
            trading_volume: row
                .get::<Option<String>, _>("trading_volume")
                .unwrap_or_default(),
            source: row.get("source"),
            source_time: row
                .get::<Option<String>, _>("source_time")
                .unwrap_or_default(),
            scraped_at: row.get("scraped_at"),
            season_day: row.get("season_day"),
        })
        .collect();

    Ok(records)
}

pub async fn archive_season(pool: &SqlitePool, season_id: &str) -> Result<(), String> {
    if season_id.is_empty() {
        return Err("赛季 ID 不能为空".to_string());
    }
    validate_season_id(season_id)?;

    info!("开始归档赛季: {}", season_id);

    let now = chrono::Utc::now().timestamp();
    let update_result = sqlx::query("UPDATE seasons SET ended_at = ?, is_current = 0 WHERE id = ?")
        .bind(now)
        .bind(season_id)
        .execute(pool)
        .await;

    match update_result {
        Ok(result) => {
            if result.rows_affected() == 0 {
                info!("赛季 {} 在 seasons 表中不存在或已归档", season_id);
            } else {
                info!("已标记赛季 {} 的归档时间 (ended_at={})", season_id, now);
            }
        }
        Err(e) => {
            warn!("标记赛季 {} 归档时间失败: {}", season_id, e);
        }
    }

    info!("赛季 {} 归档完成", season_id);
    Ok(())
}

/// 重置指定赛季的单个表（清空数据但保留表结构）
pub async fn reset_table(
    pool: &SqlitePool,
    season_id: &str,
    table_type: &str,
    market_mode: &str,
) -> Result<(String, i64), String> {
    validate_season_id(season_id)?;
    
    let table = match (table_type, market_mode) {
        ("fire", "normal") => format!("fire_price_snapshots_{}_normal", season_id),
        ("fire", "expert") => format!("fire_price_snapshots_{}_expert", season_id),
        ("items", "normal") => format!("item_snapshots_{}_normal", season_id),
        ("items", "expert") => format!("item_snapshots_{}_expert", season_id),
        _ => return Err("无效的表类型".to_string()),
    };
    
    let exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?"
    )
    .bind(&table)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("检查表失败: {}", e))?;
    
    if exists == 0 {
        return Err(format!("表 {} 不存在", table));
    }
    
    let result = sqlx::query(&format!("DELETE FROM {}", table))
        .execute(pool)
        .await
        .map_err(|e| format!("清空表 {} 失败: {}", table, e))?;
    
    let rows_affected = result.rows_affected();
    info!("已重置表: {}，共删除了 {} 条记录", table, rows_affected);
    Ok((table, rows_affected as i64))
}

/// 重置指定赛季的所有表
pub async fn reset_season_tables(
    pool: &SqlitePool,
    season_id: &str,
    tables: &[String],
) -> Result<Vec<String>, String> {
    validate_season_id(season_id)?;
    
    let mut results = Vec::new();
    
    for table_name in tables {
        match reset_table(pool, season_id, 
            if table_name.contains("fire") { "fire" } else { "items" },
            if table_name.contains("expert") { "expert" } else { "normal" }
        ).await {
            Ok(_) => results.push(format!("✓ {}", table_name)),
            Err(e) => results.push(format!("✗ {}: {}", table_name, e)),
        }
    }
    
    Ok(results)
}

#[derive(Debug, Serialize)]
pub struct SeasonStats {
    pub normal_fire_count: i64,
    pub normal_items_count: i64,
    pub expert_fire_count: i64,
    pub expert_items_count: i64,
}

pub async fn get_season_stats(pool: &SqlitePool, season_id: &str) -> Result<SeasonStats, String> {
    validate_season_id(season_id)?;

    let tables = [
        ("normal_fire", format!("fire_price_snapshots_{}_normal", season_id)),
        ("normal_items", format!("item_snapshots_{}_normal", season_id)),
        ("expert_fire", format!("fire_price_snapshots_{}_expert", season_id)),
        ("expert_items", format!("item_snapshots_{}_expert", season_id)),
    ];

    let mut normal_fire_count = 0i64;
    let mut normal_items_count = 0i64;
    let mut expert_fire_count = 0i64;
    let mut expert_items_count = 0i64;

    for (name, table) in &tables {
        let count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {}", table))
            .fetch_optional(pool)
            .await
            .unwrap_or(None)
            .unwrap_or(0);
        
        match *name {
            "normal_fire" => normal_fire_count = count,
            "normal_items" => normal_items_count = count,
            "expert_fire" => expert_fire_count = count,
            "expert_items" => expert_items_count = count,
            _ => {}
        }
    }

    Ok(SeasonStats {
        normal_fire_count,
        normal_items_count,
        expert_fire_count,
        expert_items_count,
    })
}

/// 初始化新赛季的数据库表
pub async fn init_new_season(
    pool: &SqlitePool,
    season_id: &str,
    season_name: Option<&str>,
    started_at: Option<i64>,
) -> Result<Vec<String>, String> {
    validate_season_id(season_id)?;

    let season_name = season_name.unwrap_or(season_id);
    let started_at = started_at.unwrap_or(0);

    if started_at <= 0 {
        return Err(format!(
            "赛季 {} 的开服时间必须为正整数，请通过管理页面正确设置 started_at 参数",
            season_id
        ));
    }

    sqlx::query("INSERT OR IGNORE INTO seasons (id, name, started_at) VALUES (?, ?, ?)")
        .bind(season_id)
        .bind(season_name)
        .bind(started_at)
        .execute(pool)
        .await
        .map_err(|e| format!("插入赛季记录失败: {}", e))?;

    // 将新赛季设为当前赛季（is_current=1）
    sqlx::query("UPDATE seasons SET is_current = 0")
        .execute(pool)
        .await
        .ok();
    sqlx::query("UPDATE seasons SET is_current = 1, ended_at = NULL WHERE id = ?")
        .bind(season_id)
        .execute(pool)
        .await
        .map_err(|e| format!("设置当前赛季失败: {}", e))?;
    
    info!("已设置 {} 为当前赛季", season_id);

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
                name TEXT NOT NULL DEFAULT '',
                item_type TEXT NOT NULL DEFAULT '',
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

    info!(
        "新赛季 {} 已初始化，创建了 {} 张表",
        season_id,
        created_tables.len()
    );
    Ok(created_tables)
}

/// 查询所有火价快照历史（不分页，用于数据同步）
pub async fn get_fire_history_all(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    limit: i32,
    offset: i32,
) -> Result<Vec<FireSnapshotRecord>, String> {
    let mode = MarketMode::parse(market_mode);
    let table = mode.fire_table(season_id);

    let query = format!(
        r#"
        SELECT rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day
        FROM {}
        ORDER BY scraped_at DESC
        LIMIT ?
        OFFSET ?
        "#,
        table
    );

    let rows = sqlx::query(&query)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询火价快照失败: {}", e))?;

    let records: Vec<FireSnapshotRecord> = rows
        .into_iter()
        .map(|row| FireSnapshotRecord {
            season_id: season_id.to_string(),
            market_mode: market_mode.to_string(),
            rmb_per_10k_fire: row.get("rmb_per_10k_fire"),
            fire_per_rmb: row.get("fire_per_rmb"),
            increase_ratio: row.get::<Option<f64>, _>("increase_ratio").unwrap_or(0.0),
            trading_volume: row
                .get::<Option<String>, _>("trading_volume")
                .unwrap_or_default(),
            source: row.get("source"),
            source_time: row
                .get::<Option<String>, _>("source_time")
                .unwrap_or_default(),
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
    let mode = MarketMode::parse(market_mode);
    let table = mode.items_table(season_id);

    let query = format!(
        r#"
        SELECT item_id, name, item_type, fire_price, scraped_at, season_day
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
            season_id: season_id.to_string(),
            market_mode: market_mode.to_string(),
            name: row
                .get::<Option<String>, _>("name")
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| row.get("item_id")),
            item_type: row
                .get::<Option<String>, _>("item_type")
                .unwrap_or_default(),
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
    pub season_id: String,
    pub market_mode: String,
    pub fire_price: f64,
    pub scraped_at: i64,
    pub season_day: i32,
    pub name: Option<String>,
    pub item_type: Option<String>,
}

pub async fn get_items_history_all(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    limit: i32,
    offset: i32,
    min_day: Option<i32>,
    max_day: Option<i32>,
) -> Result<Vec<ItemSnapshotWithInfo>, String> {
    let mode = MarketMode::parse(market_mode);
    let table = mode.items_table(season_id);

    let where_clause = match (min_day, max_day) {
        (Some(min), Some(max)) if min > 0 && max > 0 => {
            format!(" WHERE season_day >= {} AND season_day <= {} ", min, max)
        }
        (Some(min), _) if min > 0 => {
            format!(" WHERE season_day >= {} ", min)
        }
        (_, Some(max)) if max > 0 => {
            format!(" WHERE season_day <= {} ", max)
        }
        _ => String::new(),
    };

    let query = format!(
        r#"
        SELECT item_id, name, item_type, fire_price, scraped_at, season_day
        FROM {}
        {}
        ORDER BY scraped_at DESC
        LIMIT ?
        OFFSET ?
        "#,
        table,
        where_clause
    );

    let rows = sqlx::query(&query)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询所有物品快照失败: {}", e))?;

    let records: Vec<ItemSnapshotWithInfo> = rows
        .into_iter()
        .map(|row| ItemSnapshotWithInfo {
            item_id: row.get("item_id"),
            season_id: season_id.to_string(),
            market_mode: market_mode.to_string(),
            fire_price: row.get("fire_price"),
            scraped_at: row.get("scraped_at"),
            season_day: row.get("season_day"),
            name: row
                .get::<Option<String>, _>("name")
                .filter(|name| !name.is_empty()),
            item_type: row
                .get::<Option<String>, _>("item_type")
                .filter(|item_type| !item_type.is_empty()),
        })
        .collect();

    Ok(records)
}
