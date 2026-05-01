use crate::core::paths;
use crate::core::state::{AppConfig, AppState, MarketContext, MarketMode, TaskStatus, FirePriceSnapshot};
use crate::db::models::Item;
use crate::db::repo_fire;
use crate::db::repo_items;
use crate::scraper;
use crate::scheduler::SchedulerHandle;
use crate::scheduler::fire_task::run_fire_scrape_task;
use crate::scheduler::history_task::run_hourly_snapshot_task;
use crate::scheduler::items_task::run_items_reload_task;
use crate::scheduler::alert_task::run_price_alert_task;
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

/// Load and parse full_table.json, returning items ready for bulk insert.
pub fn load_items_from_json(season_id: &str, market_mode: &str) -> Result<Vec<Item>, String> {
    let path = full_table_json_path();
    tracing::info!("load_items_from_json: reading from {:?}", path);
    
    let content = std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    tracing::info!("load_items_from_json: JSON file size = {} bytes", content.len());
    
    let map: std::collections::HashMap<String, JsonItemEntry> =
        serde_json::from_str(&content).map_err(|e| format!("JSON parse error: {}", e))?;
    
    tracing::info!("load_items_from_json: parsed {} entries from JSON", map.len());
    
    if map.is_empty() {
        tracing::warn!("load_items_from_json: JSON file is empty or has no valid entries!");
        return Ok(Vec::new());
    }
    
    let sample_keys: Vec<String> = map.keys().take(3).cloned().collect();
    tracing::info!("load_items_from_json: sample keys = {:?}", sample_keys);
    
    let sample_entry = map.values().next();
    if let Some(entry) = sample_entry {
        tracing::info!("load_items_from_json: first entry = id={}, name={}, price={}", 
            entry.id, entry.name, entry.price);
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
    
    tracing::info!("load_items_from_json: converted {} entries to Item struct", items.len());
    if !items.is_empty() {
        tracing::info!("load_items_from_json: first item = {:?}, last item = {:?}", 
            (&items[0].item_id, &items[0].name, &items[0].price),
            (&items[items.len()-1].item_id, &items[items.len()-1].name, &items[items.len()-1].price));
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
        .max_connections(1)
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                sqlx::query("PRAGMA foreign_keys = ON").execute(conn).await?;
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

    // Load latest fire price from DB on startup
    let fire_price = match repo_fire::get_latest_fire(&pool).await {
        Ok(Some(record)) => {
            let snapshot = FirePriceSnapshot {
                price_per_wan: if record.fire_per_rmb > 0.0 { 10000.0 / record.fire_per_rmb } else { 0.0 },
                rmb_per_10k_fire: record.rmb_per_10k_fire,
                fire_per_rmb: record.fire_per_rmb,
                increase_ratio: record.increase_ratio,
                trading_volume: record.trading_volume,
                source: record.source,
                source_time: record.source_time,
                scraped_at: record.scraped_at,
            };
            Some(snapshot)
        }
        _ => {
            // No DB record — try scraping immediately (Node.js HTTP/2 fallback)
            match crate::scraper::scrape_fire_price().await {
                Ok(snapshot) => {
                    let ctx = MarketContext {
                        season_id: "ss12".to_string(),
                        market_mode: MarketMode::SeasonNormal,
                    };
                    let _ = repo_fire::insert_fire_record(
                        &pool,
                        &ctx.season_id,
                        ctx.market_mode.as_str(),
                        &snapshot,
                    ).await;
                    Some(snapshot)
                }
                Err(e) => {
                    tracing::warn!("Startup fire scrape failed: {}", e);
                    None
                }
            }
        }
    };

    // Auto-import items: prefer API scrape, fall back to JSON file
    let items_count = repo_items::get_items_count(&pool).await.unwrap_or(0);
    let json_path = full_table_json_path();
    let json_exists = json_path.exists();

    let items_cache: Vec<Item> = if items_count == 0 {
        if json_exists {
            // JSON exists: try API first, fall back to JSON
            match scraper::scrape_items(&config.app.season_id, "season_normal").await {
                Ok(items) => {
                    if repo_items::bulk_insert_items(&pool, &items).await.is_ok() {
                        tracing::info!("Startup loaded {} items from API", items.len());
                        items
                    } else {
                        tracing::warn!("API items bulk-insert failed, falling back to JSON");
                        load_items_from_json(&config.app.season_id, "season_normal").unwrap_or_default()
                    }
                }
                Err(e) => {
                    tracing::warn!("API scrape failed, falling back to JSON: {}", e);
                    load_items_from_json(&config.app.season_id, "season_normal").unwrap_or_default()
                }
            }
        } else {
            // No JSON: try API directly
            match scraper::scrape_items(&config.app.season_id, "season_normal").await {
                Ok(items) => {
                    if repo_items::bulk_insert_items(&pool, &items).await.is_ok() {
                        tracing::info!("Startup loaded {} items from API", items.len());
                    }
                    items
                }
                Err(e) => {
                    tracing::warn!("Startup API scrape failed: {}", e);
                    Vec::new()
                }
            }
        }
    } else {
        tracing::info!("Items table already has {} records, skipping startup load", items_count);
        Vec::new()
    };

    let state = AppState {
        db: pool,
        config: RwLock::new(config.clone()),
        fire_price: RwLock::new(fire_price),
        items_cache: RwLock::new(items_cache),
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
    };

    Ok(state)
}

async fn run_migrations(pool: &SqlitePool) -> Result<(), String> {
    // Create migration tracking table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
        )"
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create _migrations: {}", e))?;

    // Get current schema version
    let current_version: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(version), 0) FROM _migrations"
    )
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

    tracing::info!("Database migrations complete");
    Ok(())
}

pub fn start_background_tasks(rt: tokio::runtime::Handle, app: tauri::AppHandle, state: Arc<AppState>) -> SchedulerHandle {
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

    SchedulerHandle {
        fire_scrape_abort: fire_abort_tx,
        items_reload_abort: items_abort_tx,
        hourly_snapshot_abort: snapshot_abort_tx,
        alert_task_abort: alert_abort_tx,
    }
}
