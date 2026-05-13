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
use crate::scheduler::history_task::run_hourly_snapshot_task;
use crate::scheduler::items_task::run_items_reload_task;
use crate::scheduler::SchedulerHandle;
use crate::scraper;
use parking_lot::RwLock;
use serde::Deserialize;
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::sync::Arc;
use tokio::sync::broadcast;

pub fn full_table_json_path() -> std::path::PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("com.tlmonitor.app")
        .join("data")
        .join("full_table.json")
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
pub fn load_items_from_json(
    season_id: &str,
    market_mode: &str,
    json_path: &str,
) -> Result<Vec<Item>, String> {
    let path = std::path::PathBuf::from(json_path);
    tracing::info!("load_items_from_json: reading from {:?}", path);

    let content = std::fs::read_to_string(&path)
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
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
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

    run_migrations(&pool).await?;

    let config = crate::core::config::load_config().unwrap_or_else(|e| {
        tracing::warn!("Failed to load config.yaml: {}", e);
        AppConfig::default()
    });

    // Always fetch latest fire price from API on startup
    let default_season = config.app.season_id.clone();
    let default_mode = config.scrape.fire_price_mode.clone();
    let expert_enabled = config.scrape.expert_enabled;

    tracing::info!("[STARTUP] Fetching latest fire price from API...");

    // Scrape normal mode fire price (always)
    let mut fire_price: Option<FirePriceSnapshot> = None;
    match scraper::scrape_fire_price().await {
        Ok(snapshot) => {
            tracing::info!(
                "[STARTUP] Successfully fetched normal fire price: {} RMB/10K fire",
                snapshot.rmb_per_10k_fire
            );
            if let Err(e) =
                repo_fire::insert_fire_record(&pool, &default_season, "season_normal", &snapshot)
                    .await
            {
                tracing::warn!("[STARTUP] Failed to insert normal fire record: {}", e);
            } else {
                tracing::info!("[STARTUP] Successfully inserted normal fire record");
            }
            if default_mode == "season_normal" {
                fire_price = Some(snapshot);
            }
        }
        Err(e) => {
            tracing::warn!(
                "[STARTUP] Failed to fetch normal fire price: {}, trying database...",
                e
            );
            // Fallback to database if API fails
            if let Ok(Some(record)) =
                repo_fire::get_latest_fire(&pool, &default_season, "season_normal").await
            {
                tracing::info!(
                    "[STARTUP] Using cached normal fire price from database: {} RMB/10K fire",
                    record.rmb_per_10k_fire
                );
                let snapshot = FirePriceSnapshot {
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
                };
                if default_mode == "season_normal" {
                    fire_price = Some(snapshot);
                }
            }
        }
    }

    // Scrape expert mode fire price if expert_enabled
    if expert_enabled {
        tracing::info!("[STARTUP] Expert mode enabled, fetching expert fire price...");
        match scraper::qiandao::scrape_by_mode("专家").await {
            Ok(snapshot) => {
                tracing::info!(
                    "[STARTUP] Successfully fetched expert fire price: {} RMB/10K fire",
                    snapshot.rmb_per_10k_fire
                );
                if let Err(e) = repo_fire::insert_fire_record(
                    &pool,
                    &default_season,
                    "season_expert",
                    &snapshot,
                )
                .await
                {
                    tracing::warn!("[STARTUP] Failed to insert expert fire record: {}", e);
                } else {
                    tracing::info!("[STARTUP] Successfully inserted expert fire record");
                }
                if default_mode == "season_expert" {
                    fire_price = Some(snapshot);
                }
            }
            Err(e) => {
                tracing::warn!("[STARTUP] Failed to fetch expert fire price: {}", e);
            }
        }
    } else {
        tracing::info!("[STARTUP] Expert mode disabled, skipping expert fire price scrape");
    }

    // Auto-import items: prefer API scrape, fall back to JSON file
    // Always refresh from API on startup to get latest prices
    let default_season = config.app.season_id.clone();
    let _default_mode = config.scrape.fire_price_mode.clone();
    let json_path = config.scrape.items_json_path.clone();
    let json_exists = std::path::Path::new(&json_path).exists();

    // Scrape modes based on expert_enabled setting
    let expert_enabled = config.scrape.expert_enabled;

    tracing::info!("[STARTUP] Fetching latest items from API...");
    let normal_items =
        scrape_mode_items(&default_season, "season_normal", &json_path, json_exists).await;

    // Process normal mode items
    let items_cache: Vec<Item> = match normal_items {
        Ok(items) if !items.is_empty() => {
            tracing::info!(
                "[STARTUP] Successfully fetched {} normal items from API",
                items.len()
            );
            if let Err(e) =
                repo_items::bulk_insert_items(&pool, &default_season, "season_normal", &items).await
            {
                tracing::error!("[STARTUP] Failed to update normal items in database: {}", e);
            } else {
                tracing::info!("[STARTUP] Successfully updated normal items in database");
            }
            insert_realtime_prices(&pool, &items).await;
            items
        }
        Ok(_) => {
            tracing::warn!("[STARTUP] No normal items fetched from API");
            Vec::new()
        }
        Err(e) => {
            tracing::warn!("[STARTUP] Failed to fetch normal items from API: {}", e);
            Vec::new()
        }
    };

    // Process expert mode items only if expert_enabled is true
    if expert_enabled {
        match scrape_mode_items(&default_season, "season_expert", &json_path, json_exists).await {
            Ok(items) if !items.is_empty() => {
                tracing::info!(
                    "[STARTUP] Successfully fetched {} expert items from API",
                    items.len()
                );
                if let Err(e) =
                    repo_items::bulk_insert_items(&pool, &default_season, "season_expert", &items)
                        .await
                {
                    tracing::error!("[STARTUP] Failed to update expert items in database: {}", e);
                } else {
                    tracing::info!("[STARTUP] Successfully updated expert items in database");
                }
            }
            Ok(_) => {
                tracing::info!(
                    "[STARTUP] Expert mode enabled but no data fetched (season may not be started)"
                );
            }
            Err(e) => {
                tracing::warn!("[STARTUP] Expert mode enabled but API failed: {}", e);
            }
        }
    } else {
        tracing::info!("[STARTUP] Expert mode disabled, skipping expert items scrape");
    }

    // Cleanup old realtime records
    if let Err(e) = repo_item_realtime_prices::cleanup_old_records(&pool).await {
        tracing::warn!("[STARTUP] Failed to cleanup old realtime records: {}", e);
    }

    let state = AppState {
        db: pool,
        config: RwLock::new(config.clone()),
        fire_price: RwLock::new(fire_price),
        items_cache: RwLock::new(Arc::new(items_cache)),
        active_context: RwLock::new(MarketContext {
            season_id: config.app.season_id.clone(),
            market_mode: MarketMode::SeasonNormal,
        }),
        task_status: RwLock::new(TaskStatus {
            fire_scrape_running: false,
            items_reload_running: false,
            last_fire_scrape: None,
            last_items_reload: None,
            db_size_kb: 0.0,
        }),
        scheduler_handle: RwLock::new(None),
        snapshot_running: RwLock::new(false),
    };

    Ok(state)
}

async fn scrape_mode_items(
    season: &str,
    mode: &str,
    json_path: &str,
    json_exists: bool,
) -> Result<Vec<Item>, String> {
    // Try API first
    match scraper::scrape_items(season, mode).await {
        Ok(items) => Ok(items),
        Err(e) => {
            tracing::warn!(
                "[STARTUP] Failed to fetch {} items from API: {}, trying JSON file...",
                mode,
                e
            );

            // Fallback to JSON file if API fails
            if json_exists {
                tracing::info!(
                    "[STARTUP] Loading {} items from JSON file: {}",
                    mode,
                    json_path
                );
                match load_items_from_json(season, mode, json_path) {
                    Ok(items) => {
                        tracing::info!(
                            "[STARTUP] Loaded {} {} items from JSON file",
                            items.len(),
                            mode
                        );
                        Ok(items)
                    }
                    Err(e) => {
                        tracing::warn!("[STARTUP] Failed to load {} from JSON: {}", mode, e);
                        Err(e.to_string())
                    }
                }
            } else {
                Err(e.to_string())
            }
        }
    }
}

async fn insert_realtime_prices(pool: &SqlitePool, items: &[Item]) {
    if items.is_empty() {
        return;
    }
    let now = chrono::Utc::now().timestamp();
    let realtime_records: Vec<(String, String, f64, i64)> = items
        .iter()
        .map(|item| (item.item_id.clone(), item.name.clone(), item.price, now))
        .collect();

    if let Err(e) =
        repo_item_realtime_prices::batch_insert_realtime_prices(pool, &realtime_records).await
    {
        tracing::warn!("[STARTUP] Failed to insert realtime prices: {}", e);
    }
}

async fn run_migrations(pool: &SqlitePool) -> Result<(), String> {
    // Create migration tracking table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create _migrations: {}", e))?;

    // Get current schema version
    let current_version: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) FROM _migrations")
            .fetch_one(pool)
            .await
            .unwrap_or(0);

    tracing::info!("Current database schema version: {}", current_version);

    // Apply v1: initial schema
    if current_version < 1 {
        tracing::info!("Applying migration v1: initial schema");
        let sql = include_str!("db/migrations/001_initial.sql");
        sqlx::query(sql)
            .execute(pool)
            .await
            .map_err(|e| format!("Migration v1 failed: {}", e))?;

        sqlx::query("INSERT INTO _migrations (version, applied_at) VALUES (1, ?)")
            .bind(chrono::Utc::now().timestamp())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Apply v2: add constraints and indexes
    if current_version < 2 {
        tracing::info!("Applying migration v2: add constraints and indexes");
        let sql = include_str!("db/migrations/002_add_constraints.sql");
        sqlx::query(sql)
            .execute(pool)
            .await
            .map_err(|e| format!("Migration v2 failed: {}", e))?;

        sqlx::query("INSERT INTO _migrations (version, applied_at) VALUES (2, ?)")
            .bind(chrono::Utc::now().timestamp())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Apply v3: split season tables
    if current_version < 3 {
        tracing::info!("Applying migration v3: split season tables");
        let sql = include_str!("db/migrations/003_split_season_tables.sql");
        sqlx::query(sql)
            .execute(pool)
            .await
            .map_err(|e| format!("Migration v3 failed: {}", e))?;

        sqlx::query("INSERT INTO _migrations (version, applied_at) VALUES (3, ?)")
            .bind(chrono::Utc::now().timestamp())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Apply v4: remove section_items foreign key constraint
    if current_version < 4 {
        tracing::info!("Applying migration v4: remove section_items FK constraint");
        let sql = include_str!("db/migrations/004_remove_section_items_fk.sql");
        sqlx::query(sql)
            .execute(pool)
            .await
            .map_err(|e| format!("Migration v4 failed: {}", e))?;

        sqlx::query("INSERT INTO _migrations (version, applied_at) VALUES (4, ?)")
            .bind(chrono::Utc::now().timestamp())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
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
    if current_version < 9 {
        tracing::info!("Applying migration v9: create strategy detail tables");
        ensure_strategy_detail_schema(pool).await?;
        record_migration(pool, 9).await?;
    }
    if current_version < 10 {
        // v10: Add realtime_value to strategy_outputs (idempotent)
        // First ensure the table exists (in case v1 failed to create it)
        if !table_exists(pool, "strategy_outputs").await? {
            tracing::info!("Creating strategy_outputs table for migration v10");
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
                    realtime_value REAL DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
                )"#,
            )
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to create strategy_outputs table: {}", e))?;
        }

        // Now add the realtime_value column if it doesn't exist
        if !column_exists(pool, "strategy_outputs", "realtime_value").await? {
            sqlx::query(
                "ALTER TABLE strategy_outputs ADD COLUMN realtime_value REAL NOT NULL DEFAULT 0",
            )
            .execute(pool)
            .await
            .map_err(|e| format!("Migration v10 failed: {}", e))?;
        }
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
    // v15 now includes table creation to ensure indexes can be created
    // even if v9 failed to create the strategy_detail_costs and strategy_detail_outputs tables
    if current_version < 15 {
        tracing::info!("Applying migration v15: add performance indexes");
        drop_known_performance_indexes(pool).await?;
        apply_performance_indexes_migration(pool).await?;
        record_migration(pool, 15).await?;
    }

    // Always run critical schema repair helpers. This protects users who have a
    // partially applied migration marker from a previous crashing build.
    ensure_strategy_detail_schema(pool).await?;
    ensure_item_realtime_prices_schema(pool).await?;
    ensure_arbitrage_schema(pool).await?;
    apply_performance_indexes_migration(pool).await?;

    // Ensure split tables exist (idempotent, handles cases where v3 migration
    // was marked as applied but tables weren't actually created)
    ensure_split_tables(pool).await?;

    // Seed seasons data
    seed_seasons(pool).await?;

    tracing::info!("Database migrations complete");
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

async fn apply_sql_migration(pool: &SqlitePool, version: i64, sql: &str) -> Result<(), String> {
    tracing::info!("Applying migration v{}", version);
    sqlx::query(sql)
        .execute(pool)
        .await
        .map_err(|e| format!("Migration v{} failed: {}", version, e))?;
    record_migration(pool, version).await
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

async fn backup_table(pool: &SqlitePool, table: &str) -> Result<Option<String>, String> {
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
            realtime_value REAL DEFAULT 0,
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
        "REAL DEFAULT 0",
    )
    .await?;
    add_column_if_missing(pool, "strategy_detail_outputs", "remark", "TEXT").await?;

    Ok(())
}

async fn ensure_item_realtime_prices_schema(pool: &SqlitePool) -> Result<(), String> {
    let mut backup: Option<(String, std::collections::HashSet<String>)> = None;

    if table_exists(pool, "item_realtime_prices").await? {
        let columns = table_columns(pool, "item_realtime_prices").await?;
        let required = ["item_id", "name", "fire_price", "scraped_at", "created_at"];
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
            created_at INTEGER NOT NULL DEFAULT (unixepoch())
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
                "INSERT INTO item_realtime_prices (item_id, name, fire_price, scraped_at, created_at)
                 SELECT item_id, COALESCE({}, ''), COALESCE({}, 0), scraped_at, COALESCE({}, unixepoch())
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
            updated_at INTEGER NOT NULL
        )"#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to ensure arbitrage_recipes table: {}", e))?;

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
async fn ensure_split_tables(pool: &SqlitePool) -> Result<(), String> {
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

    // 2. Ensure snapshot tables (with season suffix)
    for (season, mode) in TableResolver::supported_combinations() {
        let snapshots_table = TableResolver::item_snapshots_table(season, mode);
        let fire_snapshots_table = TableResolver::fire_price_snapshots_table(season, mode);

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

        add_column_if_missing(pool, &snapshots_table, "name", "TEXT NOT NULL DEFAULT ''").await?;
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

        tracing::info!(
            "Ensured snapshot tables for {}/{}: {}, {}",
            season,
            mode,
            snapshots_table,
            fire_snapshots_table
        );
    }

    Ok(())
}

async fn seed_seasons(pool: &SqlitePool) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();

    let seasons = vec![
        ("ss12", "SS12 当前赛季", "ss12", 1),
        ("ss11", "SS11 历史赛季", "ss11", 0),
        ("ss10", "SS10 历史赛季", "ss10", 0),
    ];

    for (id, name, code, is_current) in seasons {
        sqlx::query(
            r#"INSERT OR IGNORE INTO seasons (id, name, code, is_current, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)"#,
        )
        .bind(id)
        .bind(name)
        .bind(code)
        .bind(is_current)
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
            .expect("固定日期格式应始终有效")
            .timestamp();
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
            let _ = sqlx::query(&format!("DELETE FROM {}", item_snapshots))
                .execute(pool)
                .await;
            let _ = sqlx::query(&format!("DELETE FROM {}", fire_snapshots))
                .execute(pool)
                .await;
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

    async fn memory_pool() -> SqlitePool {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory sqlite pool should connect")
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

    #[tokio::test]
    async fn fresh_migrations_create_current_schema() {
        let pool = memory_pool().await;

        run_migrations(&pool)
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

        let version: i64 = sqlx::query_scalar("SELECT MAX(version) FROM _migrations")
            .fetch_one(&pool)
            .await
            .expect("migration version should be readable");
        assert_eq!(version, 15);
    }

    #[tokio::test]
    async fn migrations_repair_legacy_strategy_and_realtime_tables() {
        let pool = memory_pool().await;

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

        run_migrations(&pool)
            .await
            .expect("legacy migrations should be repaired");

        assert_columns(
            &pool,
            "strategy_details",
            &["name", "label", "difficulty", "output_value", "image_url"],
        )
        .await;
        assert_columns(&pool, "item_realtime_prices", &["name", "fire_price"]).await;

        let backup_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type='table' AND name LIKE 'strategy_details_legacy_%'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(backup_count, 1);

        let copied: (String, f64) = sqlx::query_as(
            "SELECT name, fire_price FROM item_realtime_prices WHERE item_id = 'item-1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(copied, ("测试物品".to_string(), 12.5));
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
        tracing::info!("[DEBUG] About to spawn items_reload_task");
        std::thread::spawn(move || {
            tracing::info!("[DEBUG] items_reload_task thread spawned");
            match tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            {
                Ok(items_rt) => {
                    items_rt.block_on(async move {
                        tracing::info!(
                            "[DEBUG] items_reload_task runtime started, calling run_items_reload_task"
                        );
                        run_items_reload_task(app, state, items_abort_rx).await;
                        tracing::info!("[DEBUG] items_reload_task returned");
                    });
                }
                Err(e) => {
                    tracing::error!("Failed to create items reload runtime: {}", e);
                }
            }
        });
        tracing::info!("[DEBUG] items_reload_task spawned");
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

    SchedulerHandle {
        fire_scrape_abort: fire_abort_tx,
        items_reload_abort: items_abort_tx,
        hourly_snapshot_abort: snapshot_abort_tx,
        alert_task_abort: alert_abort_tx,
    }
}
