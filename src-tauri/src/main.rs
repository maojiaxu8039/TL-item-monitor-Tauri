// TL Monitor - Tauri 2.0 Desktop App
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Local;
use flate2::read::GzDecoder;
use log::{error, info, warn};
use parking_lot::RwLock;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Manager, State, WindowEvent,
};

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirePriceRecord {
    pub id: Option<i64>,
    pub item_name: String,
    pub price: i32,
    pub unit: String,
    pub timestamp: String,
    pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemData {
    pub id: Option<i64>,
    pub name: String,
    pub category: String,
    pub rarity: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Section {
    pub id: String,
    pub name: String,
    pub items: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub port: u16,
    pub access_code: String,
    pub fire_price_scrape_interval: u64,
    pub items_reload_interval: u64,
    pub mode: String,
    #[serde(default)]
    pub sections: Vec<Section>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            port: 19878,
            access_code: "tlifire2026".to_string(),
            fire_price_scrape_interval: 300,
            items_reload_interval: 300,
            mode: "赛季普通".to_string(),
            sections: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbStats {
    pub items_count: i64,
    pub fire_price_count: i64,
    pub last_fire_scrape: Option<String>,
    pub last_items_reload: Option<String>,
    pub db_size_kb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirePriceResponse {
    pub success: bool,
    pub data: Option<Vec<FirePriceRecord>>,
    pub error: Option<String>,
    pub source: String,
}

#[derive(serde::Serialize)]
struct FirePriceUI {
    price_per_wan: f64,
    record_time: String,
    source: String,
}

// ============================================================================
// App State
// ============================================================================

pub struct AppState {
    pub fire_price: RwLock<Option<FirePriceResponse>>,
    pub fire_price_record: RwLock<Option<FirePriceRecord>>,
    pub items_data: RwLock<Vec<ItemData>>,
    pub sections: RwLock<Vec<Section>>,
    pub config: RwLock<AppConfig>,
    pub db_path: PathBuf,
}

// ============================================================================
// Database Helpers
// ============================================================================

fn init_database(db_path: &PathBuf) -> Result<Connection, String> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create data dir: {}", e))?;
    }

    let conn = Connection::open(db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL DEFAULT '',
            rarity TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS fire_price_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_name TEXT NOT NULL,
            price INTEGER NOT NULL,
            unit TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT '',
            timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS fire_price_record (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_name TEXT NOT NULL UNIQUE,
            price INTEGER NOT NULL,
            unit TEXT NOT NULL DEFAULT '',
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            category TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_fire_price_log_timestamp ON fire_price_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_fire_price_log_item_name ON fire_price_log(item_name);
        ",
    )
    .map_err(|e| format!("Failed to init database schema: {}", e))?;

    info!("Database initialized at {:?}", db_path);
    Ok(conn)
}

fn get_db_connection(db_path: &PathBuf) -> Result<Connection, String> {
    Connection::open(db_path).map_err(|e| format!("Failed to open database: {}", e))
}

// ============================================================================
// Fire Price Scraping
// ============================================================================

fn decode_gzip(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = GzDecoder::new(data);
    let mut decoded = Vec::new();
    decoder
        .read_to_end(&mut decoded)
        .map_err(|e| format!("Failed to decompress gzip: {}", e))?;
    Ok(decoded)
}

fn parse_fire_price_data(data: &serde_json::Value) -> Vec<FirePriceRecord> {
    let mut records = Vec::new();

    if let Some(arr) = data.as_array() {
        for item in arr {
            if let Some(record) = parse_single_record(item) {
                records.push(record);
            }
        }
    } else if let Some(obj) = data.as_object() {
        for key in &["data", "list", "items", "result"] {
            let k = *key;
            if let Some(arr) = obj.get(k).and_then(|v| v.as_array()) {
                for item in arr {
                    if let Some(record) = parse_single_record(item) {
                        records.push(record);
                    }
                }
                if !records.is_empty() {
                    break;
                }
            }
        }
    }

    records
}

fn parse_single_record(item: &serde_json::Value) -> Option<FirePriceRecord> {
    let obj = item.as_object()?;
    let item_name = obj
        .get("name")
        .or_else(|| obj.get("item_name"))
        .or_else(|| obj.get("n"))
        .and_then(|v| v.as_str())?
        .to_string();

    let price = obj
        .get("price")
        .or_else(|| obj.get("p"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;

    let unit = obj
        .get("unit")
        .or_else(|| obj.get("u"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let timestamp = obj
        .get("timestamp")
        .or_else(|| obj.get("time"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let category = obj
        .get("category")
        .or_else(|| obj.get("c"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Some(FirePriceRecord {
        id: None,
        item_name,
        price,
        unit,
        timestamp,
        category,
    })
}

async fn scrape_fire_price_async() -> Result<FirePriceResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .gzip(true)
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;

    let url = "http://115.231.176.101:8080/get?season_id=1401";
    info!("Fetching fire price from: {}", url);

    let response = client
        .get(url)
        .header("Accept-Encoding", "gzip")
        .header("User-Agent", "TL-Monitor/1.0")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Read error: {}", e))?;

    let decoded = match decode_gzip(&bytes) {
        Ok(d) => d,
        Err(_) => bytes.to_vec(),
    };

    let text = String::from_utf8(decoded.clone())
        .or_else(|_| Ok::<_, std::string::String>(String::from_utf8_lossy(&decoded).into_owned()))
        .map_err(|e| format!("Invalid UTF-8: {}", e))?;

    info!(
        "API response ({} bytes): {}",
        text.len(),
        &text[..text.len().min(500)]
    );

    let data: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("JSON parse error: {} | text: {}", e, &text[..text.len().min(200)]))?;

    let records = parse_fire_price_data(&data);

    Ok(FirePriceResponse {
        success: true,
        data: Some(records),
        error: None,
        source: "api".to_string(),
    })
}

fn scrape_fire_price_blocking() -> FirePriceResponse {
    // 优先使用 Node.js 直连千岛 API（速度快，成功率高）
    let script_path = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join("qiandao_fire.js")))
        .unwrap_or_else(|| std::path::PathBuf::from("qiandao_fire.js"));

    let mode_arg = "普通"; // TODO: 从配置读取
    if let Ok(output) = std::process::Command::new("node")
        .arg(&script_path)
        .arg(mode_arg)
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&stdout) {
                let ten_k = data.get("ten_k").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let fire_per_rmb = data.get("fire_per_rmb").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let record = FirePriceRecord {
                    id: None,
                    item_name: "火价".to_string(),
                    price: (ten_k * 10000.0) as i32,
                    unit: "元/万火".to_string(),
                    timestamp: data.get("ts").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    category: "fire_price".to_string(),
                };
                info!("Fire price via Node.js: {} 元/万火", ten_k);
                return FirePriceResponse {
                    success: true,
                    data: Some(vec![record]),
                    error: None,
                    source: "千岛-Node.js".to_string(),
                };
            }
        }
        warn!("Node.js scraper failed, falling back to HTTP: {}", String::from_utf8_lossy(&output.stderr));
    } else {
        warn!("Failed to execute node script, falling back to HTTP");
    }

    // HTTP fallback
    let rt = tokio::runtime::Runtime::new().expect("Failed to create runtime");
    match rt.block_on(scrape_fire_price_async()) {
        Ok(r) => r,
        Err(e) => {
            warn!("API scrape failed: {}", e);
            FirePriceResponse {
                success: false,
                data: None,
                error: Some(e),
                source: "api".to_string(),
            }
        }
    }
}

fn log_fire_price_to_db(db_path: &PathBuf, records: &[FirePriceRecord]) -> Result<(), String> {
    let conn = get_db_connection(db_path)?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let tx = conn.unchecked_transaction().map_err(|e| format!("Transaction error: {}", e))?;

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO fire_price_log (item_name, price, unit, category, timestamp)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .map_err(|e| format!("Prepare error: {}", e))?;

        for record in records {
            stmt.execute(params![
                record.item_name,
                record.price,
                record.unit,
                record.category,
                now.clone(),
            ])
            .map_err(|e| format!("Insert error: {}", e))?;
        }
    }
    tx.commit().map_err(|e| format!("Commit error: {}", e))?;

    Ok(())
}

fn update_fire_price_record(db_path: &PathBuf, records: &[FirePriceRecord]) -> Result<(), String> {
    let conn = get_db_connection(db_path)?;

    let tx = conn.unchecked_transaction().map_err(|e| format!("Transaction error: {}", e))?;

    {
        let mut stmt = tx
            .prepare(
                "INSERT OR REPLACE INTO fire_price_record (item_name, price, unit, category, timestamp)
                 VALUES (?1, ?2, ?3, ?4, datetime('now'))",
            )
            .map_err(|e| format!("Prepare error: {}", e))?;

        for record in records {
            stmt.execute(params![
                record.item_name,
                record.price,
                record.unit,
                record.category,
            ])
            .map_err(|e| format!("Upsert error: {}", e))?;
        }
    }
    tx.commit().map_err(|e| format!("Commit error: {}", e))?;

    Ok(())
}

fn reload_items_data(db_path: &PathBuf) -> Result<Vec<ItemData>, String> {
    let conn = get_db_connection(db_path)?;

    let items: Vec<ItemData> = {
        let mut stmt = conn
            .prepare("SELECT id, name, category, rarity, updated_at FROM items ORDER BY name")
            .map_err(|e| format!("Prepare error: {}", e))?;

        let rows = stmt.query_map([], |row| {
            Ok(ItemData {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                category: row.get(2)?,
                rarity: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    Ok(items)
}

fn save_sections_to_file(app: &AppHandle, sections: &[Section]) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data directory");
    let sections_path = app_data_dir.join("sections.json");

    let json =
        serde_json::to_string_pretty(sections).map_err(|e| format!("Serialize error: {}", e))?;

    fs::write(&sections_path, json).map_err(|e| format!("Write error: {}", e))?;

    info!("Sections saved to {:?}", sections_path);
    Ok(())
}

fn load_sections_from_file(app: &AppHandle) -> Vec<Section> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data directory");
    let sections_path = app_data_dir.join("sections.json");

    if !sections_path.exists() {
        info!("No sections.json found, returning empty");
        return Vec::new();
    }

    match fs::read_to_string(&sections_path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|e| {
            warn!("Failed to parse sections.json: {}", e);
            Vec::new()
        }),
        Err(e) => {
            warn!("Failed to read sections.json: {}", e);
            Vec::new()
        }
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
fn get_fire_price(state: State<'_, Arc<AppState>>) -> Result<FirePriceUI, String> {
    let guard = state.fire_price.read();
    if let Some(ref fp) = *guard {
        // Extract price_per_wan from the first record in data
        let price_per_wan = if let Some(ref records) = fp.data {
            if let Some(first) = records.first() {
                (first.price as f64) / 10000.0
            } else {
                0.0
            }
        } else {
            0.0
        };
        let record_time = fp.data.as_ref().and_then(|r| r.first()).map(|rec| rec.timestamp.clone()).unwrap_or_default();
        Ok(FirePriceUI {
            price_per_wan,
            record_time,
            source: fp.source.clone(),
        })
    } else {
        Err("No fire price data yet".to_string())
    }
}

#[derive(serde::Serialize)]
struct ItemsResponse { items: Vec<ItemData> }

#[tauri::command]
fn get_items(state: State<'_, Arc<AppState>>) -> Result<ItemsResponse, String> {
    let guard = state.items_data.read();
    Ok(ItemsResponse { items: guard.clone() })
}

#[derive(serde::Serialize)]
struct ConfigResponse { input: AppConfig }

#[tauri::command]
fn get_config(state: State<'_, Arc<AppState>>) -> Result<ConfigResponse, String> {
    let guard = state.config.read();
    Ok(ConfigResponse { input: guard.clone() })
}

#[derive(serde::Deserialize)]
struct SetConfigInput { input: AppConfig }

#[tauri::command]
fn set_config(state: State<'_, Arc<AppState>>, input: SetConfigInput) -> Result<(), String> {
    let config = input.input;
    let mut guard = state.config.write();
    *guard = config.clone();
    drop(guard);

    let conn = get_db_connection(&state.db_path)?;
    let json = serde_json::to_string(&config).map_err(|e| format!("Serialize error: {}", e))?;
    conn.execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES ('app_config', ?1)",
        params![json],
    )
    .map_err(|e| format!("Save config error: {}", e))?;

    info!("Config updated");
    Ok(())
}

#[tauri::command]
fn trigger_items_reload(state: State<'_, Arc<AppState>>) -> Result<OkResponse, String> {
    info!("Manual items reload triggered");
    let items = reload_items_data(&state.db_path)?;
    {
        let mut guard = state.items_data.write();
        *guard = items;
    }
    Ok(OkResponse { ok: true, message: format!("Reloaded {} items", state.items_data.read().len()) })
}

#[derive(serde::Serialize)]
struct OkResponse { ok: bool, message: String }

#[tauri::command]
fn trigger_scrape_fire(state: State<'_, Arc<AppState>>) -> Result<OkResponse, String> {
    info!("Manual fire price scrape triggered");

    let result = scrape_fire_price_blocking();

    if result.success {
        if let Some(ref records) = result.data {
            {
                let mut fire_price = state.fire_price.write();
                *fire_price = Some(result.clone());
            }

            if let Some(first) = records.first() {
                let mut fire_record = state.fire_price_record.write();
                *fire_record = Some(first.clone());
            }

            let _ = log_fire_price_to_db(&state.db_path, records);
            if let Some(ref records) = result.data {
                let _ = update_fire_price_record(&state.db_path, records);
            }
        }
        Ok(OkResponse { ok: true, message: "Fire price updated".to_string() })
    } else {
        Ok(OkResponse { ok: false, message: result.error.unwrap_or_else(|| "Unknown error".to_string()) })
    }
}

#[tauri::command]
fn get_db_stats(state: State<'_, Arc<AppState>>) -> Result<DbStats, String> {
    let conn = get_db_connection(&state.db_path)?;

    let items_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0))
        .unwrap_or(0);

    let fire_price_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM fire_price_log", [], |r| r.get(0))
        .unwrap_or(0);

    let last_fire_scrape: Option<String> = conn
        .query_row(
            "SELECT timestamp FROM fire_price_log ORDER BY id DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok();

    let last_items_reload: Option<String> = conn
        .query_row("SELECT MAX(updated_at) FROM items", [], |r| r.get(0))
        .ok();

    let db_size = fs::metadata(&state.db_path)
        .map(|m| m.len() as f64 / 1024.0)
        .unwrap_or(0.0);

    Ok(DbStats {
        items_count,
        fire_price_count,
        last_fire_scrape,
        last_items_reload,
        db_size_kb: db_size,
    })
}

#[derive(serde::Deserialize)]
struct FireHistoryParams {
    item_name: Option<String>,
    hours: Option<i64>,
    mode: Option<String>,
}

#[tauri::command]
fn get_fire_history(
    state: State<'_, Arc<AppState>>,
    params: Option<FireHistoryParams>,
) -> Result<Vec<FirePriceRecord>, String> {
    let (item_name, limit) = if let Some(p) = params {
        (p.item_name, Some(p.hours.unwrap_or(24)))
    } else {
        (None, Some(24))
    };
    let conn = get_db_connection(&state.db_path)?;
    let limit = limit.unwrap_or(100);

    let records = if let Some(name) = item_name {
        {
            let mut stmt = conn
                .prepare(
                    "SELECT id, item_name, price, unit, timestamp, category
                     FROM fire_price_log WHERE item_name = ?1
                     ORDER BY id DESC LIMIT ?2",
                )
                .map_err(|e| format!("Prepare error: {}", e))?;

            let rows = stmt.query_map(params![name, limit], |row| {
                Ok(FirePriceRecord {
                    id: Some(row.get(0)?),
                    item_name: row.get(1)?,
                    price: row.get(2)?,
                    unit: row.get(3)?,
                    timestamp: row.get(4)?,
                    category: row.get(5)?,
                })
            })
            .map_err(|e| format!("Query error: {}", e))?;
            rows.filter_map(|r| r.ok()).collect()
        }
    } else {
        {
            let mut stmt = conn
                .prepare(
                    "SELECT id, item_name, price, unit, timestamp, category
                     FROM fire_price_log ORDER BY id DESC LIMIT ?1",
                )
                .map_err(|e| format!("Prepare error: {}", e))?;

            let rows = stmt.query_map(params![limit], |row| {
                Ok(FirePriceRecord {
                    id: Some(row.get(0)?),
                    item_name: row.get(1)?,
                    price: row.get(2)?,
                    unit: row.get(3)?,
                    timestamp: row.get(4)?,
                    category: row.get(5)?,
                })
            })
            .map_err(|e| format!("Query error: {}", e))?;
            rows.filter_map(|r| r.ok()).collect()
        }
    };

    Ok(records)
}

#[tauri::command]
fn get_item_history(
    state: State<'_, Arc<AppState>>,
    item_name: String,
) -> Result<Vec<ItemData>, String> {
    let items = {
        let guard = state.items_data.read();
        guard.clone()
    };

    let filtered: Vec<ItemData> = items
        .into_iter()
        .filter(|i| i.name.contains(&item_name))
        .collect();

    Ok(filtered)
}

#[tauri::command]
fn import_csv(state: State<'_, Arc<AppState>>, csv_content: String) -> Result<i64, String> {
    let conn = get_db_connection(&state.db_path)?;

    let mut lines = csv_content.lines();
    let header = lines.next().ok_or("Empty CSV")?;

    let cols: Vec<&str> = header.split(',').map(|s| s.trim()).collect();
    if cols.len() < 2 {
        return Err("CSV must have at least name,category columns".to_string());
    }

    let name_idx = cols
        .iter()
        .position(|&c| c == "name" || c == "物品名称")
        .unwrap_or(0);
    let cat_idx = cols
        .iter()
        .position(|&c| c == "category" || c == "分类")
        .unwrap_or(1);

    let tx = conn.unchecked_transaction().map_err(|e| format!("Transaction error: {}", e))?;
    let mut count = 0i64;

    {
        let mut stmt = tx
            .prepare(
                "INSERT OR REPLACE INTO items (name, category, rarity, updated_at) VALUES (?1, ?2, '', datetime('now'))",
            )
            .map_err(|e| format!("Prepare error: {}", e))?;

        for line in lines {
            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() <= name_idx {
                continue;
            }

            let name = parts[name_idx].trim().to_string();
            let category = parts.get(cat_idx).map_or(String::new(), |s| s.trim().to_string());

            if !name.is_empty() {
                if stmt.execute(params![name, category]).is_ok() {
                    count += 1;
                }
            }
        }
    }

    tx.commit().map_err(|e| format!("Commit error: {}", e))?;

    let items = reload_items_data(&state.db_path)?;
    {
        let mut guard = state.items_data.write();
        *guard = items;
    }

    info!("Imported {} items from CSV", count);
    Ok(count)
}

#[tauri::command]
fn export_csv(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let items = {
        let guard = state.items_data.read();
        guard.clone()
    };

    let mut csv = String::from("name,category,rarity,updated_at\n");
    for item in items {
        csv.push_str(&format!(
            "{},{},{},{}\n",
            item.name, item.category, item.rarity, item.updated_at
        ));
    }

    Ok(csv)
}

#[tauri::command]
fn get_sections(state: State<'_, Arc<AppState>>) -> Result<Vec<Section>, String> {
    let guard = state.sections.read();
    Ok(guard.clone())
}

#[tauri::command]
fn save_sections(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    sections: Vec<Section>,
) -> Result<(), String> {
    save_sections_to_file(&app, &sections)?;

    let mut guard = state.sections.write();
    *guard = sections;

    Ok(())
}

// ============================================================================
// Background Tasks
// ============================================================================

fn start_background_tasks(app: AppHandle, state: Arc<AppState>) {
    let config = {
        let guard = state.config.read();
        guard.clone()
    };
    let db_path = state.db_path.clone();

    let fire_interval = config.fire_price_scrape_interval;
    let state_clone = state.clone();

    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create runtime");
        info!("Fire price scraper thread started (interval: {}s)", fire_interval);

        loop {
            thread::sleep(Duration::from_secs(10));

            info!("Running scheduled fire price scrape");

            let result = rt.block_on(scrape_fire_price_async());

            match result {
                Ok(response) => {
                    if response.success {
                        if let Some(ref records) = response.data {
                            {
                                let mut fp = state_clone.fire_price.write();
                                *fp = Some(response.clone());
                            }

                            if let Some(first) = records.first() {
                                let mut fr = state_clone.fire_price_record.write();
                                *fr = Some(first.clone());
                            }

                            let _ = log_fire_price_to_db(&db_path, records);
                            if let Some(ref records) = response.data {
                                let _ = update_fire_price_record(&db_path, records);
                            }

                            info!("Fire price scrape successful, {} records", records.len());
                        }
                    } else {
                        warn!("Fire price scrape returned no data");
                    }
                }
                Err(e) => {
                    error!("Fire price scrape failed: {}", e);
                }
            }

            thread::sleep(Duration::from_secs(fire_interval));
        }
    });

    let items_interval = config.items_reload_interval;
    let state_clone2 = state.clone();
    let db_path2 = state.db_path.clone();

    thread::spawn(move || {
        info!("Items reload thread started (interval: {}s)", items_interval);

        loop {
            thread::sleep(Duration::from_secs(items_interval));

            info!("Running scheduled items reload");

            match reload_items_data(&db_path2) {
                Ok(items) => {
                    let mut guard = state_clone2.items_data.write();
                    *guard = items;
                    info!(
                        "Items reloaded: {} items",
                        state_clone2.items_data.read().len()
                    );
                }
                Err(e) => {
                    error!("Items reload failed: {}", e);
                }
            }
        }
    });

    let app_clone = app.clone();
    thread::spawn(move || {
        info!("DB stats logger thread started");

        loop {
            thread::sleep(Duration::from_secs(3600));

            if let Ok(app_data_dir) = app_clone.path().app_data_dir() {
                let full_path = app_data_dir.join("data/tl_monitor.db");
                if let Ok(conn) = Connection::open(full_path) {
                    let count: i64 = conn
                        .query_row("SELECT COUNT(*) FROM fire_price_log", [], |r| r.get(0))
                        .unwrap_or(0);
                    info!("DB stats: {} fire price records logged", count);
                }
            }
        }
    });

    info!("All background tasks started");
}

// ============================================================================
// Main Entry Point
// ============================================================================


// ============================================================================
// Internal HTTP Server for Frontend (bypasses broken Tauri IPC in embedded mode)
// ============================================================================

fn start_http_server(state: Arc<AppState>, port: u16) {
    let listener = match TcpListener::bind(format!("127.0.0.1:{}", port)) {
        Ok(l) => l,
        Err(e) => { log::error!("HTTP bind error: {}", e); return; }
    };
    if let Err(e) = listener.set_nonblocking(true) { log::error!("set_nonblocking: {}", e); }
    log::info!("HTTP server listening on http://127.0.0.1:{}", port);

    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let state = state.clone();
                std::thread::spawn(move || {
                    let mut buf = [0u8; 65536];
                    let n = match stream.read(&mut buf) { Ok(n) => n, Err(_) => return };
                    let request = String::from_utf8_lossy(&buf[..n]);
                    let first_line = request.lines().next().unwrap_or("/");
                    let parts: Vec<&str> = first_line.split_whitespace().collect();
                    let method = parts.get(0).unwrap_or(&"GET");
                    let path = parts.get(1).unwrap_or(&"/");
                    let has_body = request.lines().any(|l| l.trim().is_empty());
                    let body = if *method == "POST" && has_body {
                        request.split("\r\n\r\n").nth(1).map(|s| s.to_string()).unwrap_or_default()
                    } else {
                        String::new()
                    };
                    let response = http_handle_request(&state, path, method, &body);
                    let resp = format!(
                        "HTTP/1.1 200 OK
Content-Type: application/json
Access-Control-Allow-Origin: *
Content-Length: {}

{}",
                        response.len(), response
                    );
                    stream.write_all(resp.as_bytes()).ok();
                });
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(_) => {}
        }
    }
}

fn http_handle_request(state: &Arc<AppState>, path: &str, method: &str, body: &str) -> String {
    // GET routes
    if path == "/health" || path == "/api/health" {
        return r#"{"ok":true}"#.to_string();
    }
    if path == "/api/fire_price" {
        let guard = state.fire_price.read();
        if let Some(ref fp) = *guard {
            let price = fp.data.as_ref().and_then(|r| r.first())
                .map(|rec| (rec.price as f64) / 10000.0).unwrap_or(0.0);
            let record_time = fp.data.as_ref().and_then(|r| r.first())
                .map(|rec| rec.timestamp.clone()).unwrap_or_default();
            return format!(r#"{{"price_per_wan":{},"record_time":"{}","source":"{}"}}"#, price, record_time, fp.source);
        }
        return r#"{"error":"no fire price data"}"#.to_string();
    }
    if path == "/api/items" {
        let guard = state.items_data.read();
        let items: Vec<String> = guard.iter().take(200).map(|i| {
            let name = i.name.replace('"', "\"");
            std::format!(r#"{{"name":"{}"}}"#, name)
        }).collect();
        return format!(r#"{{"items":[{}]}}"#, items.join(","));
    }
    // GET /api/config
    if path == "/api/config" && method == "GET" {
        let guard = state.config.read();
        return format!(r#"{{"input":{}}}"#, serde_json::to_string(&*guard).unwrap_or_default());
    }
    // GET /api/sections
    if path == "/api/sections" && method == "GET" {
        let guard = state.sections.read();
        return serde_json::to_string(&*guard).unwrap_or_else(|_| "[]".to_string());
    }
    // POST /api/config
    if path == "/api/config" && method == "POST" {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(body) {
            let input = json.get("input")
                .or(json.get("fire_price"))
                .cloned()
                .unwrap_or(json.clone());
            let mut cfg = state.config.write();
            if let Some(mode) = input.get("mode").and_then(|v| v.as_str()) {
                cfg.mode = mode.to_string();
            }
            if let Some(interval) = input.get("scrape_interval")
                .and_then(|v| v.as_u64()) {
                cfg.fire_price_scrape_interval = interval.max(60);
            }
            if let Some(interval) = input.get("items_reload_interval")
                .or(input.get("reload_interval"))
                .and_then(|v| v.as_u64()) {
                cfg.items_reload_interval = interval.max(60);
            }
            drop(cfg);
            info!("Config updated via HTTP");
            return r#"{"status":"ok"}"#.to_string();
        }
        return r#"{"error":"invalid config body"}"#.to_string();
    }
    // POST /api/sections
    if path == "/api/sections" && method == "POST" {
        if let Ok(sections) = serde_json::from_str::<Vec<Section>>(body) {
            let mut guard = state.sections.write();
            *guard = sections;
            info!("Sections saved via HTTP");
            return r#"{"ok":true}"#.to_string();
        }
        return r#"{"error":"invalid sections body"}"#.to_string();
    }
    // POST /api/scrape_fire
    if path == "/api/scrape_fire" && method == "POST" {
        info!("Fire scrape triggered via HTTP");
        let result = scrape_fire_price_blocking();
        if result.success {
            if let Some(ref records) = result.data {
                {
                    let mut fp = state.fire_price.write();
                    *fp = Some(result.clone());
                }
                if let Some(first) = records.first() {
                    let mut rec = state.fire_price_record.write();
                    *rec = Some(first.clone());
                }
                let price = records.first().map(|r| (r.price as f64) / 10000.0).unwrap_or(0.0);
                let _ = log_fire_price_to_db(&state.db_path, records);
                return format!(r#"{{"ok":true,"price_per_wan":{}}}"#, price);
            }
        }
        return format!(r#"{{"ok":false,"error":"{}"}}"#, result.error.unwrap_or_default());
    }
    // GET /api/db_stats
    if path == "/api/db_stats" || path == "/api/db/stats" {
        if let Ok(conn) = Connection::open(&state.db_path) {
            let item_count: i64 = conn.query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0)).unwrap_or(0);
            let log_count: i64 = conn.query_row("SELECT COUNT(*) FROM fire_price_log", [], |r| r.get(0)).unwrap_or(0);
            let last_log: Option<i64> = conn.query_row(
                "SELECT MAX(scraped_at) FROM fire_price_log", [], |r| r.get(0)
            ).ok().filter(|&v| v > 0);
            let last_str = last_log.map(|ts| {
                chrono::DateTime::from_timestamp(ts, 0)
                    .map(|dt| dt.format("%m-%d %H:%M").to_string())
                    .unwrap_or_default()
            }).unwrap_or_default();
            return format!(r#"{{"item_count":{},"log_count":{},"last_log_at":"{}"}}"#, item_count, log_count, last_str);
        }
        return r#"{"item_count":0,"log_count":0}"#.to_string();
    }
    // GET /api/db/items
    if path.starts_with("/api/db/items") {
        let page = path.split("page=").nth(1).and_then(|s| s.split('&').next())
            .and_then(|s| s.parse::<i64>().ok()).unwrap_or(1);
        let page_size = path.split("page_size=").nth(1).and_then(|s| s.split('&').next())
            .and_then(|s| s.parse::<i64>().ok()).unwrap_or(100);
        let keyword = path.split("keyword=").nth(1).and_then(|s| {
            Some(urlencoding_decode(s.split('&').next().unwrap_or("")))
        }).unwrap_or_default();
        let offset = (page - 1) * page_size;
        if let Ok(conn) = Connection::open(&state.db_path) {
            let rows: Vec<serde_json::Value> = if keyword.is_empty() {
                let mut stmt = match conn.prepare("SELECT item_id, name, item_type, price FROM items ORDER BY name LIMIT ? OFFSET ?") {
                    Ok(s) => s,
                    Err(_) => return r#"{"items":[],"total":0}"#.to_string(),
                };
                let mut rows_out = vec![];
                let mut rows = match stmt.query(rusqlite::params![page_size, offset]) {
                    Ok(r) => r,
                    Err(_) => return r#"{"items":[],"total":0}"#.to_string(),
                };
                while let Ok(row) = rows.next() {
                    let row = match row {
                        Some(r) => r,
                        None => break,
                    };
                    let item_id: String = rusqlite::Row::get(row, 0).ok().unwrap_or_default();
                    let name: String = rusqlite::Row::get(row, 1).ok().unwrap_or_default();
                    let item_type: String = rusqlite::Row::get(row, 2).ok().unwrap_or_default();
                    let price: f64 = rusqlite::Row::get(row, 3).ok().unwrap_or(0.0);
                    rows_out.push(serde_json::json!({
                        "item_id": item_id,
                        "name": name,
                        "item_type": item_type,
                        "price": price
                    }));
                }
                rows_out
            } else {
                vec![]
            };
            let total: i64 = conn.query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0)).unwrap_or(0);
            return format!(r#"{{"items":{},"total":{},"page":{},"page_size":{}}}"#,
                serde_json::to_string(&rows).unwrap_or_else(|_| "[]".to_string()), total, page, page_size);
        }
        return r#"{"items":[],"total":0}"#.to_string();
    }
    // GET /api/db/fire_record_history
    if path.starts_with("/api/db/fire_record_history") {
        let hours = path.split("hours=").nth(1).and_then(|s| s.split('&').next())
            .and_then(|s| s.parse::<i64>().ok()).unwrap_or(24);
        let since = chrono::Utc::now().timestamp() - hours * 3600;
        if let Ok(conn) = Connection::open(&state.db_path) {
            let mut stmt = match conn.prepare(
                "SELECT ten_k, fire_per_rmb, increase_ratio, ts, scraped_at FROM fire_price_record WHERE scraped_at >= ? ORDER BY scraped_at ASC"
            ) {
                Ok(s) => s,
                Err(_) => return r#"{"history":[]}"#.to_string(),
            };
            let mut rows_out = vec![];
            let mut rows = match stmt.query(rusqlite::params![since]) {
                Ok(r) => r,
                Err(_) => return r#"{"history":[]}"#.to_string(),
            };
            while let Ok(Some(row)) = rows.next() {
                let scraped_at: i64 = rusqlite::Row::get(&row, 4).ok().unwrap_or(0);
                let ts_str = chrono::DateTime::from_timestamp(scraped_at, 0)
                    .map(|dt| dt.format("%m-%d %H:%M").to_string())
                    .unwrap_or_default();
                rows_out.push(serde_json::json!({
                    "ten_k": rusqlite::Row::get::<_, f64>(&row, 0).ok().unwrap_or(0.0),
                    "fire_per_rmb": rusqlite::Row::get::<_, f64>(&row, 1).ok().unwrap_or(0.0),
                    "increase_ratio": rusqlite::Row::get::<_, f64>(&row, 2).ok().unwrap_or(0.0),
                    "ts": rusqlite::Row::get::<_, String>(&row, 3).ok().unwrap_or_default(),
                    "scraped_at": scraped_at,
                    "scraped_time": ts_str
                }));
            }
            return format!(r#"{{"history":{}}}"#, serde_json::to_string(&rows_out).unwrap_or_else(|_| "[]".to_string()));
        }
        return r#"{"history":[]}"#.to_string();
    }
    r#"{"error":"not found"}"#.to_string()
}

fn urlencoding_decode(s: &str) -> String {
    let mut result = String::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if hex.len() == 2 {
                if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                    result.push(byte as char);
                } else {
                    result.push('%');
                    result.push_str(&hex);
                }
            } else {
                result.push('%');
                result.push_str(&hex);
            }
        } else if c == '+' {
            result.push(' ');
        } else {
            result.push(c);
        }
    }
    result
}


fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    info!("TL Monitor starting...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            info!("Tauri app setting up...");

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data directory");

            info!("App data dir: {:?}", app_data_dir);

            let db_path = app_data_dir.join("data").join("tl_monitor.db");

            let _conn = init_database(&db_path).expect("Failed to initialize database");

            let config = {
                if let Ok(conn) = Connection::open(&db_path) {
                    let json: Option<String> = conn
                        .query_row(
                            "SELECT value FROM config WHERE key = 'app_config'",
                            [],
                            |r| r.get(0),
                        )
                        .ok();

                    json.and_then(|j| serde_json::from_str(&j).ok())
                        .unwrap_or_default()
                } else {
                    AppConfig::default()
                }
            };

            let sections = load_sections_from_file(app.handle());

            let state = Arc::new(AppState {
                fire_price: RwLock::new(None),
                fire_price_record: RwLock::new(None),
                items_data: RwLock::new(Vec::new()),
                sections: RwLock::new(sections),
                config: RwLock::new(config),
                db_path,
            });

            start_background_tasks(app.handle().clone(), state.clone());

            app.manage(state.clone());

            // Start HTTP server for frontend (bypasses broken Tauri IPC)
            let http_state = state.clone();
            std::thread::spawn(move || {
                start_http_server(http_state, 19899);
            });

            // Setup system tray
            let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
            let hide_item = MenuItemBuilder::with_id("hide", "隐藏窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&hide_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("TL物品火价监控")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => {
                        info!("Quit requested from tray");
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Handle window close to hide instead of quit
            if let Some(main_window) = app.get_webview_window("main") {
                main_window.on_window_event(|event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                    }
                });
            }

            info!("Tauri app setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_fire_price,
            get_items,
            get_config,
            set_config,
            trigger_scrape_fire,
            trigger_items_reload,
            get_db_stats,
            get_fire_history,
            get_item_history,
            import_csv,
            export_csv,
            get_sections,
            save_sections,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri app failed to run");
}