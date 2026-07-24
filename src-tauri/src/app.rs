#![allow(clippy::items_after_test_module)]

use crate::core::paths;
use crate::core::state::{
    AppConfig, AppState, FirePriceSnapshot, MarketContext, MarketMode, TaskStatus,
};
use crate::db::models::Item;
use crate::db::repo_fire;
use crate::db::repo_item_realtime_prices;
use crate::db::repo_items;
use crate::scheduler::alert_task::run_price_alert_task;
use crate::scheduler::fire_task::run_fire_scrape_task;
use crate::scheduler::fire_gap_filler::run_fire_gap_filler_task;
use crate::scheduler::history_task::run_hourly_snapshot_task;
use crate::scheduler::items_task::run_items_reload_task;
use crate::scheduler::SchedulerHandle;
use parking_lot::RwLock;
use serde::Deserialize;
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tokio::sync::broadcast;

const LATEST_SCHEMA_VERSION: i64 = 24;
const MAX_MIGRATION_BACKUPS: usize = 3;

pub fn full_table_json_path() -> std::path::PathBuf {
    paths::data_dir().join("full_table.json")
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct JsonItemEntry {
    id: String,
    name: String,
    price: f64,
    #[serde(rename = "last_time")]
    last_time: i64,
    source: String,
}

/// Load and parse JSON file, returning items ready for bulk insert.
pub async fn load_items_from_json(
    season_id: &str,
    market_mode: &str,
    json_path: &str,
) -> Result<Vec<Item>, String> {
    let path = std::path::PathBuf::from(json_path);
    tracing::info!("load_items_from_json: reading from {:?}", path);

    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    tracing::info!(
        "load_items_from_json: JSON file size = {} bytes",
        content.len()
    );

    let map: std::collections::HashMap<String, JsonItemEntry> =
        serde_json::from_str(&content).map_err(|e| format!("JSON parse error: {}", e))?;

    tracing::info!(
        "load_items_from_json: parsed {} entries from JSON",
        map.len()
    );

    if map.is_empty() {
        tracing::warn!("load_items_from_json: JSON file is empty or has no valid entries!");
        return Ok(Vec::new());
    }

    let sample_keys: Vec<String> = map.keys().take(3).cloned().collect();
    tracing::info!("load_items_from_json: sample keys = {:?}", sample_keys);

    let sample_entry = map.values().next();
    if let Some(entry) = sample_entry {
        tracing::info!(
            "load_items_from_json: first entry = id={}, name={}, price={}",
            entry.id,
            entry.name,
            entry.price
        );
    }

    let now = chrono::Utc::now().timestamp();
    let items: Vec<Item> = map
        .into_values()
        .map(|entry| Item {
            item_id: entry.id.clone(),
            season_id: season_id.to_string(),
            market_mode: market_mode.to_string(),
            name: entry.name.clone(),
            item_type: String::new(),
            source: "local_json".to_string(),
            price: entry.price,
            last_time: Some(entry.last_time),
            updated_at: now,
        })
        .collect();

    tracing::info!(
        "load_items_from_json: converted {} entries to Item struct",
        items.len()
    );
    if !items.is_empty() {
        tracing::info!(
            "load_items_from_json: first item = {:?}, last item = {:?}",
            (&items[0].item_id, &items[0].name, &items[0].price),
            (
                &items[items.len() - 1].item_id,
                &items[items.len() - 1].name,
                &items[items.len() - 1].price
            )
        );
    }

    Ok(items)
}

pub async fn init_app(_app_handle: &tauri::AppHandle) -> Result<AppState, String> {
    let db_path = paths::db_path();
    let db_existed = db_path.exists();
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    if let Some(parent) = db_path.parent() {
        tokio::fs::create_dir_all(parent).await.ok();
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .min_connections(2)
        .acquire_timeout(std::time::Duration::from_secs(30))
        .idle_timeout(std::time::Duration::from_secs(300))
        .max_lifetime(std::time::Duration::from_secs(1800))
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                // Enable WAL mode for better concurrent read/write performance
                sqlx::query("PRAGMA journal_mode = WAL")
                    .execute(&mut *conn)
                    .await?;
                sqlx::query("PRAGMA synchronous = NORMAL")
                    .execute(&mut *conn)
                    .await?;
                sqlx::query("PRAGMA cache_size = -64000")
                    .execute(&mut *conn)
                    .await?;
                sqlx::query("PRAGMA temp_store = MEMORY")
                    .execute(&mut *conn)
                    .await?;
                sqlx::query("PRAGMA mmap_size = 268435456")
                    .execute(&mut *conn)
                    .await?;
                sqlx::query("PRAGMA foreign_keys = ON")
                    .execute(&mut *conn)
                    .await?;
                Ok(())
            })
        })
        .connect(&db_url)
        .await
        .map_err(|e| e.to_string())?;

    run_migrations(&pool, &db_path, db_existed).await?;

    let mut config = crate::core::config::load_config().unwrap_or_else(|e| {
        tracing::warn!("Failed to load config.yaml: {}", e);
        AppConfig::default()
    });

    // The database current-season marker is authoritative. This also recovers
    // from a process exit after the DB transaction committed but before the
    // YAML config file was updated.
    let database_season: Option<String> = sqlx::query_scalar(
        "SELECT id FROM seasons WHERE is_current = 1 ORDER BY updated_at DESC LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to load current season from database: {}", e))?;
    if let Some(database_season) = database_season {
        if config.app.season_id != database_season {
            tracing::info!(
                "[STARTUP] Repairing config season {} from database value {}",
                config.app.season_id,
                database_season
            );
            config.app.season_id = database_season;
            if let Err(e) = crate::core::config::save_config(&config) {
                tracing::warn!("Failed to persist repaired season config: {}", e);
            }
        }
    }

    // Startup fire scraping begins with normal mode, so keep the initial UI
    // context aligned even if the previous session ended in expert mode.
    config.scrape.fire_price_mode = MarketMode::SeasonNormal.as_str().to_string();

    let default_season = config.app.season_id.clone();
    let market_mode = MarketMode::SeasonNormal;

    tracing::info!(
        "[STARTUP] Loading cached state for season={}, mode={}",
        default_season,
        market_mode.as_str()
    );

    let mut fire_prices: std::collections::HashMap<
        MarketMode,
        crate::core::state::FirePriceSnapshot,
    > = std::collections::HashMap::new();

    for (mode_str, mode_key) in [
        ("season_normal", MarketMode::SeasonNormal),
        ("season_expert", MarketMode::SeasonExpert),
    ] {
        match repo_fire::get_latest_fire(&pool, &default_season, mode_str).await {
            Ok(Some(record)) => {
                let snapshot = fire_record_to_snapshot(record);
                tracing::info!(
                    "[STARTUP] Using cached {} fire price: {} RMB/10K fire",
                    mode_str,
                    snapshot.rmb_per_10k_fire
                );
                fire_prices.insert(mode_key, snapshot);
            }
            Ok(None) => {
                tracing::info!("[STARTUP] No cached {} fire price found", mode_str);
            }
            Err(e) => {
                tracing::warn!(
                    "[STARTUP] Failed to load cached {} fire price: {}",
                    mode_str,
                    e
                );
            }
        }
    }

    let items_cache = match repo_items::get_items_from_realtime_table(
        &pool,
        &default_season,
        market_mode.as_str(),
    )
    .await
    {
        Ok(items) => {
            tracing::info!("[STARTUP] Loaded {} cached items", items.len());
            items
        }
        Err(e) => {
            tracing::warn!("[STARTUP] Failed to load cached items: {}", e);
            Vec::new()
        }
    };

    // Cleanup old realtime records
    if let Err(e) = repo_item_realtime_prices::cleanup_old_records(&pool).await {
        tracing::warn!("[STARTUP] Failed to cleanup old realtime records: {}", e);
    }

    let state = AppState {
        db: pool,
        config: RwLock::new(config.clone()),
        fire_prices: RwLock::new(fire_prices),
        items_cache: RwLock::new(Arc::new(items_cache)),
        active_context: RwLock::new(MarketContext {
            season_id: config.app.season_id.clone(),
            market_mode,
        }),
        task_status: RwLock::new(TaskStatus {
            fire_scrape_running: false,
            items_reload_running: false,
            last_fire_scrape: None,
            last_items_reload: None,
            db_size_kb: 0.0,
        }),
        scheduler_handle: RwLock::new(None),
        items_refresh_running: AtomicBool::new(false),
        snapshot_running: AtomicBool::new(false),
        is_quitting: AtomicBool::new(false),
    };

    // 加载本地对照表文件（如果存在），覆盖内置对照表
    crate::commands::mapping::load_local_mapping_if_exists();

    Ok(state)
}

fn fire_record_to_snapshot(record: crate::db::models::FirePriceRecord) -> FirePriceSnapshot {
    FirePriceSnapshot {
        price_per_wan: if record.fire_per_rmb > 0.0 {
            10000.0 / record.fire_per_rmb
        } else {
            0.0
        },
        rmb_per_10k_fire: record.rmb_per_10k_fire,
        fire_per_rmb: record.fire_per_rmb,
        increase_ratio: record.increase_ratio,
        trading_volume: record.trading_volume,
        source: record.source,
        source_time: record.source_time,
        scraped_at: record.scraped_at,
    }
}

async fn run_migrations(pool: &SqlitePool, db_path: &Path, db_existed: bool) -> Result<(), String> {
    ensure_migrations_table(pool).await?;

    let has_user_schema = has_user_schema(pool).await?;
    let current_version = read_schema_version(pool).await?;
    let is_fresh_database = !db_existed || !has_user_schema;

    tracing::info!(
        "Current database schema version: {}, latest: {}, fresh: {}",
        current_version,
        LATEST_SCHEMA_VERSION,
        is_fresh_database
    );

    if is_fresh_database {
        tracing::info!("Initializing fresh database with latest schema baseline");
        create_latest_schema_baseline(pool).await?;
        finalize_schema(pool).await?;
        record_all_migrations(pool).await?;
        validate_database(pool).await?;
        tracing::info!(
            "Fresh database initialized at schema v{}",
            LATEST_SCHEMA_VERSION
        );
        return Ok(());
    }

    if current_version > LATEST_SCHEMA_VERSION {
        tracing::warn!(
            "Database schema v{} is newer than this app supports (v{}); running compatibility checks only",
            current_version,
            LATEST_SCHEMA_VERSION
        );
    } else if current_version < LATEST_SCHEMA_VERSION {
        let backup_path = create_migration_backup(pool, db_path, current_version).await?;
        tracing::info!("Created pre-migration database backup at {:?}", backup_path);
        run_legacy_migrations(pool, current_version).await?;
    }

    finalize_schema(pool).await?;
    validate_database(pool).await?;
    optimize_database(pool).await?;

    if let Err(e) = crate::db::repo_items::fix_corrupted_item_types(pool).await {
        tracing::warn!("[STARTUP] Failed to fix corrupted item types: {}", e);
    }

    if let Err(e) = crate::db::repo_history::fix_bad_scraped_at_and_season_day(pool).await {
        tracing::warn!("[STARTUP] Failed to fix bad scraped_at/season_day: {}", e);
    }

    if let Err(e) = crate::db::repo_history::recalculate_all_season_days(pool).await {
        tracing::warn!("[STARTUP] Failed to recalculate season_day: {}", e);
    }

    tracing::info!("Database migrations complete");
    Ok(())
}

async fn ensure_migrations_table(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create _migrations: {}", e))?;
    Ok(())
}

async fn read_schema_version(pool: &SqlitePool) -> Result<i64, String> {
    sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) FROM _migrations")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to read migration version: {}", e))
}

async fn has_user_schema(pool: &SqlitePool) -> Result<bool, String> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)
         FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
           AND name != '_migrations'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to inspect existing schema: {}", e))?;
    Ok(count > 0)
}

async fn create_latest_schema_baseline(pool: &SqlitePool) -> Result<(), String> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to start baseline transaction: {}", e))?;

    sqlx::query(include_str!("db/migrations/001_initial.sql"))
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to create baseline schema: {}", e))?;

    sqlx::query(include_str!(
        "db/migrations/019_create_inventory_tables.sql"
    ))
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Failed to create inventory baseline schema: {}", e))?;

    sqlx::query(include_str!("db/migrations/020_add_inventory_indexes.sql"))
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to create inventory baseline indexes: {}", e))?;

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit baseline schema: {}", e))?;
    Ok(())
}

async fn apply_column_if_not_exists(
    pool: &SqlitePool,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let table = safe_sql_identifier(table, "alter table")?;
    let column = safe_sql_identifier(column, "alter column")?;
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pragma_table_info(?1) WHERE name = ?2)")
            .bind(table)
            .bind(column)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;

    if !exists {
        let sql = format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, definition);
        sqlx::query(&sql)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        tracing::info!("[MIGRATION] Added column {} to table {}", column, table);
    } else {
        tracing::info!(
            "[MIGRATION] Column {} already exists in table {}, skipping",
            column,
            table
        );
    }
    Ok(())
}

async fn apply_v18_migration(pool: &SqlitePool) -> Result<(), String> {
    ensure_core_schema(pool).await?;
    apply_column_if_not_exists(
        pool,
        "season_api_configs",
        "etor_season_id_normal",
        "INTEGER NOT NULL DEFAULT 0",
    )
    .await?;
    apply_column_if_not_exists(
        pool,
        "season_api_configs",
        "etor_season_id_expert",
        "INTEGER NOT NULL DEFAULT 0",
    )
    .await?;
    Ok(())
}

async fn run_legacy_migrations(pool: &SqlitePool, current_version: i64) -> Result<(), String> {
    if current_version < 1 {
        apply_sql_migration(pool, 1, include_str!("db/migrations/001_initial.sql")).await?;
    }
    if current_version < 2 {
        apply_sql_migration(
            pool,
            2,
            include_str!("db/migrations/002_add_constraints.sql"),
        )
        .await?;
    }
    if current_version < 3 {
        apply_sql_migration(
            pool,
            3,
            include_str!("db/migrations/003_split_season_tables.sql"),
        )
        .await?;
    }
    if current_version < 4 {
        apply_sql_migration(
            pool,
            4,
            include_str!("db/migrations/004_remove_section_items_fk.sql"),
        )
        .await?;
    }
    if current_version < 5 {
        apply_sql_migration(
            pool,
            5,
            include_str!("db/migrations/005_add_season_api_configs.sql"),
        )
        .await?;
    }
    if current_version < 6 {
        tracing::info!("Applying migration v6: add season_day columns");
        apply_season_day_migration(pool).await?;
        record_migration(pool, 6).await?;
    }
    if current_version < 7 {
        tracing::info!("Applying migration v7: add snapshot item metadata columns");
        apply_snapshot_metadata_migration(pool).await?;
        record_migration(pool, 7).await?;
    }
    if current_version < 8 {
        tracing::info!("Applying migration v8: placeholder (no-op)");
        record_migration(pool, 8).await?;
    }
    if current_version < 9 {
        tracing::info!("Applying migration v9: create strategy detail tables");
        ensure_strategy_detail_schema(pool).await?;
        record_migration(pool, 9).await?;
    }
    if current_version < 10 {
        apply_strategy_outputs_realtime_value_migration(pool).await?;
        record_migration(pool, 10).await?;
    }
    if current_version < 11 {
        tracing::info!("Applying migration v11: create item realtime prices");
        ensure_item_realtime_prices_schema(pool).await?;
        record_migration(pool, 11).await?;
    }
    if current_version < 12 {
        apply_sql_migration(
            pool,
            12,
            include_str!("db/migrations/012_create_arbitrage_tables.sql"),
        )
        .await?;
    }
    if current_version < 13 {
        tracing::info!("Applying migration v13: ensure arbitrage tables");
        ensure_arbitrage_schema(pool).await?;
        record_migration(pool, 13).await?;
    }
    if current_version < 14 {
        tracing::info!("Applying migration v14: add strategy image URL");
        ensure_strategy_detail_schema(pool).await?;
        record_migration(pool, 14).await?;
    }
    if current_version < 15 {
        tracing::info!("Applying migration v15: add performance indexes");
        drop_known_performance_indexes(pool).await?;
        apply_performance_indexes_migration(pool).await?;
        record_migration(pool, 15).await?;
    }
    if current_version < 16 {
        apply_fire_price_unique_migration(pool).await?;
    }
    if current_version < 17 {
        apply_sections_market_mode_migration(pool).await?;
    }
    if current_version < 18 {
        apply_v18_migration(pool).await?;
        record_migration(pool, 18).await?;
    }
    if current_version < 19 {
        apply_sql_migration(
            pool,
            19,
            include_str!("db/migrations/019_create_inventory_tables.sql"),
        )
        .await?;
    }
    if current_version < 20 {
        apply_sql_migration(
            pool,
            20,
            include_str!("db/migrations/020_add_inventory_indexes.sql"),
        )
        .await?;
    }

    if current_version < 21 {
        tracing::info!("Applying migration v21: add arbitrage season_id/market_mode");
        ensure_arbitrage_schema(pool).await?;
        apply_column_if_not_exists(
            pool,
            "arbitrage_recipes",
            "season_id",
            "TEXT NOT NULL DEFAULT ''",
        )
        .await?;
        apply_column_if_not_exists(
            pool,
            "arbitrage_recipes",
            "market_mode",
            "TEXT NOT NULL DEFAULT 'season_normal'",
        )
        .await?;
        create_index_if_table_exists(
            pool,
            "arbitrage_recipes",
            "CREATE INDEX IF NOT EXISTS idx_arbitrage_recipes_season_mode ON arbitrage_recipes(season_id, market_mode)",
        )
        .await?;
        record_migration(pool, 21).await?;
    }

    if current_version < 22 {
        tracing::info!("Applying migration v22: backfill inventory/arbitrage context");
        apply_sql_migration(
            pool,
            22,
            include_str!("db/migrations/022_backfill_inventory_context.sql"),
        )
        .await?;
    }

    if current_version < 23 {
        tracing::info!("Applying migration v23: add estimated cost/revenue to strategy_details");
        add_column_if_missing(
            pool,
            "strategy_details",
            "estimated_cost",
            "REAL NOT NULL DEFAULT 0",
        )
        .await?;
        add_column_if_missing(
            pool,
            "strategy_details",
            "estimated_revenue_min",
            "REAL NOT NULL DEFAULT 0",
        )
        .await?;
        add_column_if_missing(
            pool,
            "strategy_details",
            "estimated_revenue_max",
            "REAL NOT NULL DEFAULT 0",
        )
        .await?;
        record_migration(pool, 23).await?;
    }

    if current_version < 24 {
        tracing::info!("Applying migration v24: add runs_per_hour to strategy_details");
        add_column_if_missing(
            pool,
            "strategy_details",
            "runs_per_hour",
            "REAL NOT NULL DEFAULT 0",
        )
        .await?;
        record_migration(pool, 24).await?;
    }

    Ok(())
}

async fn finalize_schema(pool: &SqlitePool) -> Result<(), String> {
    ensure_core_schema(pool).await?;
    ensure_strategy_detail_schema(pool).await?;
    ensure_item_realtime_prices_schema(pool).await?;
    ensure_arbitrage_schema(pool).await?;
    ensure_legacy_schema(pool).await?;
    seed_seasons(pool).await?;
    ensure_split_tables(pool).await?;
    apply_season_day_migration(pool).await?;
    apply_snapshot_metadata_migration(pool).await?;
    apply_performance_indexes_migration(pool).await?;
    Ok(())
}

async fn record_migration(pool: &SqlitePool, version: i64) -> Result<(), String> {
    sqlx::query("INSERT OR REPLACE INTO _migrations (version, applied_at) VALUES (?, ?)")
        .bind(version)
        .bind(chrono::Utc::now().timestamp())
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn record_all_migrations(pool: &SqlitePool) -> Result<(), String> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to start migration marker transaction: {}", e))?;
    let now = chrono::Utc::now().timestamp();

    for version in 1..=LATEST_SCHEMA_VERSION {
        sqlx::query("INSERT OR REPLACE INTO _migrations (version, applied_at) VALUES (?, ?)")
            .bind(version)
            .bind(now)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to record migration v{}: {}", version, e))?;
    }

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit migration markers: {}", e))?;
    Ok(())
}

async fn apply_sql_migration(pool: &SqlitePool, version: i64, sql: &str) -> Result<(), String> {
    tracing::info!("Applying migration v{}", version);
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Migration v{} failed to start transaction: {}", version, e))?;

    sqlx::query(sql)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Migration v{} failed: {}", version, e))?;

    sqlx::query("INSERT OR REPLACE INTO _migrations (version, applied_at) VALUES (?, ?)")
        .bind(version)
        .bind(chrono::Utc::now().timestamp())
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Migration v{} failed to record version: {}", version, e))?;

    tx.commit()
        .await
        .map_err(|e| format!("Migration v{} failed to commit: {}", version, e))?;
    Ok(())
}

/// 迁移 v16：为火价实时表补齐 scraped_at 唯一约束。
///
/// 修复 repo_fire::insert_fire_record 中 ON CONFLICT(scraped_at) 因缺少
/// PRIMARY KEY/UNIQUE 约束而告警的问题。SQLite 无法 ALTER TABLE ADD
/// CONSTRAINT，故改用唯一索引（ON CONFLICT 目标可为唯一索引）。
///
/// 表不存在时跳过：finalize_schema 的 ensure_split_tables 会用含
/// UNIQUE(scraped_at) 的建表 SQL 兜底。
async fn apply_fire_price_unique_migration(pool: &SqlitePool) -> Result<(), String> {
    tracing::info!("Applying migration v16: add fire price scraped_at unique index");
    for table in ["fire_price_normal", "fire_price_expert"] {
        let table = safe_sql_identifier(table, "fire price migration table")?;
        if !table_exists(pool, table).await? {
            continue;
        }
        // 清理重复 scraped_at 记录（每组保留 id 最大的一条）
        sqlx::query(&format!(
            "DELETE FROM {table} WHERE id NOT IN (
                SELECT MAX(id) FROM {table} GROUP BY scraped_at
            )"
        ))
        .execute(pool)
        .await
        .map_err(|e| format!("Migration v16 cleanup {table} failed: {e}"))?;
        // 删除旧普通索引，改为同名唯一索引
        let idx = format!("idx_{table}_scraped");
        let idx = safe_sql_identifier(&idx, "fire price migration index")?;
        sqlx::query(&format!("DROP INDEX IF EXISTS {idx}"))
            .execute(pool)
            .await
            .map_err(|e| format!("Migration v16 drop {idx} failed: {e}"))?;
        sqlx::query(&format!(
            "CREATE UNIQUE INDEX IF NOT EXISTS {idx} ON {table}(scraped_at)"
        ))
        .execute(pool)
        .await
        .map_err(|e| format!("Migration v16 create {idx} failed: {e}"))?;
    }
    record_migration(pool, 16).await?;
    Ok(())
}

/// 迁移 v17：为 sections 表增加 market_mode 字段，实现普通/专家模式分组完全独立。
///
/// 修复问题：sections 表无 market_mode，两模式共享分组；删除分组时
/// ON DELETE CASCADE 跨模式删除另一模式物品。
///
/// 步骤：
/// 1. 加 market_mode 列（现有分组默认 season_normal）
/// 2. 为每个 normal 分组创建 expert 副本（保持结构和排序）
/// 3. 将 expert 的 section_items 指向新的 expert 分组
///
/// 表不存在时跳过：ensure_core_schema 会兜底建表。
async fn apply_sections_market_mode_migration(pool: &SqlitePool) -> Result<(), String> {
    tracing::info!("Applying migration v17: add market_mode to sections");
    if !table_exists(pool, "sections").await? {
        record_migration(pool, 17).await?;
        return Ok(());
    }

    // 1. 加 market_mode 列
    add_column_if_missing(
        pool,
        "sections",
        "market_mode",
        "TEXT NOT NULL DEFAULT 'season_normal'",
    )
    .await?;

    // 2. 为每个 normal 分组创建 expert 副本
    sqlx::query(
        "INSERT INTO sections (id, name, strategy_id, market_mode, sort_order, collapsed, created_at, updated_at)
         SELECT id || '-expert', name, strategy_id, 'season_expert', sort_order, collapsed, created_at, updated_at
         FROM sections WHERE market_mode = 'season_normal'",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Migration v17 create expert sections failed: {e}"))?;

    // 3. 将 expert 的 section_items 指向新的 expert 分组
    sqlx::query("UPDATE section_items SET section_id = section_id || '-expert' WHERE market_mode = 'season_expert'")
        .execute(pool)
        .await
        .map_err(|e| format!("Migration v17 relink expert section_items failed: {e}"))?;

    // 4. 索引
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_sections_market_mode ON sections(market_mode, sort_order)",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Migration v17 create index failed: {e}"))?;

    record_migration(pool, 17).await?;
    Ok(())
}

async fn apply_strategy_outputs_realtime_value_migration(pool: &SqlitePool) -> Result<(), String> {
    tracing::info!("Applying migration v10: add realtime_value to strategy_outputs");

    if !table_exists(pool, "strategy_outputs").await? {
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS strategy_outputs (
                id TEXT PRIMARY KEY,
                strategy_id TEXT NOT NULL,
                season_id TEXT NOT NULL DEFAULT 'ss12',
                market_mode TEXT NOT NULL DEFAULT 'season_normal',
                item_id TEXT NOT NULL,
                item_name TEXT NOT NULL DEFAULT '',
                item_type TEXT NOT NULL DEFAULT '',
                buy_price REAL NOT NULL DEFAULT 0,
                sell_price REAL NOT NULL DEFAULT 0,
                profit_rate REAL NOT NULL DEFAULT 0,
                realtime_value REAL NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
            )"#,
        )
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create strategy_outputs table: {}", e))?;
    }

    add_column_if_missing(
        pool,
        "strategy_outputs",
        "realtime_value",
        "REAL NOT NULL DEFAULT 0",
    )
    .await
}

async fn ensure_legacy_schema(pool: &SqlitePool) -> Result<(), String> {
    add_column_if_missing(
        pool,
        "strategy_outputs",
        "realtime_value",
        "REAL NOT NULL DEFAULT 0",
    )
    .await?;

    // 兜底：确保 sections 表有 market_mode 列（全新库经 001 已有，老库经 v17 迁移已有）
    add_column_if_missing(
        pool,
        "sections",
        "market_mode",
        "TEXT NOT NULL DEFAULT 'season_normal'",
    )
    .await
}

async fn ensure_core_schema(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to ensure app_meta table: {}", e))?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS seasons (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            code TEXT NOT NULL DEFAULT '',
            is_current INTEGER NOT NULL DEFAULT 0,
            started_at INTEGER,
            ended_at INTEGER,
            created_at INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL DEFAULT 0
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to ensure seasons table: {}", e))?;

    add_column_if_missing(pool, "seasons", "name", "TEXT NOT NULL DEFAULT ''").await?;
    add_column_if_missing(pool, "seasons", "code", "TEXT NOT NULL DEFAULT ''").await?;
    add_column_if_missing(pool, "seasons", "is_current", "INTEGER NOT NULL DEFAULT 0").await?;
    add_column_if_missing(pool, "seasons", "started_at", "INTEGER").await?;
    add_column_if_missing(pool, "seasons", "ended_at", "INTEGER").await?;
    add_column_if_missing(pool, "seasons", "created_at", "INTEGER NOT NULL DEFAULT 0").await?;
    add_column_if_missing(pool, "seasons", "updated_at", "INTEGER NOT NULL DEFAULT 0").await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS season_api_configs (
            season_id TEXT PRIMARY KEY,
            qiandao_tag_id_normal TEXT NOT NULL DEFAULT '',
            qiandao_spec_id_normal TEXT NOT NULL DEFAULT '',
            qiandao_tag_id_expert TEXT NOT NULL DEFAULT '',
            qiandao_spec_id_expert TEXT NOT NULL DEFAULT '',
            luosi_season_id_normal INTEGER NOT NULL DEFAULT 0,
            luosi_season_id_expert INTEGER NOT NULL DEFAULT 0,
            etor_season_id_normal INTEGER NOT NULL DEFAULT 0,
            etor_season_id_expert INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL DEFAULT 0
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to ensure season_api_configs table: {}", e))?;

    add_column_if_missing(
        pool,
        "season_api_configs",
        "qiandao_tag_id_normal",
        "TEXT NOT NULL DEFAULT ''",
    )
    .await?;
    add_column_if_missing(
        pool,
        "season_api_configs",
        "qiandao_spec_id_normal",
        "TEXT NOT NULL DEFAULT ''",
    )
    .await?;
    add_column_if_missing(
        pool,
        "season_api_configs",
        "qiandao_tag_id_expert",
        "TEXT NOT NULL DEFAULT ''",
    )
    .await?;
    add_column_if_missing(
        pool,
        "season_api_configs",
        "qiandao_spec_id_expert",
        "TEXT NOT NULL DEFAULT ''",
    )
    .await?;
    add_column_if_missing(
        pool,
        "season_api_configs",
        "luosi_season_id_normal",
        "INTEGER NOT NULL DEFAULT 0",
    )
    .await?;
    add_column_if_missing(
        pool,
        "season_api_configs",
        "luosi_season_id_expert",
        "INTEGER NOT NULL DEFAULT 0",
    )
    .await?;
    add_column_if_missing(
        pool,
        "season_api_configs",
        "etor_season_id_normal",
        "INTEGER NOT NULL DEFAULT 0",
    )
    .await?;
    add_column_if_missing(
        pool,
        "season_api_configs",
        "etor_season_id_expert",
        "INTEGER NOT NULL DEFAULT 0",
    )
    .await?;
    add_column_if_missing(
        pool,
        "season_api_configs",
        "created_at",
        "INTEGER NOT NULL DEFAULT 0",
    )
    .await?;
    add_column_if_missing(
        pool,
        "season_api_configs",
        "updated_at",
        "INTEGER NOT NULL DEFAULT 0",
    )
    .await?;

    Ok(())
}

async fn create_migration_backup(
    pool: &SqlitePool,
    db_path: &Path,
    from_version: i64,
) -> Result<std::path::PathBuf, String> {
    let backup_dir = db_path
        .parent()
        .map(|parent| parent.join("backups"))
        .unwrap_or_else(paths::backups_dir);
    tokio::fs::create_dir_all(&backup_dir)
        .await
        .map_err(|e| format!("Failed to create migration backup directory: {}", e))?;

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S%.3f");
    let backup_name = format!(
        "tl_monitor_migration_v{}_to_v{}_{}.db",
        from_version, LATEST_SCHEMA_VERSION, timestamp
    );
    let backup_path = backup_dir.join(backup_name);

    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to checkpoint database before backup: {}", e))?;

    let canonical_path = backup_path
        .canonicalize()
        .unwrap_or_else(|_| backup_path.clone());
    let path_str = canonical_path.to_string_lossy();
    // 防御路径注入：VACUUM INTO 不支持参数化，必须手动验证路径安全
    if path_str.contains('\0')
        || path_str.contains('\n')
        || path_str.contains('\r')
        || path_str.contains('\'')
    {
        return Err("Invalid backup path: contains unsafe characters".to_string());
    }
    let backup_sql = format!("VACUUM INTO '{}'", path_str);
    sqlx::query(&backup_sql)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create migration backup: {}", e))?;

    prune_migration_backups(&backup_dir, MAX_MIGRATION_BACKUPS).await?;

    Ok(backup_path)
}

async fn prune_migration_backups(backup_dir: &Path, keep_latest: usize) -> Result<usize, String> {
    if keep_latest == 0 {
        return Ok(0);
    }

    let mut entries = tokio::fs::read_dir(backup_dir)
        .await
        .map_err(|e| format!("Failed to read migration backup directory: {}", e))?;
    let mut backups = Vec::new();

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("Failed to inspect migration backup directory: {}", e))?
    {
        let path = entry.path();
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if !file_name.starts_with("tl_monitor_migration_v") || !file_name.ends_with(".db") {
            continue;
        }

        let modified = entry
            .metadata()
            .await
            .and_then(|metadata| metadata.modified())
            .map_err(|e| format!("Failed to inspect migration backup metadata: {}", e))?;
        backups.push((modified, path));
    }

    if backups.len() <= keep_latest {
        return Ok(0);
    }

    backups.sort_by_key(|(modified, _)| *modified);
    let remove_count = backups.len() - keep_latest;
    for (_, path) in backups.into_iter().take(remove_count) {
        tokio::fs::remove_file(&path)
            .await
            .map_err(|e| format!("Failed to remove old migration backup {:?}: {}", path, e))?;
        tracing::info!("Removed old migration backup {:?}", path);
    }

    Ok(remove_count)
}

async fn validate_database(pool: &SqlitePool) -> Result<(), String> {
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to run integrity_check: {}", e))?;
    if integrity != "ok" {
        return Err(format!("Database integrity_check failed: {}", integrity));
    }

    let critical_columns = [
        (
            "strategy_details",
            &["id", "name", "label", "difficulty", "image_url"][..],
        ),
        (
            "strategy_detail_outputs",
            &["item_name", "estimated_value", "realtime_value"][..],
        ),
        ("item_realtime_prices", &["name", "fire_price"][..]),
        (
            "seasons",
            &["id", "name", "code", "created_at", "updated_at"][..],
        ),
        (
            "strategy_outputs",
            &["id", "strategy_id", "realtime_value"][..],
        ),
    ];

    for (table, columns) in critical_columns {
        let existing = table_columns(pool, table).await?;
        if !has_columns(&existing, columns) {
            return Err(format!(
                "Database schema validation failed for {}. Missing columns from {:?}; existing columns: {:?}",
                table, columns, existing
            ));
        }
    }

    let foreign_key_issues: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM pragma_foreign_key_check")
            .fetch_one(pool)
            .await
            .unwrap_or(0);
    if foreign_key_issues > 0 {
        tracing::warn!(
            "Database foreign_key_check reported {} issue(s); preserving existing data and continuing",
            foreign_key_issues
        );
    }

    Ok(())
}

async fn optimize_database(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query("PRAGMA optimize")
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to optimize database: {}", e))?;
    Ok(())
}

async fn table_exists(pool: &SqlitePool, table: &str) -> Result<bool, String> {
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?")
            .bind(table)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("Failed to inspect table {}: {}", table, e))?;
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
        .map_err(|e| format!("Failed to inspect column {}.{}: {}", table, column, e))?;
    Ok(count > 0)
}

async fn add_column_if_missing(
    pool: &SqlitePool,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let table = safe_sql_identifier(table, "alter table")?;
    let column = safe_sql_identifier(column, "alter column")?;
    if !table_exists(pool, table).await? {
        tracing::warn!("Table {} does not exist, skipping column {}", table, column);
        return Ok(());
    }

    if column_exists(pool, table, column).await? {
        return Ok(());
    }

    sqlx::query(&format!(
        "ALTER TABLE {} ADD COLUMN {} {}",
        table, column, definition
    ))
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to add column {}.{}: {}", table, column, e))?;
    Ok(())
}

async fn create_index_if_table_exists(
    pool: &SqlitePool,
    table: &str,
    sql: &str,
) -> Result<(), String> {
    if !table_exists(pool, table).await? {
        return Ok(());
    }

    sqlx::query(sql)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create index on {}: {}", table, e))?;
    Ok(())
}

async fn table_columns(
    pool: &SqlitePool,
    table: &str,
) -> Result<std::collections::HashSet<String>, String> {
    if !table_exists(pool, table).await? {
        return Ok(std::collections::HashSet::new());
    }

    let rows: Vec<(String,)> = sqlx::query_as("SELECT name FROM pragma_table_info(?)")
        .bind(table)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to inspect columns for {}: {}", table, e))?;

    Ok(rows.into_iter().map(|(name,)| name).collect())
}

fn has_columns(columns: &std::collections::HashSet<String>, required: &[&str]) -> bool {
    required.iter().all(|column| columns.contains(*column))
}

fn safe_sql_identifier<'a>(identifier: &'a str, context: &str) -> Result<&'a str, String> {
    if crate::db::table_resolver::TableResolver::is_safe_identifier(identifier) {
        Ok(identifier)
    } else {
        Err(format!(
            "Unsafe SQL identifier for {}: {}",
            context, identifier
        ))
    }
}

async fn backup_table(pool: &SqlitePool, table: &str) -> Result<Option<String>, String> {
    let table = safe_sql_identifier(table, "backup table")?;
    if !table_exists(pool, table).await? {
        return Ok(None);
    }

    let suffix = chrono::Utc::now().timestamp_millis();
    let mut backup = format!("{}_legacy_{}", table, suffix);
    let mut counter = 0;
    while table_exists(pool, &backup).await? {
        counter += 1;
        backup = format!("{}_legacy_{}_{}", table, suffix, counter);
    }

    sqlx::query(&format!("ALTER TABLE {} RENAME TO {}", table, backup))
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to back up table {} to {}: {}", table, backup, e))?;

    tracing::warn!(
        "Backed up incompatible table {} to {} before schema repair",
        table,
        backup
    );
    Ok(Some(backup))
}

async fn drop_index_if_exists(pool: &SqlitePool, index: &str) -> Result<(), String> {
    let index = safe_sql_identifier(index, "drop index")?;
    sqlx::query(&format!("DROP INDEX IF EXISTS {}", index))
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to drop index {}: {}", index, e))?;
    Ok(())
}

async fn create_index_if_columns_exist(
    pool: &SqlitePool,
    table: &str,
    columns: &[&str],
    sql: &str,
) -> Result<(), String> {
    if !table_exists(pool, table).await? {
        return Ok(());
    }

    let existing_columns = table_columns(pool, table).await?;
    if !has_columns(&existing_columns, columns) {
        tracing::warn!(
            "Skipping index on {} because required columns are missing: {:?}",
            table,
            columns
        );
        return Ok(());
    }

    sqlx::query(sql)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create index on {}: {}", table, e))?;
    Ok(())
}

async fn ensure_strategy_detail_schema(pool: &SqlitePool) -> Result<(), String> {
    if table_exists(pool, "strategy_details").await? {
        let columns = table_columns(pool, "strategy_details").await?;
        let required = [
            "id",
            "name",
            "label",
            "difficulty",
            "output_value",
            "defense_value",
            "created_at",
            "updated_at",
        ];

        if !has_columns(&columns, &required) {
            backup_table(pool, "strategy_details").await?;
            backup_table(pool, "strategy_detail_costs").await?;
            backup_table(pool, "strategy_detail_outputs").await?;
            drop_known_performance_indexes(pool).await?;
        }
    }

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS strategy_details (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            difficulty TEXT NOT NULL DEFAULT '',
            output_value REAL NOT NULL DEFAULT 0,
            defense_value REAL NOT NULL DEFAULT 0,
            remark TEXT,
            image_url TEXT DEFAULT '',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )"#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to ensure strategy_details table: {}", e))?;

    add_column_if_missing(pool, "strategy_details", "image_url", "TEXT DEFAULT ''").await?;
    add_column_if_missing(
        pool,
        "strategy_details",
        "estimated_cost",
        "REAL NOT NULL DEFAULT 0",
    )
    .await?;
    add_column_if_missing(
        pool,
        "strategy_details",
        "estimated_revenue_min",
        "REAL NOT NULL DEFAULT 0",
    )
    .await?;
    add_column_if_missing(
        pool,
        "strategy_details",
        "estimated_revenue_max",
        "REAL NOT NULL DEFAULT 0",
    )
    .await?;
    add_column_if_missing(
        pool,
        "strategy_details",
        "runs_per_hour",
        "REAL NOT NULL DEFAULT 0",
    )
    .await?;

    ensure_strategy_detail_child_tables(pool).await
}

async fn ensure_strategy_detail_child_tables(pool: &SqlitePool) -> Result<(), String> {
    if table_exists(pool, "strategy_detail_costs").await? {
        let columns = table_columns(pool, "strategy_detail_costs").await?;
        let required = [
            "id",
            "strategy_id",
            "cost_type",
            "item_id",
            "count",
            "fire_price",
            "total_fire",
            "is_realtime",
            "created_at",
            "updated_at",
        ];
        if !has_columns(&columns, &required) {
            backup_table(pool, "strategy_detail_costs").await?;
            drop_known_performance_indexes(pool).await?;
        }
    }

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS strategy_detail_costs (
            id TEXT PRIMARY KEY,
            strategy_id TEXT NOT NULL,
            cost_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            item_name TEXT,
            count REAL NOT NULL DEFAULT 1,
            fire_price REAL NOT NULL DEFAULT 0,
            total_fire REAL NOT NULL DEFAULT 0,
            is_realtime INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (strategy_id) REFERENCES strategy_details(id) ON DELETE CASCADE
        )"#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to ensure strategy_detail_costs table: {}", e))?;

    add_column_if_missing(pool, "strategy_detail_costs", "item_name", "TEXT").await?;

    if table_exists(pool, "strategy_detail_outputs").await? {
        let columns = table_columns(pool, "strategy_detail_outputs").await?;
        let required = [
            "id",
            "strategy_id",
            "item_name",
            "count",
            "estimated_value",
            "created_at",
            "updated_at",
        ];
        if !has_columns(&columns, &required) {
            backup_table(pool, "strategy_detail_outputs").await?;
            drop_known_performance_indexes(pool).await?;
        }
    }

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS strategy_detail_outputs (
            id TEXT PRIMARY KEY,
            strategy_id TEXT NOT NULL,
            item_name TEXT NOT NULL,
            item_type TEXT NOT NULL DEFAULT '',
            count REAL NOT NULL DEFAULT 1,
            estimated_value REAL NOT NULL DEFAULT 0,
            realtime_value REAL NOT NULL DEFAULT 0,
            remark TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (strategy_id) REFERENCES strategy_details(id) ON DELETE CASCADE
        )"#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to ensure strategy_detail_outputs table: {}", e))?;

    add_column_if_missing(
        pool,
        "strategy_detail_outputs",
        "item_type",
        "TEXT NOT NULL DEFAULT ''",
    )
    .await?;
    add_column_if_missing(
        pool,
        "strategy_detail_outputs",
        "realtime_value",
        "REAL NOT NULL DEFAULT 0",
    )
    .await?;
    add_column_if_missing(pool, "strategy_detail_outputs", "remark", "TEXT").await?;

    Ok(())
}

async fn ensure_item_realtime_prices_schema(pool: &SqlitePool) -> Result<(), String> {
    let mut backup: Option<(String, std::collections::HashSet<String>)> = None;

    if table_exists(pool, "item_realtime_prices").await? {
        let columns = table_columns(pool, "item_realtime_prices").await?;
        let required = [
            "item_id",
            "name",
            "fire_price",
            "scraped_at",
            "created_at",
            "season_id",
            "market_mode",
        ];
        if !has_columns(&columns, &required) {
            if let Some(backup_name) = backup_table(pool, "item_realtime_prices").await? {
                backup = Some((backup_name, columns));
            }
        }
    }

    if backup.is_some() {
        for index in [
            "idx_item_realtime_item_scraped",
            "idx_item_realtime_prices_item_id",
            "idx_item_realtime_prices_scraped_at",
            "idx_item_realtime_prices_item_time",
            "idx_item_realtime_prices_covering",
        ] {
            drop_index_if_exists(pool, index).await?;
        }
    }

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS item_realtime_prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id TEXT NOT NULL,
            name TEXT NOT NULL,
            fire_price REAL NOT NULL,
            scraped_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (unixepoch()),
            season_id TEXT NOT NULL DEFAULT '',
            market_mode TEXT NOT NULL DEFAULT ''
        )"#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to ensure item_realtime_prices table: {}", e))?;

    if let Some((backup_name, columns)) = backup {
        if columns.contains("item_id") && columns.contains("scraped_at") {
            let name_expr = if columns.contains("name") {
                "name"
            } else if columns.contains("item_name") {
                "item_name"
            } else {
                "''"
            };
            let price_expr = if columns.contains("fire_price") {
                "fire_price"
            } else if columns.contains("price") {
                "price"
            } else {
                "0"
            };
            let created_expr = if columns.contains("created_at") {
                "created_at"
            } else {
                "scraped_at"
            };

            sqlx::query(&format!(
                "INSERT INTO item_realtime_prices (item_id, name, fire_price, scraped_at, created_at, season_id, market_mode)
                 SELECT item_id, COALESCE({}, ''), COALESCE({}, 0), scraped_at, COALESCE({}, unixepoch()), '', ''
                 FROM {}
                 WHERE item_id IS NOT NULL AND scraped_at IS NOT NULL",
                name_expr, price_expr, created_expr, backup_name
            ))
            .execute(pool)
            .await
            .map_err(|e| {
                format!(
                    "Failed to copy legacy realtime prices from {}: {}",
                    backup_name, e
                )
            })?;
        }
    }

    create_index_if_columns_exist(
        pool,
        "item_realtime_prices",
        &["item_id"],
        "CREATE INDEX IF NOT EXISTS idx_item_realtime_prices_item_id ON item_realtime_prices(item_id)",
    )
    .await?;
    create_index_if_columns_exist(
        pool,
        "item_realtime_prices",
        &["scraped_at"],
        "CREATE INDEX IF NOT EXISTS idx_item_realtime_prices_scraped_at ON item_realtime_prices(scraped_at)",
    )
    .await?;
    create_index_if_columns_exist(
        pool,
        "item_realtime_prices",
        &["item_id", "scraped_at"],
        "CREATE INDEX IF NOT EXISTS idx_item_realtime_prices_item_time ON item_realtime_prices(item_id, scraped_at)",
    )
    .await
}

async fn ensure_arbitrage_schema(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS arbitrage_recipes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            recipe_type TEXT NOT NULL DEFAULT 'decompose',
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            season_id TEXT NOT NULL DEFAULT '',
            market_mode TEXT NOT NULL DEFAULT 'season_normal'
        )"#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to ensure arbitrage_recipes table: {}", e))?;

    add_column_if_missing(
        pool,
        "arbitrage_recipes",
        "season_id",
        "TEXT NOT NULL DEFAULT ''",
    )
    .await?;
    add_column_if_missing(
        pool,
        "arbitrage_recipes",
        "market_mode",
        "TEXT NOT NULL DEFAULT 'season_normal'",
    )
    .await?;

    create_index_if_table_exists(
        pool,
        "arbitrage_recipes",
        "CREATE INDEX IF NOT EXISTS idx_arbitrage_recipes_season_mode ON arbitrage_recipes(season_id, market_mode)",
    )
    .await?;

    ensure_arbitrage_detail_table(
        pool,
        "arbitrage_ingredients",
        "Failed to ensure arbitrage_ingredients table",
    )
    .await?;
    ensure_arbitrage_detail_table(
        pool,
        "arbitrage_outputs",
        "Failed to ensure arbitrage_outputs table",
    )
    .await
}

async fn ensure_arbitrage_detail_table(
    pool: &SqlitePool,
    table: &str,
    error_context: &str,
) -> Result<(), String> {
    if table_exists(pool, table).await? {
        let columns = table_columns(pool, table).await?;
        let required = ["id", "recipe_id", "count", "created_at", "updated_at"];
        if !has_columns(&columns, &required) {
            backup_table(pool, table).await?;
            drop_known_performance_indexes(pool).await?;
        } else if !columns.contains("item_name") {
            add_column_if_missing(pool, table, "item_name", "TEXT NOT NULL DEFAULT ''").await?;
            if columns.contains("item_id") {
                sqlx::query(&format!(
                    "UPDATE {} SET item_name = item_id WHERE item_name = ''",
                    table
                ))
                .execute(pool)
                .await
                .map_err(|e| format!("Failed to backfill {}.item_name: {}", table, e))?;
            }
        }
    }

    sqlx::query(&format!(
        r#"CREATE TABLE IF NOT EXISTS {} (
            id TEXT PRIMARY KEY,
            recipe_id TEXT NOT NULL,
            item_name TEXT NOT NULL,
            count REAL NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (recipe_id) REFERENCES arbitrage_recipes(id) ON DELETE CASCADE
        )"#,
        table
    ))
    .execute(pool)
    .await
    .map_err(|e| format!("{}: {}", error_context, e))?;

    Ok(())
}

async fn drop_known_performance_indexes(pool: &SqlitePool) -> Result<(), String> {
    for index in [
        "idx_strategy_details_strategy",
        "idx_strategy_detail_costs_strategy_id",
        "idx_strategy_detail_costs_strategy_realtime",
        "idx_strategy_detail_costs_item_id",
        "idx_strategy_detail_costs_cost_type",
        "idx_strategy_detail_outputs_strategy_id",
        "idx_strategy_detail_outputs_strategy_name",
        "idx_strategy_details_label",
        "idx_strategy_details_difficulty",
        "idx_strategy_details_label_difficulty",
        "idx_arbitrage_recipes_type",
        "idx_arbitrage_recipes_enabled",
        "idx_arbitrage_recipes_type_enabled",
        "idx_arbitrage_ingredients_recipe",
        "idx_arbitrage_outputs_recipe",
        "idx_arbitrage_ingredients_name",
        "idx_arbitrage_outputs_name",
        "idx_section_items_composite",
        "idx_fire_price_normal_scraped_covering",
        "idx_fire_price_expert_scraped_covering",
        "idx_item_realtime_prices_covering",
        "idx_alert_rules_enabled",
        "idx_alert_rules_section",
        "idx_source_diagnostics_enabled",
    ] {
        drop_index_if_exists(pool, index).await?;
    }

    Ok(())
}

async fn apply_performance_indexes_migration(pool: &SqlitePool) -> Result<(), String> {
    ensure_strategy_detail_schema(pool).await?;
    ensure_item_realtime_prices_schema(pool).await?;
    ensure_arbitrage_schema(pool).await?;

    let indexes = [
        ("strategy_detail_costs", &["strategy_id"][..], "CREATE INDEX IF NOT EXISTS idx_strategy_detail_costs_strategy_id ON strategy_detail_costs(strategy_id)"),
        ("strategy_detail_costs", &["strategy_id", "is_realtime"][..], "CREATE INDEX IF NOT EXISTS idx_strategy_detail_costs_strategy_realtime ON strategy_detail_costs(strategy_id, is_realtime)"),
        ("strategy_detail_costs", &["item_id"][..], "CREATE INDEX IF NOT EXISTS idx_strategy_detail_costs_item_id ON strategy_detail_costs(item_id)"),
        ("strategy_detail_costs", &["cost_type"][..], "CREATE INDEX IF NOT EXISTS idx_strategy_detail_costs_cost_type ON strategy_detail_costs(cost_type)"),
        ("strategy_detail_outputs", &["strategy_id"][..], "CREATE INDEX IF NOT EXISTS idx_strategy_detail_outputs_strategy_id ON strategy_detail_outputs(strategy_id)"),
        ("strategy_detail_outputs", &["strategy_id", "item_name"][..], "CREATE INDEX IF NOT EXISTS idx_strategy_detail_outputs_strategy_name ON strategy_detail_outputs(strategy_id, item_name)"),
        ("strategy_details", &["label"][..], "CREATE INDEX IF NOT EXISTS idx_strategy_details_label ON strategy_details(label)"),
        ("strategy_details", &["difficulty"][..], "CREATE INDEX IF NOT EXISTS idx_strategy_details_difficulty ON strategy_details(difficulty)"),
        ("strategy_details", &["label", "difficulty"][..], "CREATE INDEX IF NOT EXISTS idx_strategy_details_label_difficulty ON strategy_details(label, difficulty)"),
        ("arbitrage_recipes", &["enabled"][..], "CREATE INDEX IF NOT EXISTS idx_arbitrage_recipes_enabled ON arbitrage_recipes(enabled)"),
        ("arbitrage_recipes", &["recipe_type", "enabled"][..], "CREATE INDEX IF NOT EXISTS idx_arbitrage_recipes_type_enabled ON arbitrage_recipes(recipe_type, enabled)"),
        ("arbitrage_ingredients", &["recipe_id"][..], "CREATE INDEX IF NOT EXISTS idx_arbitrage_ingredients_recipe ON arbitrage_ingredients(recipe_id)"),
        ("arbitrage_outputs", &["recipe_id"][..], "CREATE INDEX IF NOT EXISTS idx_arbitrage_outputs_recipe ON arbitrage_outputs(recipe_id)"),
        ("arbitrage_ingredients", &["item_name"][..], "CREATE INDEX IF NOT EXISTS idx_arbitrage_ingredients_name ON arbitrage_ingredients(item_name)"),
        ("arbitrage_outputs", &["item_name"][..], "CREATE INDEX IF NOT EXISTS idx_arbitrage_outputs_name ON arbitrage_outputs(item_name)"),
        ("arbitrage_recipes", &["recipe_type"][..], "CREATE INDEX IF NOT EXISTS idx_arbitrage_recipes_type ON arbitrage_recipes(recipe_type)"),
        ("section_items", &["section_id", "season_id", "market_mode", "item_id"][..], "CREATE INDEX IF NOT EXISTS idx_section_items_composite ON section_items(section_id, season_id, market_mode, item_id)"),
        ("items_normal", &["name"][..], "CREATE INDEX IF NOT EXISTS idx_items_normal_name ON items_normal(name)"),
        ("items_expert", &["name"][..], "CREATE INDEX IF NOT EXISTS idx_items_expert_name ON items_expert(name)"),
        ("fire_price_normal", &["scraped_at", "rmb_per_10k_fire", "fire_per_rmb"][..], "CREATE INDEX IF NOT EXISTS idx_fire_price_normal_scraped_covering ON fire_price_normal(scraped_at DESC, rmb_per_10k_fire, fire_per_rmb)"),
        ("fire_price_expert", &["scraped_at", "rmb_per_10k_fire", "fire_per_rmb"][..], "CREATE INDEX IF NOT EXISTS idx_fire_price_expert_scraped_covering ON fire_price_expert(scraped_at DESC, rmb_per_10k_fire, fire_per_rmb)"),
        ("item_realtime_prices", &["item_id", "scraped_at", "fire_price"][..], "CREATE INDEX IF NOT EXISTS idx_item_realtime_prices_covering ON item_realtime_prices(item_id, scraped_at DESC, fire_price)"),
        ("alert_rules", &["enabled"][..], "CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled)"),
        ("alert_rules", &["section_id"][..], "CREATE INDEX IF NOT EXISTS idx_alert_rules_section ON alert_rules(section_id)"),
        ("source_diagnostics", &["enabled"][..], "CREATE INDEX IF NOT EXISTS idx_source_diagnostics_enabled ON source_diagnostics(enabled)"),
    ];

    for (table, columns, sql) in indexes {
        create_index_if_columns_exist(pool, table, columns, sql).await?;
    }

    Ok(())
}

async fn apply_season_day_migration(pool: &SqlitePool) -> Result<(), String> {
    let tables = [
        "fire_price_normal",
        "fire_price_expert",
        "items_normal",
        "items_expert",
        "item_snapshots_ss12_normal",
        "item_snapshots_ss12_expert",
        "item_snapshots_ss11_normal",
        "item_snapshots_ss11_expert",
        "fire_price_snapshots_ss12_normal",
        "fire_price_snapshots_ss12_expert",
        "fire_price_snapshots_ss11_normal",
        "fire_price_snapshots_ss11_expert",
    ];

    for table in tables {
        add_column_if_missing(pool, table, "season_day", "INTEGER NOT NULL DEFAULT 1").await?;
    }

    let indexes = [
        ("fire_price_normal", "CREATE INDEX IF NOT EXISTS idx_fire_normal_season_day ON fire_price_normal(season_day)"),
        ("fire_price_expert", "CREATE INDEX IF NOT EXISTS idx_fire_expert_season_day ON fire_price_expert(season_day)"),
        ("items_normal", "CREATE INDEX IF NOT EXISTS idx_items_normal_season_day ON items_normal(season_day)"),
        ("items_expert", "CREATE INDEX IF NOT EXISTS idx_items_expert_season_day ON items_expert(season_day)"),
        ("item_snapshots_ss12_normal", "CREATE INDEX IF NOT EXISTS idx_ss12_normal_snapshots_season_day ON item_snapshots_ss12_normal(season_day)"),
        ("item_snapshots_ss12_expert", "CREATE INDEX IF NOT EXISTS idx_ss12_expert_snapshots_season_day ON item_snapshots_ss12_expert(season_day)"),
        ("item_snapshots_ss11_normal", "CREATE INDEX IF NOT EXISTS idx_ss11_normal_snapshots_season_day ON item_snapshots_ss11_normal(season_day)"),
        ("item_snapshots_ss11_expert", "CREATE INDEX IF NOT EXISTS idx_ss11_expert_snapshots_season_day ON item_snapshots_ss11_expert(season_day)"),
    ];

    for (table, sql) in indexes {
        create_index_if_table_exists(pool, table, sql).await?;
    }

    Ok(())
}

async fn apply_snapshot_metadata_migration(pool: &SqlitePool) -> Result<(), String> {
    let tables = [
        "item_snapshots_ss12_normal",
        "item_snapshots_ss12_expert",
        "item_snapshots_ss11_normal",
        "item_snapshots_ss11_expert",
    ];

    for table in tables {
        add_column_if_missing(pool, table, "name", "TEXT NOT NULL DEFAULT ''").await?;
        add_column_if_missing(pool, table, "item_type", "TEXT NOT NULL DEFAULT ''").await?;
    }

    let indexes = [
        ("item_snapshots_ss12_normal", "CREATE INDEX IF NOT EXISTS idx_ss12_normal_snapshots_name ON item_snapshots_ss12_normal(name)"),
        ("item_snapshots_ss12_expert", "CREATE INDEX IF NOT EXISTS idx_ss12_expert_snapshots_name ON item_snapshots_ss12_expert(name)"),
        ("item_snapshots_ss11_normal", "CREATE INDEX IF NOT EXISTS idx_ss11_normal_snapshots_name ON item_snapshots_ss11_normal(name)"),
        ("item_snapshots_ss11_expert", "CREATE INDEX IF NOT EXISTS idx_ss11_expert_snapshots_name ON item_snapshots_ss11_expert(name)"),
        ("item_snapshots_ss12_normal", "CREATE INDEX IF NOT EXISTS idx_ss12_normal_snapshots_type ON item_snapshots_ss12_normal(item_type)"),
        ("item_snapshots_ss12_expert", "CREATE INDEX IF NOT EXISTS idx_ss12_expert_snapshots_type ON item_snapshots_ss12_expert(item_type)"),
        ("item_snapshots_ss11_normal", "CREATE INDEX IF NOT EXISTS idx_ss11_normal_snapshots_type ON item_snapshots_ss11_normal(item_type)"),
        ("item_snapshots_ss11_expert", "CREATE INDEX IF NOT EXISTS idx_ss11_expert_snapshots_type ON item_snapshots_ss11_expert(item_type)"),
    ];

    for (table, sql) in indexes {
        create_index_if_table_exists(pool, table, sql).await?;
    }

    Ok(())
}

/// Idempotently ensure all tables exist.
/// Real-time tables (items_*, fire_price_*): no season suffix, always current season
/// Snapshot tables (*_snapshots_ss{season}_*): with season suffix, for historical data
pub(crate) async fn ensure_split_tables(pool: &SqlitePool) -> Result<(), String> {
    use crate::db::table_resolver::TableResolver;

    // 1. Ensure real-time tables (no season suffix)
    for mode in ["season_normal", "season_expert"] {
        let items_table = TableResolver::items_table("ss12", mode);
        let fire_table = TableResolver::fire_price_table("ss12", mode);

        // Items table - real-time latest prices (client采集)
        sqlx::query(&format!(
            "CREATE TABLE IF NOT EXISTS {} (
                item_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                item_type TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT '',
                price REAL NOT NULL DEFAULT 0,
                last_time INTEGER,
                season_day INTEGER NOT NULL DEFAULT 1,
                updated_at INTEGER NOT NULL
            )",
            items_table
        ))
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to ensure items table {}: {}", items_table, e))?;

        // Fire price table - real-time latest fire price (client采集)
        sqlx::query(&format!(
            "CREATE TABLE IF NOT EXISTS {} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rmb_per_10k_fire REAL NOT NULL,
                fire_per_rmb REAL NOT NULL DEFAULT 0,
                increase_ratio REAL,
                trading_volume TEXT,
                source TEXT NOT NULL DEFAULT '',
                source_time TEXT,
                scraped_at INTEGER NOT NULL,
                season_day INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                UNIQUE(scraped_at)
            )",
            fire_table
        ))
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to ensure fire_price table {}: {}", fire_table, e))?;

        add_column_if_missing(
            pool,
            &items_table,
            "season_day",
            "INTEGER NOT NULL DEFAULT 1",
        )
        .await?;
        add_column_if_missing(
            pool,
            &fire_table,
            "season_day",
            "INTEGER NOT NULL DEFAULT 1",
        )
        .await?;

        tracing::info!(
            "Ensured real-time tables for {}: {}, {}",
            mode,
            items_table,
            fire_table
        );
    }

    // 2. Ensure snapshot tables for every season registered in the database.
    let seasons: Vec<(String,)> =
        sqlx::query_as("SELECT id FROM seasons ORDER BY started_at DESC, id DESC")
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to load seasons for snapshot tables: {}", e))?;
    for (season,) in seasons {
        for mode in ["season_normal", "season_expert"] {
            let snapshots_table = TableResolver::item_snapshots_table(&season, mode);
            let fire_snapshots_table = TableResolver::fire_price_snapshots_table(&season, mode);

            // Item snapshots table - hourly snapshots (server定时写入)
            sqlx::query(&format!(
                "CREATE TABLE IF NOT EXISTS {} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                item_type TEXT NOT NULL DEFAULT '',
                fire_price REAL NOT NULL,
                scraped_at INTEGER NOT NULL,
                season_day INTEGER NOT NULL DEFAULT 1,
                UNIQUE(item_id, scraped_at)
            )",
                snapshots_table
            ))
            .execute(pool)
            .await
            .map_err(|e| {
                format!(
                    "Failed to ensure item snapshots table {}: {}",
                    snapshots_table, e
                )
            })?;

            add_column_if_missing(pool, &snapshots_table, "name", "TEXT NOT NULL DEFAULT ''")
                .await?;
            add_column_if_missing(
                pool,
                &snapshots_table,
                "item_type",
                "TEXT NOT NULL DEFAULT ''",
            )
            .await?;

            add_column_if_missing(
                pool,
                &snapshots_table,
                "season_day",
                "INTEGER NOT NULL DEFAULT 1",
            )
            .await?;

            // Fire price snapshots table - hourly snapshots (server定时写入)
            sqlx::query(&format!(
                "CREATE TABLE IF NOT EXISTS {} (
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
            )",
                fire_snapshots_table
            ))
            .execute(pool)
            .await
            .map_err(|e| {
                format!(
                    "Failed to ensure fire_price snapshots table {}: {}",
                    fire_snapshots_table, e
                )
            })?;

            add_column_if_missing(
                pool,
                &fire_snapshots_table,
                "season_day",
                "INTEGER NOT NULL DEFAULT 1",
            )
            .await?;

            let mode_suffix = if mode == "season_expert" {
                "expert"
            } else {
                "normal"
            };
            for sql in [
                format!(
                    "CREATE INDEX IF NOT EXISTS idx_{}_{}_snapshots_season_day ON {}(season_day)",
                    season, mode_suffix, snapshots_table
                ),
                format!(
                    "CREATE INDEX IF NOT EXISTS idx_{}_{}_snapshots_name ON {}(name)",
                    season, mode_suffix, snapshots_table
                ),
                format!(
                    "CREATE INDEX IF NOT EXISTS idx_{}_{}_snapshots_type ON {}(item_type)",
                    season, mode_suffix, snapshots_table
                ),
                format!(
                "CREATE INDEX IF NOT EXISTS idx_fire_{}_{}_snapshots_season_day ON {}(season_day)",
                season, mode_suffix, fire_snapshots_table
            ),
            ] {
                sqlx::query(&sql)
                    .execute(pool)
                    .await
                    .map_err(|e| format!("Failed to create dynamic snapshot index: {}", e))?;
            }

            tracing::info!(
                "Ensured snapshot tables for {}/{}: {}, {}",
                season,
                mode,
                snapshots_table,
                fire_snapshots_table
            );
        }
    }

    Ok(())
}

async fn seed_seasons(pool: &SqlitePool) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();
    let has_current: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM seasons WHERE is_current = 1)")
            .fetch_one(pool)
            .await
            .map_err(|e| format!("Failed to inspect current season before seeding: {}", e))?;

    let seasons = [
        (
            "ss13",
            "SS13 当前赛季",
            "ss13",
            1,
            crate::core::constants::SS13_START_TIMESTAMP,
        ),
        (
            "ss12",
            "SS12 历史赛季",
            "ss12",
            0,
            crate::core::constants::SS12_START_TIMESTAMP,
        ),
    ];

    for (id, name, code, is_current, started_at) in seasons {
        sqlx::query(
            r#"INSERT INTO seasons (id, name, code, is_current, started_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                   started_at = excluded.started_at,
                   updated_at = excluded.updated_at
               WHERE (seasons.id = 'ss13' AND seasons.started_at = 1784332800)
                  OR (seasons.id = 'ss12' AND seasons.started_at = 1776355200)"#,
        )
        .bind(id)
        .bind(name)
        .bind(code)
        .bind(if has_current { 0 } else { is_current })
        .bind(started_at)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to seed season {}: {}", id, e))?;
    }

    tracing::info!("Seasons seed data ensured");

    // Only seed test data in debug builds or when explicitly enabled
    #[cfg(debug_assertions)]
    {
        seed_test_data_for_all_seasons(pool).await?;
    }

    Ok(())
}

/// Generate test snapshot data for SS11 and SS12 from realtime table data.
/// Generates 20 days of hourly snapshots for each season.
#[cfg(debug_assertions)]
async fn seed_test_data_for_all_seasons(pool: &SqlitePool) -> Result<(), String> {
    use crate::db::table_resolver::TableResolver;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    tracing::info!("Generating test snapshot data for all seasons from realtime tables...");

    let mut rng = StdRng::seed_from_u64(42);

    for mode in ["season_normal", "season_expert"] {
        let realtime_items_table = TableResolver::items_table("ss12", mode);
        let realtime_fire_table = TableResolver::fire_price_table("ss12", mode);

        // Read items from realtime table
        let realtime_items: Vec<(String, String, String, f64)> = sqlx::query_as(&format!(
            "SELECT item_id, name, item_type, price FROM {}",
            realtime_items_table
        ))
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        if realtime_items.is_empty() {
            tracing::warn!(
                "Realtime table {} has no items, skipping snapshot generation for {}",
                realtime_items_table,
                mode
            );
            continue;
        }

        tracing::info!(
            "Found {} items in realtime table {}, generating snapshots...",
            realtime_items.len(),
            realtime_items_table
        );

        // Read latest fire price from realtime table
        let latest_fire: Option<(f64,)> = sqlx::query_as(&format!(
            "SELECT rmb_per_10k_fire FROM {} ORDER BY scraped_at DESC LIMIT 1",
            realtime_fire_table
        ))
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

        let base_fire_price = latest_fire.map(|f| f.0).unwrap_or(35.0);

        // Generate snapshots for SS12 (current season, start: 2026-04-17)
        let ss12_start = chrono::DateTime::parse_from_rfc3339("2026-04-17T00:00:00Z")
            .map(|dt| dt.timestamp())
            .unwrap_or(1775337600);
        generate_season_snapshots(
            pool,
            "ss12",
            mode,
            ss12_start,
            &realtime_items,
            base_fire_price,
            &mut rng,
        )
        .await?;
    }

    tracing::info!("All season snapshot data generation complete");
    Ok(())
}

/// Generate hourly snapshots for a specific season (only from real data)
#[cfg(debug_assertions)]
async fn generate_season_snapshots(
    pool: &SqlitePool,
    season_id: &str,
    mode: &str,
    _season_start: i64,
    realtime_items: &[(String, String, String, f64)],
    _base_fire_price: f64,
    _rng: &mut rand::rngs::StdRng,
) -> Result<(), String> {
    use crate::db::table_resolver::TableResolver;

    TableResolver::validate(season_id, mode).map_err(|e| e.to_string())?;
    let item_snapshots = TableResolver::item_snapshots_table(season_id, mode);
    let fire_snapshots = TableResolver::fire_price_snapshots_table(season_id, mode);

    // Check if item_snapshots already has data
    let snapshot_count: (i64,) =
        sqlx::query_as(&format!("SELECT COUNT(*) FROM {}", item_snapshots))
            .fetch_one(pool)
            .await
            .unwrap_or((0,));

    // Check if existing snapshot data matches realtime item_ids
    let mut needs_regeneration = false;
    if snapshot_count.0 > 0 && !realtime_items.is_empty() {
        let first_realtime_id = &realtime_items[0].0;
        let snapshot_item_match: (i64,) = sqlx::query_as(&format!(
            "SELECT COUNT(*) FROM {} WHERE item_id = ?",
            item_snapshots
        ))
        .bind(first_realtime_id)
        .fetch_one(pool)
        .await
        .unwrap_or((0,));

        if snapshot_item_match.0 == 0 {
            tracing::warn!(
                "{} {} snapshot data item_id mismatch! Realtime item_id {} not found in snapshots. Clearing and regenerating...",
                season_id, mode, first_realtime_id
            );
            needs_regeneration = true;
            // Clear existing snapshot data
            if let Err(e) = sqlx::query(&format!("DELETE FROM {}", item_snapshots))
                .execute(pool)
                .await
            {
                tracing::warn!("Failed to clear item snapshots: {}", e);
            }
            if let Err(e) = sqlx::query(&format!("DELETE FROM {}", fire_snapshots))
                .execute(pool)
                .await
            {
                tracing::warn!("Failed to clear fire snapshots: {}", e);
            }
        }
    }

    if snapshot_count.0 > 0 && !needs_regeneration {
        tracing::info!(
            "{} {} item_snapshots already has {} records and item_ids match",
            season_id,
            mode,
            snapshot_count.0
        );
    } else if realtime_items.is_empty() {
        tracing::info!(
            "{} {} item_snapshots is empty and no realtime items available, will be populated by hourly snapshot task",
            season_id,
            mode
        );
    } else {
        tracing::info!(
            "{} {} item_snapshots is empty but realtime items available, will be populated by hourly snapshot task",
            season_id,
            mode
        );
    }

    // Check if fire_price_snapshots already has data
    let fire_snapshot_count: (i64,) =
        sqlx::query_as(&format!("SELECT COUNT(*) FROM {}", fire_snapshots))
            .fetch_one(pool)
            .await
            .unwrap_or((0,));

    if fire_snapshot_count.0 > 0 {
        tracing::info!(
            "{} {} fire_price_snapshots already has {} records",
            season_id,
            mode,
            fire_snapshot_count.0
        );
    } else {
        tracing::info!(
            "{} {} fire_price_snapshots is empty, will be populated by hourly snapshot task",
            season_id,
            mode
        );
    }

    Ok(())
}

#[cfg(test)]
mod migration_tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn file_pool(db_path: &std::path::Path) -> SqlitePool {
        let db_url = format!("sqlite:{}?mode=rwc", db_path.display());
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .expect("test sqlite pool should connect")
    }

    fn temp_db_path() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "tl-monitor-migration-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).expect("temp migration test dir should be created");
        dir.join("tl_monitor.db")
    }

    async fn assert_columns(pool: &SqlitePool, table: &str, columns: &[&str]) {
        let existing = table_columns(pool, table)
            .await
            .expect("table columns should be inspectable");
        for column in columns {
            assert!(
                existing.contains(*column),
                "missing column {}.{}; existing columns: {:?}",
                table,
                column,
                existing
            );
        }
    }

    async fn assert_indexes(pool: &SqlitePool, indexes: &[&str]) {
        for index in indexes {
            let exists: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?",
            )
            .bind(index)
            .fetch_one(pool)
            .await
            .expect("index metadata should be readable");
            assert_eq!(exists, 1, "missing index {}", index);
        }
    }

    #[tokio::test]
    async fn fresh_migrations_create_current_schema() {
        let db_path = temp_db_path();
        let pool = file_pool(&db_path).await;

        run_migrations(&pool, &db_path, false)
            .await
            .expect("fresh migrations should complete");

        assert_columns(
            &pool,
            "strategy_details",
            &["id", "name", "label", "difficulty", "image_url"],
        )
        .await;
        assert_columns(
            &pool,
            "strategy_detail_outputs",
            &["item_name", "estimated_value", "realtime_value"],
        )
        .await;
        assert_columns(&pool, "item_realtime_prices", &["name", "fire_price"]).await;
        assert_columns(
            &pool,
            "season_api_configs",
            &["etor_season_id_normal", "etor_season_id_expert"],
        )
        .await;
        assert_indexes(
            &pool,
            &[
                "idx_inventory_positions_season_market",
                "idx_inventory_buy_watches_season_market",
                "idx_inventory_buy_watches_target_price",
            ],
        )
        .await;

        let version: i64 = sqlx::query_scalar("SELECT MAX(version) FROM _migrations")
            .fetch_one(&pool)
            .await
            .expect("migration version should be readable");
        assert_eq!(version, LATEST_SCHEMA_VERSION);
    }

    #[tokio::test]
    async fn migrations_resume_when_v23_v24_columns_already_exist() {
        let db_path = temp_db_path();
        let pool = file_pool(&db_path).await;

        run_migrations(&pool, &db_path, false)
            .await
            .expect("fresh migrations should complete");
        sqlx::query("DELETE FROM _migrations WHERE version >= 23")
            .execute(&pool)
            .await
            .expect("migration markers should be removable for resume test");

        assert_eq!(read_schema_version(&pool).await.unwrap(), 22);
        run_migrations(&pool, &db_path, true)
            .await
            .expect("partially applied v23/v24 migrations should resume");

        assert_columns(
            &pool,
            "strategy_details",
            &[
                "estimated_cost",
                "estimated_revenue_min",
                "estimated_revenue_max",
                "runs_per_hour",
            ],
        )
        .await;
        assert_eq!(
            read_schema_version(&pool).await.unwrap(),
            LATEST_SCHEMA_VERSION
        );
    }

    #[tokio::test]
    async fn startup_preserves_dynamic_seasons_and_creates_snapshot_tables() {
        let db_path = temp_db_path();
        let pool = file_pool(&db_path).await;
        run_migrations(&pool, &db_path, false)
            .await
            .expect("fresh migrations should complete");

        sqlx::query("DELETE FROM seasons")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO seasons (id, name, code, is_current, started_at, created_at, updated_at)
             VALUES ('ss14', 'SS14 当前赛季', 'ss14', 1, 1792108800, 1, 1)",
        )
        .execute(&pool)
        .await
        .unwrap();

        run_migrations(&pool, &db_path, true)
            .await
            .expect("startup schema finalization should preserve dynamic seasons");

        let current: String = sqlx::query_scalar("SELECT id FROM seasons WHERE is_current = 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(current, "ss14");
        for table in [
            "item_snapshots_ss14_normal",
            "item_snapshots_ss14_expert",
            "fire_price_snapshots_ss14_normal",
            "fire_price_snapshots_ss14_expert",
        ] {
            assert!(table_exists(&pool, table).await.unwrap(), "missing {table}");
        }
    }

    #[tokio::test]
    async fn migrations_repair_legacy_strategy_and_realtime_tables() {
        let db_path = temp_db_path();
        let pool = file_pool(&db_path).await;

        sqlx::query(
            "CREATE TABLE _migrations (
                version INTEGER PRIMARY KEY,
                applied_at INTEGER NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO _migrations (version, applied_at) VALUES (10, 1)")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query(
            "CREATE TABLE seasons (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                code TEXT NOT NULL,
                is_current INTEGER NOT NULL DEFAULT 0,
                started_at INTEGER,
                ended_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE strategy_details (
                id TEXT PRIMARY KEY,
                strategy_id TEXT NOT NULL,
                season_id TEXT NOT NULL DEFAULT 'ss12',
                market_mode TEXT NOT NULL DEFAULT 'season_normal',
                item_id TEXT NOT NULL,
                item_name TEXT NOT NULL DEFAULT '',
                item_type TEXT NOT NULL DEFAULT '',
                target_price REAL NOT NULL DEFAULT 0,
                current_price REAL NOT NULL DEFAULT 0,
                expected_profit_rate REAL NOT NULL DEFAULT 0,
                rank INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE strategy_outputs (
                id TEXT PRIMARY KEY,
                strategy_id TEXT NOT NULL,
                season_id TEXT NOT NULL DEFAULT 'ss12',
                market_mode TEXT NOT NULL DEFAULT 'season_normal',
                item_id TEXT NOT NULL,
                item_name TEXT NOT NULL DEFAULT '',
                item_type TEXT NOT NULL DEFAULT '',
                buy_price REAL NOT NULL DEFAULT 0,
                sell_price REAL NOT NULL DEFAULT 0,
                profit_rate REAL NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE item_realtime_prices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id TEXT NOT NULL,
                item_name TEXT NOT NULL,
                price REAL NOT NULL,
                scraped_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO item_realtime_prices (item_id, item_name, price, scraped_at, created_at)
             VALUES ('item-1', '测试物品', 12.5, 100, 90)",
        )
        .execute(&pool)
        .await
        .unwrap();

        assert!(has_user_schema(&pool).await.unwrap());
        assert_eq!(read_schema_version(&pool).await.unwrap(), 10);

        run_migrations(&pool, &db_path, true)
            .await
            .expect("legacy migrations should be repaired");

        let backup_dir = db_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .join("backups");
        let backup_count = std::fs::read_dir(&backup_dir)
            .expect("migration backup dir should exist")
            .filter_map(Result::ok)
            .count();
        assert_eq!(backup_count, 1);

        assert_columns(
            &pool,
            "strategy_details",
            &[
                "name",
                "label",
                "difficulty",
                "output_value",
                "image_url",
                "estimated_cost",
                "estimated_revenue_min",
                "estimated_revenue_max",
                "runs_per_hour",
            ],
        )
        .await;
        assert_columns(&pool, "item_realtime_prices", &["name", "fire_price"]).await;
        assert_columns(&pool, "strategy_outputs", &["realtime_value"]).await;
        assert_columns(
            &pool,
            "season_api_configs",
            &["etor_season_id_normal", "etor_season_id_expert"],
        )
        .await;
        assert_indexes(
            &pool,
            &[
                "idx_inventory_positions_season_market",
                "idx_inventory_buy_watches_season_market",
                "idx_inventory_buy_watches_target_price",
            ],
        )
        .await;

        let backup_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type='table' AND name LIKE 'strategy_details_legacy_%'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(backup_count, 1);

        assert_eq!(
            read_schema_version(&pool).await.unwrap(),
            LATEST_SCHEMA_VERSION
        );

        let copied: (String, f64) = sqlx::query_as(
            "SELECT name, fire_price FROM item_realtime_prices WHERE item_id = 'item-1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(copied, ("测试物品".to_string(), 12.5));
    }

    #[tokio::test]
    async fn prunes_old_migration_backups() {
        let db_path = temp_db_path();
        let backup_dir = db_path.parent().unwrap().join("backups");
        tokio::fs::create_dir_all(&backup_dir).await.unwrap();

        for idx in 0..5 {
            tokio::fs::write(
                backup_dir.join(format!(
                    "tl_monitor_migration_v{}_to_v{}_20260620_00000{}.000.db",
                    idx, LATEST_SCHEMA_VERSION, idx
                )),
                b"backup",
            )
            .await
            .unwrap();
        }
        tokio::fs::write(backup_dir.join("manual-note.txt"), b"keep me")
            .await
            .unwrap();

        let removed = prune_migration_backups(&backup_dir, 3).await.unwrap();
        let mut entries = tokio::fs::read_dir(&backup_dir).await.unwrap();
        let mut migration_backup_count = 0usize;
        let mut manual_note_exists = false;
        while let Some(entry) = entries.next_entry().await.unwrap() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name.starts_with("tl_monitor_migration_v") && file_name.ends_with(".db") {
                migration_backup_count += 1;
            }
            if file_name == "manual-note.txt" {
                manual_note_exists = true;
            }
        }

        assert_eq!(removed, 2);
        assert_eq!(migration_backup_count, 3);
        assert!(manual_note_exists);
    }
}

pub fn start_background_tasks(
    rt: tokio::runtime::Handle,
    app: tauri::AppHandle,
    state: Arc<AppState>,
) -> SchedulerHandle {
    let (fire_abort_tx, fire_abort_rx) = broadcast::channel::<()>(1);
    let (items_abort_tx, items_abort_rx) = broadcast::channel::<()>(1);
    let (snapshot_abort_tx, snapshot_abort_rx) = broadcast::channel::<()>(1);
    let (alert_abort_tx, alert_abort_rx) = broadcast::channel::<()>(1);
    let (gap_filler_abort_tx, gap_filler_abort_rx) = broadcast::channel::<()>(1);

    {
        let app = app.clone();
        let state = state.clone();
        state.task_status.write().fire_scrape_running = true;
        rt.spawn(async move {
            run_fire_scrape_task(app, state, fire_abort_rx).await;
        });
    }

    {
        let app = app.clone();
        let state = state.clone();
        state.task_status.write().items_reload_running = true;
        rt.spawn(async move {
            run_items_reload_task(app, state, items_abort_rx).await;
        });
    }

    {
        let app = app.clone();
        let state = state.clone();
        rt.spawn(async move {
            run_hourly_snapshot_task(app, state, snapshot_abort_rx).await;
        });
    }

    {
        let app = app.clone();
        let state = state.clone();
        rt.spawn(async move {
            run_price_alert_task(app, state, alert_abort_rx).await;
        });
    }

    {
        // 火价缺口自动补全任务：每小时扫一次，发现整点缺失就用前后真实数据插值
        let state = state.clone();
        rt.spawn(async move {
            run_fire_gap_filler_task(state, gap_filler_abort_rx).await;
        });
    }

    SchedulerHandle {
        fire_scrape_abort: fire_abort_tx,
        items_reload_abort: items_abort_tx,
        hourly_snapshot_abort: snapshot_abort_tx,
        alert_task_abort: alert_abort_tx,
        fire_gap_filler_abort: gap_filler_abort_tx,
    }
}
