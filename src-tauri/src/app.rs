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

/// Load and parse JSON file, returning items ready for bulk insert.
pub fn load_items_from_json(season_id: &str, market_mode: &str, json_path: &str) -> Result<Vec<Item>, String> {
    let path = std::path::PathBuf::from(json_path);
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
    let season_day = crate::db::repo_items::calculate_season_day();
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
            season_day,
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

    // Load latest fire price from DB on startup (using default context)
    let default_season = config.app.season_id.clone();
    let default_mode = config.scrape.fire_price_mode.clone();
    let fire_price = match repo_fire::get_latest_fire(&pool, &default_season, &default_mode).await {
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
    let default_season = config.app.season_id.clone();
    let default_mode = config.scrape.fire_price_mode.clone();
    let items_count = repo_items::get_items_count(&pool, &default_season, &default_mode).await.unwrap_or(0);
    let json_path = config.scrape.items_json_path.clone();
    let json_exists = std::path::Path::new(&json_path).exists();

    let items_cache: Vec<Item> = if items_count == 0 {
        if json_exists {
            // JSON exists: try API first, fall back to JSON
            match scraper::scrape_items(&default_season, &default_mode).await {
                Ok(items) => {
                    if repo_items::bulk_insert_items(&pool, &default_season, &default_mode, &items).await.is_ok() {
                        tracing::info!("Startup loaded {} items from API", items.len());
                        items
                    } else {
                        tracing::warn!("API items bulk-insert failed, falling back to JSON");
                        load_items_from_json(&default_season, &default_mode, &json_path).unwrap_or_default()
                    }
                }
                Err(e) => {
                    tracing::warn!("API scrape failed, falling back to JSON: {}", e);
                    load_items_from_json(&default_season, &default_mode, &json_path).unwrap_or_default()
                }
            }
        } else {
            // No JSON: try API directly
            match scraper::scrape_items(&default_season, &default_mode).await {
                Ok(items) => {
                    if repo_items::bulk_insert_items(&pool, &default_season, &default_mode, &items).await.is_ok() {
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

    // Ensure split tables exist (idempotent, handles cases where v3 migration
    // was marked as applied but tables weren't actually created)
    ensure_split_tables(pool).await?;

    // Seed seasons data
    seed_seasons(pool).await?;

    tracing::info!("Database migrations complete");
    Ok(())
}

/// Idempotently ensure all season/mode split tables exist.
/// This guards against partial or failed migrations.
async fn ensure_split_tables(pool: &SqlitePool) -> Result<(), String> {
    use crate::db::table_resolver::TableResolver;

    for (season, mode) in TableResolver::supported_combinations() {
        let items_table = TableResolver::items_table(season, mode);
        let fire_table = TableResolver::fire_price_table(season, mode);
        let snapshots_table = TableResolver::item_snapshots_table(season, mode);

        // Items table
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

        // Fire price table
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

        // Item snapshots table
        sqlx::query(&format!(
            "CREATE TABLE IF NOT EXISTS {} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id TEXT NOT NULL,
                fire_price REAL NOT NULL,
                scraped_at INTEGER NOT NULL,
                season_day INTEGER NOT NULL DEFAULT 1,
                UNIQUE(item_id, scraped_at)
            )",
            snapshots_table
        ))
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to ensure snapshots table {}: {}", snapshots_table, e))?;

        tracing::info!(
            "Ensured split tables for {}/{}: {}, {}, {}",
            season, mode, items_table, fire_table, snapshots_table
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
               VALUES (?, ?, ?, ?, ?, ?)"#
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
    
    // Seed test data: generate realistic SS11 and SS12 data for comparison testing
    seed_test_data_for_ss11(pool).await?;
    seed_test_data_for_ss12(pool).await?;
    
    Ok(())
}

/// Generate realistic test data for SS11 season.
/// SS11 season start date: 2026-01-16, end date: 2026-04-16
async fn seed_test_data_for_ss11(pool: &SqlitePool) -> Result<(), String> {
    use crate::db::table_resolver::TableResolver;
    use rand::{Rng, SeedableRng};
    use rand::rngs::StdRng;
    
    tracing::info!("Generating realistic test data for SS11...");
    
    let mut rng = StdRng::seed_from_u64(42); // Fixed seed for reproducibility
    
    // SS11 season: 2026-01-16 to 2026-04-16 (90 days)
    let season_start = chrono::DateTime::parse_from_rfc3339("2026-01-16T00:00:00Z")
        .unwrap()
        .timestamp();
    let season_end = chrono::DateTime::parse_from_rfc3339("2026-04-16T00:00:00Z")
        .unwrap()
        .timestamp();
    
    for mode in ["season_normal", "season_expert"] {
        let ss11_fire = TableResolver::fire_price_table("ss11", mode);
        let ss11_items = TableResolver::items_table("ss11", mode);
        
        // Check if SS11 fire_price table already has data
        let ss11_count: (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {}", ss11_fire))
            .fetch_one(pool)
            .await
            .unwrap_or((0,));
        
        if ss11_count.0 > 0 {
            tracing::info!("SS11 {} fire_price already has {} records, skipping", mode, ss11_count.0);
            continue;
        }
        
        // Generate 90 days of hourly fire price data for SS11
        // SS11 pattern: starts lower, peaks around day 45, then declines
        let base_price = if mode == "season_normal" { 28.0 } else { 32.0 };
        let mut records_inserted = 0;
        let total_days = ((season_end - season_start) / 86400) as i32;
        
        for day in 0..total_days {
            for hour in 0..24 {
                let scraped_at = season_start + (day as i64 * 24 * 3600) + (hour as i64 * 3600);
                let season_day = day + 1;
                
                // Create a realistic price curve for SS11
                // Week 1: rising, Week 2: peak, Week 3-4: declining
                // Ensure day_factor doesn't go below 0.5 to prevent negative prices
                let day_factor = if day < 7 {
                    1.0 + (day as f64 * 0.02) // Rising first week
                } else if day < 14 {
                    1.14 - ((day - 7) as f64 * 0.01) // Peak then slight decline
                } else {
                    (1.07 - ((day - 14) as f64 * 0.008)).max(0.5) // Declining but floor at 0.5
                };
                
                // Add hourly volatility
                let hour_volatility = (hour as f64 - 12.0) / 100.0; // Slight daily pattern
                let random_noise = rng.gen_range(-0.02..0.02);
                
                let rmb_per_10k = (base_price * day_factor * (1.0 + hour_volatility + random_noise)).max(1.0);
                let fire_per_rmb = 10000.0 / rmb_per_10k;
                let increase_ratio = if records_inserted > 0 {
                    Some(random_noise * 100.0)
                } else {
                    None
                };
                
                let sql = format!(
                    "INSERT INTO {} (rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day, created_at) \
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ss11_fire
                );
                
                match sqlx::query(&sql)
                    .bind(rmb_per_10k)
                    .bind(fire_per_rmb)
                    .bind(increase_ratio)
                    .bind(format!("{}", rng.gen_range(1000..10000)))
                    .bind("qiandao_api")
                    .bind(chrono::DateTime::from_timestamp(scraped_at, 0).map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string()))
                    .bind(scraped_at)
                    .bind(season_day)
                    .bind(scraped_at)
                    .execute(pool)
                    .await
                {
                    Ok(_) => records_inserted += 1,
                    Err(e) => tracing::warn!("Failed to insert fire record: {}", e),
                }
            }
        }
        
        tracing::info!("Generated {} fire_price records for SS11 {}", records_inserted, mode);
        
        // Check if SS11 items table already has data
        let ss11_items_count: (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {}", ss11_items))
            .fetch_one(pool)
            .await
            .unwrap_or((0,));
        
        if ss11_items_count.0 > 0 {
            tracing::info!("SS11 {} items already has {} records, skipping", mode, ss11_items_count.0);
            continue;
        }
        
        // Generate sample items for SS11 with different prices than SS12
        let sample_items = vec![
            ("item_001", "传奇武器", "武器", 150.0),
            ("item_002", "史诗护甲", "护甲", 80.0),
            ("item_003", "稀有戒指", "饰品", 45.0),
            ("item_004", "传送卷轴", "消耗品", 5.0),
            ("item_005", "强化石", "材料", 25.0),
            ("item_006", "生命药水", "消耗品", 3.0),
            ("item_007", "魔法剑", "武器", 200.0),
            ("item_008", "守护盾牌", "护甲", 120.0),
        ];
        
        let mut items_inserted = 0;
        let item_timestamp = chrono::Utc::now().timestamp();
        for (item_id, name, item_type, base_price) in sample_items {
            // SS11 prices are generally lower (80-90% of current season)
            let price_factor = rng.gen_range(0.75..0.88);
            let price = base_price * price_factor;
            
            let sql = format!(
                "INSERT OR REPLACE INTO {} (item_id, name, item_type, source, price, last_time, season_day, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                ss11_items
            );
            
            match sqlx::query(&sql)
                .bind(item_id)
                .bind(name)
                .bind(item_type)
                .bind("test_data")
                .bind(price)
                .bind(item_timestamp)
                .bind(45i32) // Mid-season day (day 45 of 90)
                .bind(item_timestamp)
                .execute(pool)
                .await
            {
                Ok(_) => items_inserted += 1,
                Err(e) => tracing::warn!("Failed to insert item: {}", e),
            }
        }
        
        tracing::info!("Generated {} items for SS11 {}", items_inserted, mode);
    }
    
    // Update SS11 season record with correct dates
    let _ = sqlx::query(
        "UPDATE seasons SET started_at = ?, ended_at = ? WHERE id = 'ss11'"
    )
    .bind(season_start)
    .bind(season_end)
    .execute(pool)
    .await;
    
    tracing::info!("SS11 test data generation complete");
    Ok(())
}

/// Generate realistic test data for SS12 season.
/// SS12 season start date: 2026-04-17
async fn seed_test_data_for_ss12(pool: &SqlitePool) -> Result<(), String> {
    use crate::db::table_resolver::TableResolver;
    use rand::{Rng, SeedableRng};
    use rand::rngs::StdRng;
    
    tracing::info!("Generating realistic test data for SS12...");
    
    let mut rng = StdRng::seed_from_u64(123); // Different seed from SS11
    let now = chrono::Utc::now().timestamp();
    
    // SS12 season start date: 2026-04-17
    let season_start = chrono::DateTime::parse_from_rfc3339("2026-04-17T00:00:00Z")
        .unwrap()
        .timestamp();
    
    // Calculate how many days have passed since season start
    let days_since_start = ((now - season_start) / 86400).max(1).min(30) as i32;
    
    for mode in ["season_normal", "season_expert"] {
        let ss12_fire = TableResolver::fire_price_table("ss12", mode);
        let ss12_items = TableResolver::items_table("ss12", mode);
        
        // Check if SS12 fire_price table already has data
        let ss12_count: (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {}", ss12_fire))
            .fetch_one(pool)
            .await
            .unwrap_or((0,));
        
        if ss12_count.0 > 0 {
            tracing::info!("SS12 {} fire_price already has {} records, skipping", mode, ss12_count.0);
            continue;
        }
        
        // Generate fire price data from season start to now
        // SS12 pattern: starts high, dips around day 10, then recovers
        let base_price = if mode == "season_normal" { 35.0 } else { 38.0 };
        let mut records_inserted = 0;
        
        for day in 0..days_since_start {
            for hour in 0..24 {
                let scraped_at = season_start + (day as i64 * 24 * 3600) + (hour as i64 * 3600);
                let season_day = day + 1;
                
                // Create a realistic price curve for SS12
                // Week 1: high, Week 2: dip, Week 3-4: recovery
                let day_factor = if day < 7 {
                    1.0 - (day as f64 * 0.01) // Slight decline first week
                } else if day < 14 {
                    0.93 + ((day - 7) as f64 * 0.005) // Dip then recovery
                } else {
                    0.965 + ((day - 14) as f64 * 0.008) // Recovery continues
                };
                
                // Add hourly volatility
                let hour_volatility = (hour as f64 - 12.0) / 80.0; // More volatile than SS11
                let random_noise = rng.gen_range(-0.025..0.025);
                
                let rmb_per_10k = base_price * day_factor * (1.0 + hour_volatility + random_noise);
                let fire_per_rmb = 10000.0 / rmb_per_10k;
                let increase_ratio = if records_inserted > 0 {
                    Some(random_noise * 100.0)
                } else {
                    None
                };
                
                let sql = format!(
                    "INSERT INTO {} (rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, season_day, created_at) \
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ss12_fire
                );
                
                match sqlx::query(&sql)
                    .bind(rmb_per_10k)
                    .bind(fire_per_rmb)
                    .bind(increase_ratio)
                    .bind(format!("{}", rng.gen_range(2000..15000)))
                    .bind("qiandao_api")
                    .bind(chrono::DateTime::from_timestamp(scraped_at, 0).map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string()))
                    .bind(scraped_at)
                    .bind(season_day)
                    .bind(scraped_at)
                    .execute(pool)
                    .await
                {
                    Ok(_) => records_inserted += 1,
                    Err(e) => tracing::warn!("Failed to insert fire record: {}", e),
                }
            }
        }
        
        tracing::info!("Generated {} fire_price records for SS12 {}", records_inserted, mode);
        
        // Check if SS12 items table already has data
        let ss12_items_count: (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {}", ss12_items))
            .fetch_one(pool)
            .await
            .unwrap_or((0,));
        
        if ss12_items_count.0 > 0 {
            tracing::info!("SS12 {} items already has {} records, skipping", mode, ss12_items_count.0);
            continue;
        }
        
        // Generate sample items for SS12 with current season prices
        let sample_items = vec![
            ("item_001", "传奇武器", "武器", 180.0),
            ("item_002", "史诗护甲", "护甲", 95.0),
            ("item_003", "稀有戒指", "饰品", 55.0),
            ("item_004", "传送卷轴", "消耗品", 6.0),
            ("item_005", "强化石", "材料", 30.0),
            ("item_006", "生命药水", "消耗品", 4.0),
            ("item_007", "魔法剑", "武器", 240.0),
            ("item_008", "守护盾牌", "护甲", 140.0),
        ];
        
        let mut items_inserted = 0;
        for (item_id, name, item_type, base_price) in sample_items {
            // SS12 prices are current season prices
            let price_factor = rng.gen_range(0.95..1.05);
            let price = base_price * price_factor;
            
            let sql = format!(
                "INSERT OR REPLACE INTO {} (item_id, name, item_type, source, price, last_time, season_day, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                ss12_items
            );
            
            match sqlx::query(&sql)
                .bind(item_id)
                .bind(name)
                .bind(item_type)
                .bind("test_data")
                .bind(price)
                .bind(now)
                .bind(days_since_start) // Current season day
                .bind(now)
                .execute(pool)
                .await
            {
                Ok(_) => items_inserted += 1,
                Err(e) => tracing::warn!("Failed to insert item: {}", e),
            }
        }
        
        tracing::info!("Generated {} items for SS12 {}", items_inserted, mode);
    }
    
    // Update SS12 season record with correct start date
    let _ = sqlx::query(
        "UPDATE seasons SET started_at = ? WHERE id = 'ss12'"
    )
    .bind(season_start)
    .execute(pool)
    .await;
    
    tracing::info!("SS12 test data generation complete");
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
