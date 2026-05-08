use crate::core::state::{AppState, SeasonApiConfig};
use crate::db::table_resolver::TableResolver;
use sqlx::{Row, SqlitePool};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ArchiveResult {
    pub success: bool,
    pub season_id: String,
    pub message: String,
    pub items_archived: i64,
    pub fire_records_archived: i64,
    pub snapshot_records_archived: i64,
    pub archive_path: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct NewSeasonResult {
    pub success: bool,
    pub season_id: String,
    pub message: String,
    pub tables_created: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SeasonInfo {
    pub season_id: String,
    pub name: String,
    pub is_current: bool,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub item_count: i64,
    pub fire_record_count: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SeasonApiConfigResponse {
    pub season_id: String,
    pub qiandao_tag_id_normal: String,
    pub qiandao_spec_id_normal: String,
    pub qiandao_tag_id_expert: String,
    pub qiandao_spec_id_expert: String,
    pub luosi_season_id_normal: i32,
    pub luosi_season_id_expert: i32,
}

/// Archive a season's snapshot data to a backup SQLite file.
/// Only archives snapshot tables (hourly data), not real-time tables.
/// Real-time tables (items_*, fire_price_*) are not archived as they only contain current season data.
#[tauri::command]
pub async fn archive_season(
    state: State<'_, Arc<AppState>>,
    season_id: String,
    archive_name: Option<String>,
) -> Result<ArchiveResult, String> {
    let archive_file_name = archive_name.unwrap_or_else(|| format!("{}_archive.db", season_id));
    let archive_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("com.tlmonitor.app")
        .join("archives");

    std::fs::create_dir_all(&archive_dir)
        .map_err(|e| format!("Failed to create archive dir: {}", e))?;

    let archive_path = archive_dir.join(&archive_file_name);
    let archive_url = format!("sqlite:{}?mode=rwc", archive_path.display());

    // Create archive database connection
    let archive_pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&archive_url)
        .await
        .map_err(|e| format!("Failed to create archive DB: {}", e))?;

    let mut total_snapshots = 0i64;
    let mut total_fire_snapshots = 0i64;

    // Archive only snapshot tables (item_snapshots and fire_price_snapshots)
    for mode in ["season_normal", "season_expert"] {
        let item_snapshots_table = TableResolver::item_snapshots_table(&season_id, mode);
        let fire_snapshots_table = TableResolver::fire_price_snapshots_table(&season_id, mode);

        // Check if item snapshot table exists
        let snapshots_exists: bool = sqlx::query_scalar(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name=?",
        )
        .bind(&item_snapshots_table)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);

        if !snapshots_exists {
            tracing::warn!(
                "Snapshot table {} does not exist, skipping",
                item_snapshots_table
            );
            continue;
        }

        // Create snapshot tables in archive DB
        create_archive_snapshots_table(&archive_pool, &item_snapshots_table).await?;
        create_archive_fire_snapshots_table(&archive_pool, &fire_snapshots_table).await?;

        // Copy item snapshots data
        let snapshots_copied: i64 = copy_table_data(
            &state.db,
            &archive_pool,
            &item_snapshots_table,
            &item_snapshots_table,
        )
        .await
        .map_err(|e| format!("Failed to copy item snapshots: {}", e))?;
        total_snapshots += snapshots_copied;

        // Copy fire price snapshots data
        let fire_snapshots_copied: i64 = copy_table_data(
            &state.db,
            &archive_pool,
            &fire_snapshots_table,
            &fire_snapshots_table,
        )
        .await
        .map_err(|e| format!("Failed to copy fire price snapshots: {}", e))?;
        total_fire_snapshots += fire_snapshots_copied;
    }

    archive_pool.close().await;

    // Update season record to mark as ended
    let now = chrono::Utc::now().timestamp();
    let _ = sqlx::query("UPDATE seasons SET is_current = 0, ended_at = ? WHERE id = ?")
        .bind(now)
        .bind(&season_id)
        .execute(&state.db)
        .await;

    Ok(ArchiveResult {
        success: true,
        season_id,
        message: "赛季快照数据归档完成".to_string(),
        items_archived: 0,        // Real-time tables are not archived
        fire_records_archived: 0, // Real-time tables are not archived
        snapshot_records_archived: total_snapshots + total_fire_snapshots,
        archive_path: Some(archive_path.to_string_lossy().to_string()),
    })
}

/// Initialize tables for a new season.
/// Creates empty split tables for the given season_id.
/// Requires current season to be archived first.
#[tauri::command]
pub async fn init_new_season(
    state: State<'_, Arc<AppState>>,
    season_id: String,
    season_name: Option<String>,
    started_at: Option<i64>,
) -> Result<NewSeasonResult, String> {
    let started_at = started_at.unwrap_or_else(|| chrono::Utc::now().timestamp());
    // Check if current season exists and is not archived
    let current_season: Option<(String, i32)> =
        sqlx::query_as("SELECT id, is_current FROM seasons WHERE is_current = 1 LIMIT 1")
            .fetch_optional(&state.db)
            .await
            .map_err(|e| format!("Failed to check current season: {}", e))?;

    if let Some((id, is_current)) = current_season {
        if is_current == 1 {
            return Err(format!("请先归档当前赛季 '{}' 后再初始化新赛季", id));
        }
    }

    let mut created_tables = Vec::new();

    for mode in ["season_normal", "season_expert"] {
        // Only create snapshot tables for the new season
        // Real-time tables (items_*, fire_price_*) are shared and already exist
        let snapshots_table = TableResolver::item_snapshots_table(&season_id, mode);
        let fire_snapshots_table = TableResolver::fire_price_snapshots_table(&season_id, mode);

        // Create item snapshots table for historical data
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
        .execute(&state.db)
        .await
        .map_err(|e| format!("Failed to create snapshots table: {}", e))?;
        created_tables.push(snapshots_table.clone());

        // Create fire price snapshots table for historical data
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
        .execute(&state.db)
        .await
        .map_err(|e| format!("Failed to create fire_price snapshots table: {}", e))?;
        created_tables.push(fire_snapshots_table.clone());

        // Create indexes
        let idx_snap = format!("idx_{}_snapshots_item", snapshots_table);
        let idx_fire_snap = format!("idx_{}_scraped", fire_snapshots_table);

        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS {} ON {}(item_id, scraped_at)",
            idx_snap, snapshots_table
        ))
        .execute(&state.db)
        .await
        .ok();

        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS {} ON {}(scraped_at)",
            idx_fire_snap, fire_snapshots_table
        ))
        .execute(&state.db)
        .await
        .ok();
    }

    // Insert season record
    let now = chrono::Utc::now().timestamp();
    let name = season_name.unwrap_or_else(|| format!("{} 赛季", season_id.to_uppercase()));

    sqlx::query(
        "INSERT OR REPLACE INTO seasons (id, name, code, is_current, started_at, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, ?)"
    )
    .bind(&season_id)
    .bind(&name)
    .bind(&season_id)
    .bind(started_at)
    .bind(now)
    .bind(now)
    .execute(&state.db)
    .await
    .map_err(|e| format!("Failed to insert season record: {}", e))?;

    // Update active context to new season
    {
        let mut ctx = state.active_context.write();
        ctx.season_id = season_id.clone();
    }

    // Update config
    if let Ok(mut cfg) = crate::core::config::load_config() {
        cfg.app.season_id = season_id.clone();
        let _ = crate::core::config::save_config(&cfg);
    }

    // Insert default API config for new season (can be updated later)
    let default_config = SeasonApiConfig::default();
    crate::db::repo_season_api::set_season_api_config(&state.db, &season_id, &default_config)
        .await
        .map_err(|e| format!("Failed to save API config: {}", e))?;

    Ok(NewSeasonResult {
        success: true,
        season_id,
        message: "新赛季初始化完成".to_string(),
        tables_created: created_tables,
    })
}

/// Get API config for a season.
#[tauri::command]
pub async fn get_season_api_config_cmd(
    state: State<'_, Arc<AppState>>,
    season_id: String,
) -> Result<SeasonApiConfigResponse, String> {
    let config = crate::db::repo_season_api::get_season_api_config(&state.db, &season_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(SeasonApiConfigResponse {
        season_id,
        qiandao_tag_id_normal: config.qiandao_tag_id_normal,
        qiandao_spec_id_normal: config.qiandao_spec_id_normal,
        qiandao_tag_id_expert: config.qiandao_tag_id_expert,
        qiandao_spec_id_expert: config.qiandao_spec_id_expert,
        luosi_season_id_normal: config.luosi_season_id_normal,
        luosi_season_id_expert: config.luosi_season_id_expert,
    })
}

/// Set API config for a season.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn set_season_api_config_cmd(
    state: State<'_, Arc<AppState>>,
    season_id: String,
    qiandao_tag_id_normal: String,
    qiandao_spec_id_normal: String,
    qiandao_tag_id_expert: String,
    qiandao_spec_id_expert: String,
    luosi_season_id_normal: i32,
    luosi_season_id_expert: i32,
) -> Result<crate::commands::types::OkResponse, String> {
    let config = SeasonApiConfig {
        qiandao_tag_id_normal,
        qiandao_spec_id_normal,
        qiandao_tag_id_expert,
        qiandao_spec_id_expert,
        luosi_season_id_normal,
        luosi_season_id_expert,
    };

    crate::db::repo_season_api::set_season_api_config(&state.db, &season_id, &config)
        .await
        .map_err(|e| e.to_string())?;

    Ok(crate::commands::types::OkResponse::success("API配置已保存"))
}

/// List all seasons with basic stats.
#[tauri::command]
pub async fn list_seasons(state: State<'_, Arc<AppState>>) -> Result<Vec<SeasonInfo>, String> {
    #[allow(clippy::type_complexity)]
    let rows: Vec<(String, String, i32, Option<i64>, Option<i64>)> = sqlx::query_as(
        "SELECT id, name, is_current, started_at, ended_at FROM seasons ORDER BY started_at DESC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let mut seasons = Vec::new();
    for (id, name, is_current, started_at, ended_at) in rows {
        let is_current_season = is_current == 1;
        let item_table_normal;
        let item_table_expert;
        let fire_table_normal;
        let fire_table_expert;

        if is_current_season {
            item_table_normal = TableResolver::items_table(&id, "season_normal");
            item_table_expert = TableResolver::items_table(&id, "season_expert");
            fire_table_normal = TableResolver::fire_price_table(&id, "season_normal");
            fire_table_expert = TableResolver::fire_price_table(&id, "season_expert");
        } else {
            item_table_normal = TableResolver::item_snapshots_table(&id, "season_normal");
            item_table_expert = TableResolver::item_snapshots_table(&id, "season_expert");
            fire_table_normal = TableResolver::fire_price_snapshots_table(&id, "season_normal");
            fire_table_expert = TableResolver::fire_price_snapshots_table(&id, "season_expert");
        }

        let mut item_count = 0i64;
        for table in [&item_table_normal, &item_table_expert] {
            let count: (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {}", table))
                .fetch_one(&state.db)
                .await
                .unwrap_or((0,));
            item_count += count.0;
        }

        let mut fire_count = 0i64;
        for table in [&fire_table_normal, &fire_table_expert] {
            let count: (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {}", table))
                .fetch_one(&state.db)
                .await
                .unwrap_or((0,));
            fire_count += count.0;
        }

        seasons.push(SeasonInfo {
            season_id: id,
            name,
            is_current: is_current_season,
            started_at,
            ended_at,
            item_count,
            fire_record_count: fire_count,
        });
    }

    Ok(seasons)
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async fn create_archive_snapshots_table(pool: &SqlitePool, table: &str) -> Result<(), String> {
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
        table
    ))
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn create_archive_fire_snapshots_table(pool: &SqlitePool, table: &str) -> Result<(), String> {
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
        table
    ))
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn copy_table_data(
    source: &SqlitePool,
    target: &SqlitePool,
    source_table: &str,
    target_table: &str,
) -> Result<i64, sqlx::Error> {
    // Get column names from source table
    let columns: Vec<(String,)> = sqlx::query_as("SELECT name FROM pragma_table_info(?)")
        .bind(source_table)
        .fetch_all(source)
        .await?;

    if columns.is_empty() {
        return Ok(0);
    }

    let col_names: Vec<String> = columns.into_iter().map(|(c,)| c).collect();
    let col_list = col_names.join(", ");
    let placeholders = col_names.iter().map(|_| "?").collect::<Vec<_>>().join(", ");

    // Fetch all data from source
    let data: Vec<sqlx::sqlite::SqliteRow> =
        sqlx::query(&format!("SELECT {} FROM {}", col_list, source_table))
            .fetch_all(source)
            .await?;

    let mut inserted = 0i64;

    for row in data {
        let sql = format!(
            "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
            target_table, col_list, placeholders
        );
        let mut query = sqlx::query(&sql);

        for (i, _col) in col_names.iter().enumerate() {
            // Try different types
            if let Ok(v) = row.try_get::<i64, _>(i) {
                query = query.bind(v);
            } else if let Ok(v) = row.try_get::<f64, _>(i) {
                query = query.bind(v);
            } else if let Ok(v) = row.try_get::<String, _>(i) {
                query = query.bind(v);
            } else if let Ok(v) = row.try_get::<Option<i64>, _>(i) {
                query = query.bind(v);
            } else if let Ok(v) = row.try_get::<Option<f64>, _>(i) {
                query = query.bind(v);
            } else if let Ok(v) = row.try_get::<Option<String>, _>(i) {
                query = query.bind(v);
            } else {
                query = query.bind::<Option<String>>(None);
            }
        }

        query.execute(target).await?;
        inserted += 1;
    }

    Ok(inserted)
}
