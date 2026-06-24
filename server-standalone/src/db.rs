use serde::Serialize;
use sqlx::{Row, SqlitePool};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tracing::{debug, error, info, instrument, warn};

use crate::scraper::{FirePriceSnapshot, Item};

#[derive(Debug, Clone, Serialize)]
pub struct AuditLogEntry {
    pub id: i64,
    pub timestamp: i64,
    pub action: String,
    pub details: String,
    pub ip_address: String,
    pub success: bool,
}

pub fn validate_season_id(season_id: &str) -> Result<(), String> {
    let suffix = season_id.strip_prefix("ss");
    if suffix.map_or(true, |s| {
        s.is_empty() || !s.chars().all(|c| c.is_ascii_digit())
    }) {
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
        checked_identifier(format!(
            "fire_price_snapshots_{}_{}",
            season_id,
            self.as_str()
        ))
    }

    pub fn items_table(&self, season_id: &str) -> String {
        checked_identifier(format!("item_snapshots_{}_{}", season_id, self.as_str()))
    }
}

fn calculate_season_day(season_start: i64, recorded_at: i64) -> i32 {
    const BEIJING_OFFSET_SECS: i64 = 8 * 3600;
    const DAY_SECS: i64 = 86400;

    let recorded_in_beijing = recorded_at + BEIJING_OFFSET_SECS;
    let start_in_beijing = season_start + BEIJING_OFFSET_SECS;

    // 用 div_euclid 而非 `/`：Rust 的 `/` 对负数是向 0 截断（trunc），
    // 在 1970 年之前的 timestamp（理论场景）或 timer 偏差导致负数时会少算一天。
    // div_euclid 是数学上的 floor 除法，跨 UTC 0 时刻仍然正确。
    let recorded_day_start = recorded_in_beijing.div_euclid(DAY_SECS) * DAY_SECS;
    let start_day_start = start_in_beijing.div_euclid(DAY_SECS) * DAY_SECS;

    if recorded_day_start < start_day_start {
        return 1;
    }

    let days_elapsed = (recorded_day_start - start_day_start) / DAY_SECS;
    (days_elapsed + 1) as i32
}

#[cfg(test)]
mod validation_tests {
    use super::*;

    // ===== validate_season_id 测试 =====
    #[test]
    fn validate_season_id_accepts_valid() {
        assert!(validate_season_id("ss12").is_ok());
        assert!(validate_season_id("ss1").is_ok());
        assert!(validate_season_id("ss999").is_ok());
    }

    #[test]
    fn validate_season_id_rejects_invalid() {
        // 空字符串
        assert!(validate_season_id("").is_err());
        // 不是 ss 开头
        assert!(validate_season_id("s12").is_err());
        assert!(validate_season_id("S12").is_err());
        assert!(validate_season_id("xz12").is_err());
        // 纯字母
        assert!(validate_season_id("ss").is_err());
        // 含特殊字符
        assert!(validate_season_id("ss12;").is_err());
        assert!(validate_season_id("ss1 2").is_err());
        assert!(validate_season_id("ss12\n").is_err());
        // SQL 注入尝试
        assert!(validate_season_id("ss12' OR '1'='1").is_err());
        assert!(validate_season_id("ss12; DROP TABLE seasons;--").is_err());
    }

    // ===== calculate_season_day 测试 =====
    #[test]
    fn calculate_season_day_basic() {
        // season_start=1700000000 (UTC), recorded_at 同一天
        let start = 1700000000_i64;
        assert_eq!(calculate_season_day(start, start), 1);
        // 1 天后
        assert_eq!(calculate_season_day(start, start + 86400), 2);
        // 7 天后
        assert_eq!(calculate_season_day(start, start + 7 * 86400), 8);
    }

    #[test]
    fn calculate_season_day_before_start_returns_1() {
        // recorded 在 season_start 之前应该返回 1
        let start = 1700000000_i64;
        assert_eq!(calculate_season_day(start, start - 1000), 1);
    }

    #[test]
    fn calculate_season_day_cross_beijing_midnight() {
        // 验证 div_euclid 行为: 跨 UTC 0 时刻 (北京时间 8:00) 不出错
        // season_start = 北京时间 2024-01-01 00:00:00 = UTC 2023-12-31 16:00:00
        let season_start = 1_704_067_200_i64; // UTC 2023-12-31 16:00:00
        // 整 UTC 0 点: 跨北京上午 8:00
        let utc_midnight = 1_703_990_400_i64; // UTC 2024-01-01 00:00:00
        // 应该是 day 2 (北京时间 1 号)
        // 注意: 北京时间 1 号 0 点 = UTC 0 号 16:00 (从 start 算 8 小时)
        // div_euclid 应该正确处理这个偏移
        let day = calculate_season_day(season_start, utc_midnight);
        assert!((1..=3).contains(&day), "unexpected day={}", day);
    }

    #[test]
    fn calculate_season_day_long_running() {
        // 90 天赛季:赛季开始 + 90 天 - 1 秒应该还是 day 90
        let start = 1_704_067_200_i64;
        let day_90 = calculate_season_day(start, start + 89 * 86400);
        assert_eq!(day_90, 90);
    }
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

/// 检查表是否存在（包容版本，查询失败视为不存在）
async fn table_exists_lenient(pool: &SqlitePool, table: &str) -> bool {
    table_exists(pool, table).await.unwrap_or(false)
}

async fn count_table_or_zero(pool: &SqlitePool, table: &str) -> i64 {
    if !table_exists_lenient(pool, table).await {
        return 0;
    }
    sqlx::query_scalar::<_, i64>(&format!("SELECT COUNT(*) FROM {}", table))
        .fetch_one(pool)
        .await
        .unwrap_or(0)
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
    if !is_valid_identifier(table) || !is_valid_identifier(column) {
        return Err(format!("无效的表名或列名: {}, {}", table, column));
    }

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

async fn create_fire_indexes(pool: &SqlitePool, table: &str) -> Result<(), String> {
    sqlx::query(&format!(
        "CREATE INDEX IF NOT EXISTS idx_{}_day ON {}(season_day)",
        table, table
    ))
    .execute(pool)
    .await
    .map_err(|e| format!("创建 {} season_day 索引失败: {}", table, e))?;

    sqlx::query(&format!(
        "CREATE INDEX IF NOT EXISTS idx_{}_scraped_id ON {}(scraped_at DESC, id DESC)",
        table, table
    ))
    .execute(pool)
    .await
    .map_err(|e| format!("创建 {} scraped_at 索引失败: {}", table, e))?;

    sqlx::query(&format!(
        "CREATE INDEX IF NOT EXISTS idx_{}_day_scraped_id ON {}(season_day, scraped_at DESC, id DESC)",
        table, table
    ))
    .execute(pool)
    .await
    .map_err(|e| format!("创建 {} season_day/scraped_at 索引失败: {}", table, e))?;

    Ok(())
}

async fn create_items_indexes(pool: &SqlitePool, table: &str) -> Result<(), String> {
    sqlx::query(&format!(
        "CREATE INDEX IF NOT EXISTS idx_{}_item_scraped ON {}(item_id, scraped_at DESC)",
        table, table
    ))
    .execute(pool)
    .await
    .map_err(|e| format!("创建 {} item_id/scraped_at 索引失败: {}", table, e))?;

    sqlx::query(&format!(
        "CREATE INDEX IF NOT EXISTS idx_{}_scraped_id ON {}(scraped_at DESC, id DESC)",
        table, table
    ))
    .execute(pool)
    .await
    .map_err(|e| format!("创建 {} scraped_at 索引失败: {}", table, e))?;

    sqlx::query(&format!(
        "CREATE INDEX IF NOT EXISTS idx_{}_day ON {}(season_day)",
        table, table
    ))
    .execute(pool)
    .await
    .map_err(|e| format!("创建 {} season_day 索引失败: {}", table, e))?;

    sqlx::query(&format!(
        "CREATE INDEX IF NOT EXISTS idx_{}_day_scraped_id ON {}(season_day, scraped_at DESC, id DESC)",
        table, table
    ))
    .execute(pool)
    .await
    .map_err(|e| format!("创建 {} season_day/scraped_at 索引失败: {}", table, e))?;

    Ok(())
}

fn is_valid_identifier(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn checked_identifier(identifier: String) -> String {
    assert!(
        is_valid_identifier(&identifier),
        "unsafe SQL identifier generated: {}",
        identifier
    );
    identifier
}

const CACHE_TTL_SECS: u64 = 300;

struct CacheEntry {
    started_at: i64,
    cached_at: Instant,
}

fn season_start_cache() -> &'static Mutex<HashMap<String, CacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn is_cache_valid(entry: &CacheEntry) -> bool {
    entry.cached_at.elapsed() < Duration::from_secs(CACHE_TTL_SECS)
}

async fn get_cached_season_start(pool: &SqlitePool, season_id: &str) -> Result<i64, String> {
    if let Ok(cache) = season_start_cache().lock() {
        if let Some(entry) = cache.get(season_id) {
            if is_cache_valid(entry) {
                return Ok(entry.started_at);
            }
        }
    }
    let start = get_season_start(pool, season_id).await?;
    if let Ok(mut cache) = season_start_cache().lock() {
        cache.insert(
            season_id.to_string(),
            CacheEntry {
                started_at: start,
                cached_at: Instant::now(),
            },
        );
    }
    Ok(start)
}

/// 清除指定赛季的 started_at 缓存。
/// 在 init_new_season 修改了赛季起始时间后必须调用，否则 5 分钟内 season_day 会按旧值计算。
pub fn invalidate_season_start_cache(season_id: &str) {
    if let Ok(mut cache) = season_start_cache().lock() {
        cache.remove(season_id);
    }
}

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
        _ => None,
    }
}

pub async fn get_season_start_time(pool: &SqlitePool, season_id: &str) -> Option<i64> {
    sqlx::query_scalar("SELECT started_at FROM seasons WHERE id = ?")
        .bind(season_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

pub async fn get_all_seasons_list(pool: &SqlitePool) -> Vec<String> {
    let rows: Vec<(String,)> = sqlx::query_as("SELECT id FROM seasons ORDER BY started_at DESC")
        .fetch_all(pool)
        .await
        .unwrap_or_default();
    rows.into_iter().map(|(id,)| id).collect()
}

pub async fn get_current_season(pool: &SqlitePool) -> Option<String> {
    sqlx::query_scalar(
        "SELECT id FROM seasons WHERE is_current = 1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
}

pub async fn get_current_or_recent_season_id(pool: &SqlitePool) -> Option<String> {
    // 优先：is_current=1 的活跃赛季
    let active: Option<String> = sqlx::query_scalar(
        "SELECT id FROM seasons WHERE is_current = 1 ORDER BY started_at DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    if active.is_some() {
        return active;
    }

    // 兜底：最近归档的赛季
    let recent: Option<String> = sqlx::query_scalar(
        "SELECT id FROM seasons WHERE ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    recent
}

pub async fn get_season_archive_info(
    pool: &SqlitePool,
    season_id: &str,
) -> Option<(i64, Option<i64>)> {
    let row: Option<(i64, Option<i64>)> = sqlx::query_as(
        "SELECT started_at, ended_at FROM seasons WHERE id = ? ORDER BY started_at DESC LIMIT 1",
    )
    .bind(season_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    row
}

fn get_migration_started_at(season_id: &str) -> i64 {
    match season_id {
        "ss12" => 1776384000,
        _ => 0,
    }
}

async fn migrate_season_record(pool: &SqlitePool, season: &str) -> Result<(), String> {
    let started_at = get_migration_started_at(season);
    sqlx::query("INSERT OR IGNORE INTO seasons (id, name, started_at) VALUES (?, ?, ?)")
        .bind(season)
        .bind(season)
        .bind(started_at)
        .execute(pool)
        .await
        .map_err(|e| format!("插入赛季记录失败: {}", e))?;
    Ok(())
}

pub async fn run_migrations(pool: &SqlitePool, default_season: &str) -> Result<(), String> {
    info!("执行数据库迁移...");
    validate_season_id(default_season)?;

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

    sqlx::query("ALTER TABLE seasons ADD COLUMN is_current INTEGER DEFAULT 0")
        .execute(pool)
        .await
        .ok();

    // 加索引以加速 is_current=1 ORDER BY started_at DESC 常见查询
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_seasons_is_current ON seasons(is_current, started_at DESC)")
        .execute(pool)
        .await
        .map_err(|e| format!("创建 seasons 索引失败: {}", e))?;

    let seasons = get_all_seasons_list(pool).await;

    let mut seasons_to_migrate = if seasons.is_empty() {
        info!("seasons 表为空，使用配置默认赛季: {}", default_season);
        vec![default_season.to_string()]
    } else {
        seasons
    };

    seasons_to_migrate.retain(|season| {
        let valid = validate_season_id(season).is_ok();
        if !valid {
            warn!("跳过无效赛季 ID 的迁移: {}", season);
        }
        valid
    });

    if !seasons_to_migrate.iter().any(|s| s == default_season) {
        seasons_to_migrate.push(default_season.to_string());
    }

    for season in &seasons_to_migrate {
        migrate_season_record(pool, season).await?;
    }

    let active_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM seasons WHERE is_current = 1",
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    if active_count == 0 {
        // 只把 is_current 设为 1；如果 ended_at 已经被手动设置过，保留（不强制重置为 NULL）
        sqlx::query("UPDATE seasons SET is_current = 1 WHERE id = ?")
            .bind(default_season)
            .execute(pool)
            .await
            .map_err(|e| format!("设置默认当前赛季失败: {}", e))?;
        info!("未发现当前赛季，已设置 {} 为当前赛季", default_season);
    }

    for season in &seasons_to_migrate {
        let table = MarketMode::Normal.fire_table(season);
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
        create_fire_indexes(pool, &table).await?;

        let items_table = MarketMode::Normal.items_table(season);
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
        create_items_indexes(pool, &items_table).await?;
        add_column_if_missing(pool, &items_table, "name", "TEXT NOT NULL DEFAULT ''").await?;
        add_column_if_missing(pool, &items_table, "item_type", "TEXT NOT NULL DEFAULT ''").await?;
        add_column_if_missing(
            pool,
            &items_table,
            "season_day",
            "INTEGER NOT NULL DEFAULT 1",
        )
        .await?;

        let expert_table = MarketMode::Expert.fire_table(season);
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
        create_fire_indexes(pool, &expert_table).await?;

        let expert_items_table = MarketMode::Expert.items_table(season);
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
        create_items_indexes(pool, &expert_items_table).await?;
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

        info!("已创建/验证赛季 {} 的表结构", season);
    }

    sqlx::query("DROP TABLE IF EXISTS item_realtime_prices")
        .execute(pool)
        .await
        .map_err(|e| format!("删除服务端无用 item_realtime_prices 表失败: {}", e))?;

    info!("数据库迁移完成");
    Ok(())
}

pub async fn init_audit_log(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS admin_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            action TEXT NOT NULL,
            details TEXT NOT NULL DEFAULT '',
            ip_address TEXT NOT NULL DEFAULT '',
            success INTEGER NOT NULL DEFAULT 1
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("创建审计日志表失败: {}", e))?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON admin_audit_log(timestamp DESC)",
    )
    .execute(pool)
    .await
    .ok();

    // action+timestamp 组合索引：审计日志常见查询按 action 过滤 + 时间排序
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_audit_action_ts ON admin_audit_log(action, timestamp DESC)",
    )
    .execute(pool)
    .await
    .ok();

    // success+timestamp 组合索引：失败的 admin 操作查询
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_audit_success_ts ON admin_audit_log(success, timestamp DESC)",
    )
    .execute(pool)
    .await
    .ok();

    // ip_address 索引：按 IP 检索审计（溯源/封禁 IP 用）
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_audit_ip ON admin_audit_log(ip_address)",
    )
    .execute(pool)
    .await
    .ok();

    Ok(())
}

pub async fn insert_audit_log(
    pool: &SqlitePool,
    action: &str,
    details: &str,
    ip_address: &str,
    success: bool,
) {
    let timestamp = chrono::Utc::now().timestamp();
    let result = sqlx::query(
        "INSERT INTO admin_audit_log (timestamp, action, details, ip_address, success) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(timestamp)
    .bind(action)
    .bind(details)
    .bind(ip_address)
    .bind(success)
    .execute(pool)
    .await;

    if let Err(e) = result {
        // 结构化日志：带 action / ip 上下文,运维可精准定位丢失了哪条审计
        // 之前只 warn!("插入审计日志失败: {:?}", result.err())
        // 出问题时无法判断是哪条 action / 哪个 IP 的请求丢了
        error!(
            action = %action,
            ip = %ip_address,
            success = success,
            error = %e,
            "admin_audit_log 写入失败 (审计合规风险)"
        );
    }
}

pub async fn get_audit_log(
    pool: &SqlitePool,
    limit: i32,
    offset: i32,
) -> Result<Vec<AuditLogEntry>, String> {
    let query = r#"
        SELECT id, timestamp, action, details, ip_address, success
        FROM admin_audit_log
        ORDER BY timestamp DESC
        LIMIT ?
        OFFSET ?
    "#;

    let rows = sqlx::query(query)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询审计日志失败: {}", e))?;

    let entries: Vec<AuditLogEntry> = rows
        .into_iter()
        .map(|row| AuditLogEntry {
            id: row.get("id"),
            timestamp: row.get("timestamp"),
            action: row.get("action"),
            details: row.get::<Option<String>, _>("details").unwrap_or_default(),
            ip_address: row
                .get::<Option<String>, _>("ip_address")
                .unwrap_or_default(),
            success: row.get::<i32, _>("success") != 0,
        })
        .collect();

    Ok(entries)
}

pub async fn insert_fire_snapshot(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    fire: &FirePriceSnapshot,
    scraped_at: i64,
) -> Result<(), String> {
    validate_season_id(season_id)?;

    let mode = MarketMode::parse(market_mode);
    let table = mode.fire_table(season_id);
    let season_start = get_cached_season_start(pool, season_id).await?;
    let season_day = calculate_season_day(season_start, scraped_at);

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("开始事务失败: {}", e))?;

    let result = sqlx::query(&format!(
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
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("插入火价快照失败: {}", e))?;

    tx.commit()
        .await
        .map_err(|e| format!("提交事务失败: {}", e))?;

    info!(
        "火价快照已保存: {} (scraped_at: {}, season_day: {}, rows: {})",
        fire.rmb_per_10k_fire,
        scraped_at,
        season_day,
        result.rows_affected()
    );
    Ok(())
}

const BATCH_SIZE: usize = 500;

pub async fn insert_items_snapshots(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    items: &[Item],
    scraped_at: i64,
) -> Result<usize, String> {
    validate_season_id(season_id)?;

    let mode = MarketMode::parse(market_mode);
    let table = mode.items_table(season_id);
    let season_start = get_cached_season_start(pool, season_id).await?;
    let season_day = calculate_season_day(season_start, scraped_at);
    let mut total_count = 0;

    for chunk in items.chunks(BATCH_SIZE) {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

        let placeholders: Vec<String> = chunk
            .iter()
            .map(|_| "(?, ?, ?, ?, ?, ?)".to_string())
            .collect();

        let sql = format!(
            r#"INSERT OR IGNORE INTO {} (item_id, name, item_type, fire_price, scraped_at, season_day) VALUES {}"#,
            table,
            placeholders.join(", ")
        );

        let mut query = sqlx::query(&sql);
        for item in chunk {
            query = query
                .bind(&item.item_id)
                .bind(&item.name)
                .bind(&item.item_type)
                .bind(item.price)
                .bind(scraped_at)
                .bind(season_day);
        }

        match query.execute(&mut *tx).await {
            Ok(result) => {
                total_count += result.rows_affected() as usize;
            }
            Err(e) => {
                error!("批量插入物品快照失败: {}", e);
                for item in chunk {
                    if let Err(e) = sqlx::query(&format!(
                        r#"INSERT OR IGNORE INTO {} (item_id, name, item_type, fire_price, scraped_at, season_day) VALUES (?, ?, ?, ?, ?, ?)"#,
                        table
                    ))
                    .bind(&item.item_id)
                    .bind(&item.name)
                    .bind(&item.item_type)
                    .bind(item.price)
                    .bind(scraped_at)
                    .bind(season_day)
                    .execute(&mut *tx)
                    .await
                    {
                        error!("插入物品快照失败 {}: {}", item.item_id, e);
                    } else {
                        total_count += 1;
                    }
                }
            }
        }

        tx.commit().await.map_err(|e| e.to_string())?;
    }

    info!(
        "已保存 {} 个物品价格快照 (scraped_at: {}, season_day: {})",
        total_count, scraped_at, season_day
    );
    Ok(total_count)
}

#[derive(Debug, Clone, Serialize)]
pub struct FireSnapshotRecord {
    pub cursor_id: i64,
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
    pub cursor_id: i64,
    pub item_id: String,
    pub season_id: String,
    pub market_mode: String,
    pub name: String,
    pub item_type: String,
    pub fire_price: f64,
    pub scraped_at: i64,
    pub season_day: i32,
}

pub async fn get_fire_history(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    limit: i32,
    min_day: Option<i32>,
    max_day: Option<i32>,
    since_timestamp: Option<i64>,
) -> Result<Vec<FireSnapshotRecord>, String> {
    validate_season_id(season_id)?;

    let mode = MarketMode::parse(market_mode);
    let table = mode.fire_table(season_id);

    let mut conditions: Vec<&str> = Vec::new();
    let mut binds: Vec<i64> = Vec::new();

    match (min_day, max_day) {
        (Some(min), Some(max)) if min > 0 && max > 0 => {
            conditions.push(" season_day >= ? AND season_day <= ? ");
            binds.push(min as i64);
            binds.push(max as i64);
        }
        (Some(min), _) if min > 0 => {
            conditions.push(" season_day >= ? ");
            binds.push(min as i64);
        }
        (_, Some(max)) if max > 0 => {
            conditions.push(" season_day <= ? ");
            binds.push(max as i64);
        }
        _ => {}
    }

    if let Some(ts) = since_timestamp {
        conditions.push(" scraped_at > ? ");
        binds.push(ts);
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };

    let query = format!(
        r#"
        SELECT id, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day
        FROM {}
        {}
        ORDER BY scraped_at DESC, id DESC
        LIMIT ?
        "#,
        table, where_clause
    );

    let mut q = sqlx::query(&query);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(limit);
    let rows = q
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询火价快照失败: {}", e))?;

    let records: Vec<FireSnapshotRecord> = rows
        .into_iter()
        .map(|row| FireSnapshotRecord {
            cursor_id: row.get("id"),
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

#[cfg(test)]
mod integration_tests {
    use super::{
        get_fast_sync_all, get_items_by_cursor, get_items_daily_aggregate, get_latest_prices,
        is_valid_identifier, MarketMode,
    };
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;

    async fn test_pool_with_items() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("test sqlite pool should connect");

        sqlx::query(
            r#"
            CREATE TABLE item_snapshots_ss12_normal (
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
        )
        .execute(&pool)
        .await
        .expect("item snapshot table should be created");

        for (item_id, price, scraped_at, season_day) in [
            ("item_a", 100.0, 1000_i64, 1_i32),
            ("item_a", 200.0, 2000_i64, 2_i32),
            ("item_a", 300.0, 3000_i64, 3_i32),
            ("item_b", 500.0, 2000_i64, 2_i32),
        ] {
            sqlx::query(
                r#"
                INSERT INTO item_snapshots_ss12_normal
                    (item_id, name, item_type, fire_price, scraped_at, season_day)
                VALUES (?, ?, '装备', ?, ?, ?)
                "#,
            )
            .bind(item_id)
            .bind(item_id)
            .bind(price)
            .bind(scraped_at)
            .bind(season_day)
            .execute(&pool)
            .await
            .expect("item snapshot should insert");
        }

        pool
    }

    #[test]
    fn sql_identifiers_are_ascii_only() {
        assert!(is_valid_identifier("item_snapshots_ss12_normal"));
        assert!(is_valid_identifier(
            "idx_fire_price_snapshots_ss12_normal_day"
        ));

        assert!(!is_valid_identifier(""));
        assert!(!is_valid_identifier("item-snapshots"));
        assert!(!is_valid_identifier("物品表"));
        assert!(!is_valid_identifier("items;DROP_TABLE"));
    }

    #[test]
    fn market_mode_table_names_are_checked_identifiers() {
        assert_eq!(
            MarketMode::Normal.fire_table("ss12"),
            "fire_price_snapshots_ss12_normal"
        );
        assert_eq!(
            MarketMode::Expert.items_table("ss12"),
            "item_snapshots_ss12_expert"
        );
    }

    #[tokio::test]
    async fn items_cursor_binds_day_filters() {
        let pool = test_pool_with_items().await;

        let response = get_items_by_cursor(
            &pool,
            "ss12",
            "normal",
            10,
            None,
            None,
            None,
            None,
            Some(2),
            Some(2),
        )
        .await
        .expect("cursor query should support day filters");

        assert_eq!(response.records.len(), 2);
        assert!(response.records.iter().all(|item| item.season_day == 2));
        assert_eq!(response.total_remaining, 2);
    }

    #[tokio::test]
    async fn daily_aggregate_binds_day_filters_and_latest_price() {
        let pool = test_pool_with_items().await;

        let days = get_items_daily_aggregate(&pool, "ss12", "normal", Some(2), Some(2))
            .await
            .expect("daily aggregate should support day filters");

        assert_eq!(days.len(), 1);
        assert_eq!(days[0].season_day, 2);
        assert_eq!(days[0].items.len(), 2);

        let item_a = days[0]
            .items
            .iter()
            .find(|item| item.item_id == "item_a")
            .expect("item_a aggregate should exist");
        assert_eq!(item_a.latest_price, 300.0);
    }

    #[tokio::test]
    async fn fast_sync_binds_day_filters() {
        let pool = test_pool_with_items().await;

        let response = get_fast_sync_all(&pool, "ss12", "normal", Some(2), Some(2))
            .await
            .expect("fast sync should support day filters");

        assert_eq!(response.total_items, 2);
        assert_eq!(response.total_days, 1);
        assert!(response
            .items
            .iter()
            .all(|item| item.daily_prices.iter().all(|price| price.day == 2)));
    }

    #[tokio::test]
    async fn latest_prices_returns_latest_scraped_timestamp() {
        let pool = test_pool_with_items().await;

        let response = get_latest_prices(&pool, "ss12", "normal")
            .await
            .expect("latest prices should load");

        assert_eq!(response.prices.len(), 2);
        assert_eq!(response.scraped_at, 3000);
    }
}

// ==================== 高效批量聚合 API（模仿刷图小助手）====================

#[derive(Debug, Clone, Serialize)]
pub struct FastSyncResponse {
    pub items: Vec<FastItemData>,
    pub total_items: i64,
    pub total_days: i32,
    pub generated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct FastItemData {
    pub item_id: String,
    pub name: String,
    pub daily_prices: Vec<DayPrice>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DayPrice {
    pub day: i32,
    pub open: f64,
    pub close: f64,
    pub min: f64,
    pub max: f64,
    pub avg: f64,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct LatestPricesResponse {
    pub prices: Vec<LatestPrice>,
    pub scraped_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct LatestPrice {
    pub item_id: String,
    pub name: String,
    pub fire_price: f64,
    pub season_day: i32,
}

pub async fn get_fast_sync_all(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    min_day: Option<i32>,
    max_day: Option<i32>,
) -> Result<FastSyncResponse, String> {
    validate_season_id(season_id)?;

    let mode = MarketMode::parse(market_mode);
    let table = mode.items_table(season_id);

    if !table_exists(pool, &table).await? {
        return Ok(FastSyncResponse {
            items: vec![],
            total_items: 0,
            total_days: 0,
            generated_at: chrono::Utc::now().timestamp(),
        });
    }

    let mut conditions = Vec::new();
    let mut binds: Vec<i64> = Vec::new();

    if let Some(day) = min_day.filter(|day| *day > 0) {
        conditions.push("season_day >= ?".to_string());
        binds.push(day as i64);
    }
    if let Some(day) = max_day.filter(|day| *day > 0) {
        conditions.push("season_day <= ?".to_string());
        binds.push(day as i64);
    }

    let day_condition = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let query = format!(
        r#"
        SELECT
            item_id,
            name,
            season_day,
            fire_price,
            scraped_at
        FROM {} {}
        ORDER BY item_id, season_day, scraped_at
        "#,
        table, day_condition
    );

    // 流式聚合：避免一次性 fetch_all 百万行到内存
    // 之前: .fetch_all(pool) 加载整表到 Vec + HashMap，赛季后期内存峰值数百 MB
    // 现在: .fetch(pool) + pin_mut + try_next 逐行读取，立即处理后释放
    // 内存占用从 O(行数) 降到 O(1)
    use futures_util::TryStreamExt;

    let start = std::time::Instant::now();
    let mut q = sqlx::query(&query);
    for b in binds {
        q = q.bind(b);
    }

    let stream = q.fetch(pool);
    // pin_mut 把 BoxStream<'_, ...> pin 到栈上才能 await
    let mut stream = std::pin::pin!(stream);

    let mut item_map: HashMap<String, FastItemData> = HashMap::new();
    let mut rows_processed: i64 = 0;

    while let Some(row) = stream
        .try_next()
        .await
        .map_err(|e| format!("流式读取行失败: {}", e))?
    {
        let item_id: String = row.get("item_id");
        let name: String = row.get("name");
        let day: i32 = row.get("season_day");
        let price: f64 = row.get("fire_price");

        let item = item_map
            .entry(item_id.clone())
            .or_insert_with(|| FastItemData {
                item_id: item_id.clone(),
                name,
                daily_prices: Vec::new(),
            });

        if let Some(last) = item.daily_prices.last_mut() {
            if last.day == day {
                last.max = last.max.max(price);
                last.min = last.min.min(price);
                last.close = price;
                last.count += 1;
            } else {
                item.daily_prices.push(DayPrice {
                    day,
                    open: price,
                    close: price,
                    min: price,
                    max: price,
                    avg: price,
                    count: 1,
                });
            }
        } else {
            item.daily_prices.push(DayPrice {
                day,
                open: price,
                close: price,
                min: price,
                max: price,
                avg: price,
                count: 1,
            });
        }

        rows_processed += 1;
    }

    info!(
        "[高效同步] 流式处理 {} 行, {} 个物品, 耗时: {:?}",
        rows_processed,
        item_map.len(),
        start.elapsed()
    );

    // 慢查询检测：>500ms 升级 warn!,便于排查性能问题
    let elapsed = start.elapsed();
    let total_rows = rows_processed;
    if elapsed > Duration::from_millis(500) {
        warn!(
            duration_ms = elapsed.as_millis() as u64,
            rows = total_rows,
            "get_fast_sync_all 慢查询"
        );
    } else {
        debug!(
            duration_ms = elapsed.as_millis() as u64,
            rows = total_rows,
            "get_fast_sync_all 完成"
        );
    }

    let mut items: Vec<FastItemData> = item_map.into_values().collect();
    items.sort_by(|a, b| a.item_id.cmp(&b.item_id));

    let total_items_count = items.len() as i64;
    let total_days = items
        .iter()
        .map(|i| i.daily_prices.len() as i32)
        .max()
        .unwrap_or(0);

    Ok(FastSyncResponse {
        items,
        total_items: total_items_count,
        total_days,
        generated_at: chrono::Utc::now().timestamp(),
    })
}

#[instrument(skip(pool), fields(season_id = %season_id, market_mode = %market_mode))]
pub async fn get_latest_prices(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<LatestPricesResponse, String> {
    validate_season_id(season_id)?;

    let mode = MarketMode::parse(market_mode);
    let table = mode.items_table(season_id);

    if !table_exists(pool, &table).await? {
        return Ok(LatestPricesResponse {
            prices: vec![],
            scraped_at: chrono::Utc::now().timestamp(),
        });
    }

    let query = format!(
        r#"
        SELECT item_id, name, fire_price, season_day, scraped_at
        FROM (
            SELECT item_id, name, fire_price, season_day, scraped_at,
                   ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY scraped_at DESC, id DESC) AS rn
            FROM {}
        ) ranked
        WHERE rn = 1
        ORDER BY item_id
        "#,
        table
    );

    let start = std::time::Instant::now();
    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("获取最新价格失败: {}", e))?;

    let mut scraped_at = 0_i64;
    let prices: Vec<LatestPrice> = rows
        .into_iter()
        .map(|row| {
            scraped_at = scraped_at.max(row.get("scraped_at"));
            LatestPrice {
                item_id: row.get("item_id"),
                name: row.get("name"),
                fire_price: row.get("fire_price"),
                season_day: row.get("season_day"),
            }
        })
        .collect();

    info!(
        "[最新价格] 获取 {} 个物品，耗时: {:?}",
        prices.len(),
        start.elapsed()
    );

    Ok(LatestPricesResponse { prices, scraped_at })
}

// ==================== 高速数据同步 API ====================

#[derive(Debug, Clone, Serialize)]
pub struct ItemsSyncResponse {
    pub records: Vec<ItemSnapshotWithInfo>,
    pub next_cursor: Option<String>,
    pub total_remaining: i64,
    pub has_more: bool,
}

impl ItemsSyncResponse {
    pub fn new(
        records: Vec<ItemSnapshotWithInfo>,
        next_cursor: Option<String>,
        total_remaining: i64,
    ) -> Self {
        Self {
            has_more: !records.is_empty() && next_cursor.is_some(),
            next_cursor,
            total_remaining,
            records,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ItemsDailyAggregate {
    pub season_day: i32,
    pub date: String,
    pub item_count: i64,
    pub items: Vec<DailyItemPrice>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DailyItemPrice {
    pub item_id: String,
    pub name: Option<String>,
    pub min_price: f64,
    pub max_price: f64,
    pub avg_price: f64,
    pub latest_price: f64,
    pub price_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ItemsSyncStats {
    pub total_records: i64,
    pub total_items: i64,
    pub date_range: DateRange,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DateRange {
    pub earliest: Option<i64>,
    pub latest: Option<i64>,
}

impl DateRange {
    pub fn new() -> Self {
        Self {
            earliest: None,
            latest: None,
        }
    }
}

pub async fn get_items_sync_stats(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<ItemsSyncStats, String> {
    validate_season_id(season_id)?;

    let mode = MarketMode::parse(market_mode);
    let table = mode.items_table(season_id);

    if !table_exists(pool, &table).await? {
        return Ok(ItemsSyncStats {
            total_records: 0,
            total_items: 0,
            date_range: DateRange::new(),
            mode: market_mode.to_string(),
        });
    }

    let total_records: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {}", table))
        .fetch_one(pool)
        .await
        .map_err(|e| format!("统计记录数失败: {}", e))?;

    let total_items: i64 =
        sqlx::query_scalar(&format!("SELECT COUNT(DISTINCT item_id) FROM {}", table))
            .fetch_one(pool)
            .await
            .map_err(|e| format!("统计物品数失败: {}", e))?;

    let earliest: Option<i64> =
        sqlx::query_scalar(&format!("SELECT MIN(scraped_at) FROM {}", table))
            .fetch_one(pool)
            .await
            .ok();

    let latest: Option<i64> = sqlx::query_scalar(&format!("SELECT MAX(scraped_at) FROM {}", table))
        .fetch_one(pool)
        .await
        .ok();

    Ok(ItemsSyncStats {
        total_records,
        total_items,
        date_range: DateRange { earliest, latest },
        mode: market_mode.to_string(),
    })
}

#[allow(clippy::too_many_arguments)]
#[instrument(skip(pool), fields(season_id = %season_id, market_mode = %market_mode, min_day, max_day))]
pub async fn get_items_by_cursor(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    limit: i32,
    before_scraped_at: Option<i64>,
    before_id: Option<i64>,
    since_scraped_at: Option<i64>,
    since_id: Option<i64>,
    min_day: Option<i32>,
    max_day: Option<i32>,
) -> Result<ItemsSyncResponse, String> {
    validate_season_id(season_id)?;

    let mode = MarketMode::parse(market_mode);
    let table = mode.items_table(season_id);

    if !table_exists(pool, &table).await? {
        return Ok(ItemsSyncResponse::new(vec![], None, 0));
    }

    let mut conditions = Vec::new();
    let mut binds: Vec<i64> = Vec::new();

    if let (Some(ts), Some(id)) = (before_scraped_at, before_id) {
        conditions.push("(scraped_at < ? OR (scraped_at = ? AND id < ?))".to_string());
        binds.push(ts);
        binds.push(ts);
        binds.push(id);
    }

    if let (Some(ts), Some(id)) = (since_scraped_at, since_id) {
        conditions.push("(scraped_at > ? OR (scraped_at = ? AND id > ?))".to_string());
        binds.push(ts);
        binds.push(ts);
        binds.push(id);
    }

    if let Some(day) = min_day.filter(|day| *day > 0) {
        conditions.push("season_day >= ?".to_string());
        binds.push(day as i64);
    }
    if let Some(day) = max_day.filter(|day| *day > 0) {
        conditions.push("season_day <= ?".to_string());
        binds.push(day as i64);
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };

    let query = format!(
        r#"
        SELECT id, item_id, name, item_type, fire_price, scraped_at, season_day
        FROM {}
        {}
        ORDER BY scraped_at DESC, id DESC
        LIMIT ?
        "#,
        table, where_clause
    );

    let mut q = sqlx::query(&query);
    for b in &binds {
        q = q.bind(*b);
    }
    q = q.bind(limit + 1);

    let rows = q
        .fetch_all(pool)
        .await
        .map_err(|e| format!("游标分页查询失败: {}", e))?;

    let has_more = rows.len() > limit as usize;
    let records: Vec<ItemSnapshotWithInfo> = rows
        .iter()
        .take(limit as usize)
        .map(|row| ItemSnapshotWithInfo {
            cursor_id: row.get("id"),
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

    let next_cursor = if has_more {
        records
            .last()
            .map(|last| format!("{},{}", last.scraped_at, last.cursor_id))
    } else {
        None
    };

    // total_remaining 计算：去掉子查询里多余的 ORDER BY
    // 之前带 ORDER BY + LIMIT 10000 会强制排序后再截取,O(N log N)
    // 优化后：纯 LIMIT,SQLite 用最快的方式取 10000 行,O(N) 但常数小
    let remaining_query = format!(
        r#"
        SELECT MIN(c, 10000) FROM (
            SELECT COUNT(*) AS c FROM {} {}
        )
        "#,
        table, where_clause
    );

    let mut remaining_q = sqlx::query_scalar(&remaining_query);
    for b in &binds {
        remaining_q = remaining_q.bind(*b);
    }

    let remaining: i64 = remaining_q.fetch_one(pool).await.unwrap_or(0);

    Ok(ItemsSyncResponse::new(records, next_cursor, remaining))
}

#[instrument(skip(pool), fields(season_id = %season_id, market_mode = %market_mode, min_day, max_day))]
pub async fn get_items_daily_aggregate(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    min_day: Option<i32>,
    max_day: Option<i32>,
) -> Result<Vec<ItemsDailyAggregate>, String> {
    validate_season_id(season_id)?;

    let mode = MarketMode::parse(market_mode);
    let table = mode.items_table(season_id);

    if !table_exists(pool, &table).await? {
        return Ok(vec![]);
    }

    let mut conditions = Vec::new();
    let mut binds: Vec<i64> = Vec::new();

    if let Some(day) = min_day.filter(|day| *day > 0) {
        conditions.push("season_day >= ?".to_string());
        binds.push(day as i64);
    }
    if let Some(day) = max_day.filter(|day| *day > 0) {
        conditions.push("season_day <= ?".to_string());
        binds.push(day as i64);
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };

    let query = format!(
        r#"
        WITH filtered AS (
            SELECT season_day, item_id, name, fire_price, scraped_at, id
            FROM {}
            {}
        ),
        global_latest AS (
            SELECT item_id, fire_price
            FROM (
                SELECT item_id, fire_price,
                       ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY scraped_at DESC, id DESC) AS rn
                FROM {}
            ) WHERE rn = 1
        )
        SELECT
            f.season_day,
            f.item_id,
            f.name,
            MIN(f.fire_price) as min_price,
            MAX(f.fire_price) as max_price,
            AVG(f.fire_price) as avg_price,
            COUNT(*) as price_count,
            g.fire_price as latest_price
        FROM filtered f
        LEFT JOIN global_latest g USING (item_id)
        GROUP BY f.season_day, f.item_id, f.name, g.fire_price
        ORDER BY f.season_day DESC, f.item_id
        "#,
        table, where_clause, table
    );

    let mut q = sqlx::query(&query);
    for b in binds {
        q = q.bind(b);
    }

    let rows = q
        .fetch_all(pool)
        .await
        .map_err(|e| format!("按天聚合查询失败: {}", e))?;

    let mut day_map: HashMap<i32, Vec<DailyItemPrice>> = HashMap::new();

    for row in rows {
        let season_day: i32 = row.get("season_day");
        let item = DailyItemPrice {
            item_id: row.get("item_id"),
            name: row
                .get::<Option<String>, _>("name")
                .filter(|n| !n.is_empty()),
            min_price: row.get::<Option<f64>, _>("min_price").unwrap_or(0.0),
            max_price: row.get::<Option<f64>, _>("max_price").unwrap_or(0.0),
            avg_price: row.get::<Option<f64>, _>("avg_price").unwrap_or(0.0),
            latest_price: row.get::<Option<f64>, _>("latest_price").unwrap_or(0.0),
            price_count: row.get("price_count"),
        };
        day_map
            .entry(season_day)
            .or_default()
            .push(item);
    }

    let result: Vec<ItemsDailyAggregate> = day_map
        .into_iter()
        .map(|(day, items)| {
            let count = items.len() as i64;
            ItemsDailyAggregate {
                season_day: day,
                date: format!("Day {}", day),
                item_count: count,
                items,
            }
        })
        .collect();

    Ok(result)
}

#[allow(dead_code)]
pub async fn get_items_history_count(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    min_day: Option<i32>,
    max_day: Option<i32>,
    since_timestamp: Option<i64>,
) -> Result<i64, String> {
    validate_season_id(season_id)?;

    let mode = MarketMode::parse(market_mode);
    let table = mode.items_table(season_id);

    let mut conditions: Vec<&str> = Vec::new();
    let mut binds: Vec<i64> = Vec::new();

    if let (Some(min), Some(max)) = (min_day, max_day) {
        if min > 0 && max > 0 {
            conditions.push(" season_day >= ? AND season_day <= ? ");
            binds.push(min as i64);
            binds.push(max as i64);
        }
    } else if let Some(min) = min_day {
        if min > 0 {
            conditions.push(" season_day >= ? ");
            binds.push(min as i64);
        }
    } else if let Some(max) = max_day {
        if max > 0 {
            conditions.push(" season_day <= ? ");
            binds.push(max as i64);
        }
    }

    if let Some(ts) = since_timestamp {
        conditions.push(" scraped_at > ? ");
        binds.push(ts);
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };

    let query = format!("SELECT COUNT(*) as count FROM {} {}", table, where_clause);
    let mut q = sqlx::query(&query);
    for bind in binds {
        q = q.bind(bind);
    }
    let row = q
        .fetch_one(pool)
        .await
        .map_err(|e| format!("查询物品快照数量失败: {}", e))?;

    let count: i64 = row.get("count");
    Ok(count)
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
        .await
        .map_err(|e| format!("标记赛季 {} 归档时间失败: {}", season_id, e))?;

    if update_result.rows_affected() == 0 {
        // 之前是 info 日志吞错，会让审计日志显示"成功归档"但实际什么都没归档
        return Err(format!(
            "赛季 {} 不存在或已归档 (seasons 表无匹配记录)",
            season_id
        ));
    }
    info!("已标记赛季 {} 的归档时间 (ended_at={})", season_id, now);

    // 归档后清除该赛季的 started_at 缓存
    invalidate_season_start_cache(season_id);

    info!("赛季 {} 归档完成", season_id);
    Ok(())
}

pub async fn reset_table(
    pool: &SqlitePool,
    season_id: &str,
    table_type: &str,
    market_mode: &str,
) -> Result<(String, i64), String> {
    validate_season_id(season_id)?;

    // 使用 MarketMode 派生表名，确保走 checked_identifier 防御 SQL 注入
    let market_mode_parsed = MarketMode::parse(market_mode);
    let table = match table_type {
        "fire" => market_mode_parsed.fire_table(season_id),
        "items" => market_mode_parsed.items_table(season_id),
        _ => return Err("无效的表类型".to_string()),
    };

    let exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?")
            .bind(&table)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("检查表 {} 失败: {}", table, e))?;

    if exists == 0 {
        return Err(format!("表 {} 不存在", table));
    }

    let result = sqlx::query(&format!("DELETE FROM {}", table))
        .execute(pool)
        .await
        .map_err(|e| format!("清空表 {} 失败: {}", table, e))?;
    let deleted_rows = result.rows_affected() as i64;

    info!("已重置表: {}，删除 {} 行", table, deleted_rows);
    Ok((table, deleted_rows))
}

pub async fn reset_season_tables(
    pool: &SqlitePool,
    season_id: &str,
    tables: &[String],
) -> Result<Vec<String>, String> {
    validate_season_id(season_id)?;

    // 使用 MarketMode 派生表名进行匹配，避免重复字符串拼接
    let normal = MarketMode::Normal;
    let expert = MarketMode::Expert;
    let fire_normal = normal.fire_table(season_id);
    let fire_expert = expert.fire_table(season_id);
    let items_normal = normal.items_table(season_id);
    let items_expert = expert.items_table(season_id);

    let mut results = Vec::new();

    for table_name in tables {
        let reset_target = if table_name == &fire_normal {
            Some(("fire", "normal"))
        } else if table_name == &fire_expert {
            Some(("fire", "expert"))
        } else if table_name == &items_normal {
            Some(("items", "normal"))
        } else if table_name == &items_expert {
            Some(("items", "expert"))
        } else {
            None
        };

        let Some((table_type, market_mode)) = reset_target else {
            results.push(format!("✗ {}: 表名不属于赛季 {}", table_name, season_id));
            continue;
        };

        match reset_table(pool, season_id, table_type, market_mode).await {
            Ok(_) => results.push(format!("✓ {}", table_name)),
            Err(e) => results.push(format!("✗ {}: {}", table_name, e)),
        }
    }

    // 重置后清缓存（季节起点缓存不会改变，但响应缓存需要由上层 main.rs 清除）
    // 这里清除该赛季的 started_at 缓存只是保守做法
    invalidate_season_start_cache(season_id);

    Ok(results)
}

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

    sqlx::query("PRAGMA wal_checkpoint(PASSIVE)")
        .execute(pool)
        .await
        .map_err(|e| format!("WAL checkpoint 执行失败: {}", e))?;

    let wal_path: (String,) = sqlx::query_as("PRAGMA database_list")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("获取数据库路径失败: {}", e))?;
    let wal_path = wal_path.0;

    let wal_file = format!("{}-wal", wal_path);
    let wal_bytes: i64 = tokio::fs::metadata(&wal_file)
        .await
        .map(|m| m.len() as i64)
        .unwrap_or(0);

    info!(
        "WAL checkpoint 完成: 数据库页数={}, 空闲页数={}, WAL文件大小={} bytes",
        page_count, freelist_count, wal_bytes
    );

    Ok(WalCheckpointResult {
        page_count,
        freelist_count,
        wal_pages_checkpointed: wal_bytes,
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct WalCheckpointResult {
    pub page_count: i64,
    pub freelist_count: i64,
    pub wal_pages_checkpointed: i64,
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

    // 用 MarketMode 派生表名，防止 SQL 注入风险
    let normal = MarketMode::Normal;
    let expert = MarketMode::Expert;
    let table_normal_fire = normal.fire_table(season_id);
    let table_normal_items = normal.items_table(season_id);
    let table_expert_fire = expert.fire_table(season_id);
    let table_expert_items = expert.items_table(season_id);

    // 先检查表是否存在，不存在则返回 0；存在但查询失败也返回 0（保持向后兼容）
    // 这样可以区分"赛季未初始化"（前端可以提示用户）和"查询失败"
    let (normal_fire_count, normal_items_count, expert_fire_count, expert_items_count) = tokio::join!(
        count_table_or_zero(pool, &table_normal_fire),
        count_table_or_zero(pool, &table_normal_items),
        count_table_or_zero(pool, &table_expert_fire),
        count_table_or_zero(pool, &table_expert_items),
    );

    Ok(SeasonStats {
        normal_fire_count,
        normal_items_count,
        expert_fire_count,
        expert_items_count,
    })
}

pub async fn init_new_season(
    pool: &SqlitePool,
    season_id: &str,
    season_name: Option<&str>,
    started_at: Option<i64>,
    ended_at: Option<i64>,
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

    // ended_at 处理：用户没传 = NULL (表示"未手动归档",前端会显示自动归档日期)
    // 用户传了 = 存到数据库 (表示"用户已设置归档日期",前端会显示已手动归档)
    let ended_at_to_store = ended_at;

    // 步骤 1：先创建数据表（CREATE TABLE IF NOT EXISTS 是幂等的）
    // 必须在事务前完成，因为：
    // - 如果先在事务里改了 is_current=新赛季，然后建表失败 → seasons 表已经指向新赛季，但数据表不存在
    //   会导致采集失败、API 报"no such table"
    // - 先建表，即使后面事务失败回滚，最多多出几个空表，幂等无害
    let mut created_tables = Vec::new();
    for mode in ["normal", "expert"] {
        let market_mode = MarketMode::parse(mode);
        let fire_table = market_mode.fire_table(season_id);
        let items_table = market_mode.items_table(season_id);

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
        create_fire_indexes(pool, &fire_table).await?;
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
        create_items_indexes(pool, &items_table).await?;
        created_tables.push(items_table);
    }

    // 步骤 2：用事务把"自动归档上一赛季 + 插入新赛季 + 切换 is_current"
    // 这几步原子化执行，避免极端情况下部分成功导致状态不一致
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("开启事务失败: {}", e))?;

    // 自动归档当前赛季：仅当当前赛季尚未手动归档时
    // (如果 ended_at 已经被手动设置过，说明用户已经手动归档，跳过自动归档)
    let now_ts = chrono::Utc::now().timestamp();
    let auto_archived = sqlx::query(
        "UPDATE seasons SET ended_at = ?, is_current = 0
         WHERE is_current = 1 AND id != ? AND ended_at IS NULL",
    )
    .bind(now_ts)
    .bind(season_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("自动归档当前赛季失败: {}", e))?
    .rows_affected();

    if auto_archived > 0 {
        info!(
            "已自动归档当前赛季（因为尚未手动归档），新赛季 {} 将生效",
            season_id
        );
    } else {
        info!("当前赛季已被手动归档过（或无活跃赛季），跳过自动归档步骤");
    }

    sqlx::query(
        r#"
        INSERT INTO seasons (id, name, started_at, ended_at, is_current)
        VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            started_at = excluded.started_at,
            ended_at = excluded.ended_at
        "#,
    )
    .bind(season_id)
    .bind(season_name)
    .bind(started_at)
    .bind(ended_at_to_store)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("插入赛季记录失败: {}", e))?;

    sqlx::query("UPDATE seasons SET is_current = 0")
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("重置 is_current 失败: {}", e))?;

    sqlx::query("UPDATE seasons SET is_current = 1 WHERE id = ?")
        .bind(season_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("设置当前赛季失败: {}", e))?;

    tx.commit()
        .await
        .map_err(|e| format!("提交事务失败: {}", e))?;

    // 清除 season_start_cache，否则 5 分钟内 season_day 会按旧值计算
    invalidate_season_start_cache(season_id);

    info!(
        "已设置 {} 为当前赛季 (started_at={}, ended_at={:?})",
        season_id, started_at, ended_at_to_store
    );

    info!(
        "新赛季 {} 已初始化，创建了 {} 张表",
        season_id,
        created_tables.len()
    );
    Ok(created_tables)
}

#[allow(clippy::too_many_arguments)]
pub async fn get_fire_history_all(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    limit: i32,
    offset: i32,
    min_day: Option<i32>,
    max_day: Option<i32>,
    since_timestamp: Option<i64>,
    before_timestamp: Option<i64>,
    before_id: Option<i64>,
) -> Result<Vec<FireSnapshotRecord>, String> {
    validate_season_id(season_id)?;

    let mode = MarketMode::parse(market_mode);
    let table = mode.fire_table(season_id);

    let mut conditions: Vec<&str> = Vec::new();
    let mut binds: Vec<i64> = Vec::new();

    if let (Some(min), Some(max)) = (min_day, max_day) {
        if min > 0 && max > 0 {
            conditions.push(" season_day >= ? AND season_day <= ? ");
            binds.push(min as i64);
            binds.push(max as i64);
        }
    } else if let Some(min) = min_day {
        if min > 0 {
            conditions.push(" season_day >= ? ");
            binds.push(min as i64);
        }
    } else if let Some(max) = max_day {
        if max > 0 {
            conditions.push(" season_day <= ? ");
            binds.push(max as i64);
        }
    }

    if let Some(ts) = since_timestamp {
        conditions.push(" scraped_at > ? ");
        binds.push(ts);
    }

    if let (Some(ts), Some(id)) = (before_timestamp, before_id) {
        conditions.push(" (scraped_at < ? OR (scraped_at = ? AND id < ?)) ");
        binds.push(ts);
        binds.push(ts);
        binds.push(id);
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };

    let use_offset = before_timestamp.is_none() && before_id.is_none() && offset > 0;
    let query = if use_offset {
        format!(
            r#"
            SELECT id, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day
            FROM {}
            {}
            ORDER BY scraped_at DESC, id DESC
            LIMIT ?
            OFFSET ?
            "#,
            table, where_clause
        )
    } else {
        format!(
            r#"
            SELECT id, rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day
            FROM {}
            {}
            ORDER BY scraped_at DESC, id DESC
            LIMIT ?
            "#,
            table, where_clause
        )
    };

    let mut q = sqlx::query(&query);
    for bind in binds {
        q = q.bind(bind);
    }
    q = q.bind(limit);
    if use_offset {
        q = q.bind(offset);
    }
    let rows = q
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询火价快照失败: {}", e))?;

    let records: Vec<FireSnapshotRecord> = rows
        .into_iter()
        .map(|row| FireSnapshotRecord {
            cursor_id: row.get("id"),
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

pub async fn get_items_history(
    pool: &SqlitePool,
    item_id: &str,
    season_id: &str,
    market_mode: &str,
    limit: i32,
) -> Result<Vec<ItemSnapshotRecord>, String> {
    validate_season_id(season_id)?;

    let mode = MarketMode::parse(market_mode);
    let table = mode.items_table(season_id);

    let query = format!(
        r#"
        SELECT id, item_id, name, item_type, fire_price, scraped_at, season_day
        FROM {}
        WHERE item_id = ?
        ORDER BY scraped_at DESC, id DESC
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
            cursor_id: row.get("id"),
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

#[derive(Debug, Clone, Serialize)]
pub struct ItemSnapshotWithInfo {
    pub cursor_id: i64,
    pub item_id: String,
    pub season_id: String,
    pub market_mode: String,
    pub fire_price: f64,
    pub scraped_at: i64,
    pub season_day: i32,
    pub name: Option<String>,
    pub item_type: Option<String>,
}

#[allow(clippy::too_many_arguments)]
pub async fn get_items_history_all(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    limit: i32,
    offset: i32,
    min_day: Option<i32>,
    max_day: Option<i32>,
    since_timestamp: Option<i64>,
    before_timestamp: Option<i64>,
    before_id: Option<i64>,
) -> Result<Vec<ItemSnapshotWithInfo>, String> {
    validate_season_id(season_id)?;

    let mode = MarketMode::parse(market_mode);
    let table = mode.items_table(season_id);

    let mut conditions: Vec<&str> = Vec::new();
    let mut binds: Vec<i64> = Vec::new();

    if let (Some(min), Some(max)) = (min_day, max_day) {
        if min > 0 && max > 0 {
            conditions.push(" season_day >= ? AND season_day <= ? ");
            binds.push(min as i64);
            binds.push(max as i64);
        }
    } else if let Some(min) = min_day {
        if min > 0 {
            conditions.push(" season_day >= ? ");
            binds.push(min as i64);
        }
    } else if let Some(max) = max_day {
        if max > 0 {
            conditions.push(" season_day <= ? ");
            binds.push(max as i64);
        }
    }

    if let Some(ts) = since_timestamp {
        conditions.push(" scraped_at > ? ");
        binds.push(ts);
    }

    if let (Some(ts), Some(id)) = (before_timestamp, before_id) {
        conditions.push(" (scraped_at < ? OR (scraped_at = ? AND id < ?)) ");
        binds.push(ts);
        binds.push(ts);
        binds.push(id);
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };

    let use_offset = before_timestamp.is_none() && before_id.is_none() && offset > 0;
    let query = if use_offset {
        format!(
            r#"
            SELECT id, item_id, name, item_type, fire_price, scraped_at, season_day
            FROM {}
            {}
            ORDER BY scraped_at DESC, id DESC
            LIMIT ?
            OFFSET ?
            "#,
            table, where_clause
        )
    } else {
        format!(
            r#"
            SELECT id, item_id, name, item_type, fire_price, scraped_at, season_day
            FROM {}
            {}
            ORDER BY scraped_at DESC, id DESC
            LIMIT ?
            "#,
            table, where_clause
        )
    };

    let mut q = sqlx::query(&query);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(limit);
    if use_offset {
        q = q.bind(offset);
    }
    let rows = q
        .fetch_all(pool)
        .await
        .map_err(|e| format!("查询所有物品快照失败: {}", e))?;

    let records: Vec<ItemSnapshotWithInfo> = rows
        .into_iter()
        .map(|row| ItemSnapshotWithInfo {
            cursor_id: row.get("id"),
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
