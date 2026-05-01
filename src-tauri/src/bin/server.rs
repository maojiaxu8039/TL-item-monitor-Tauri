//! TL Monitor Server - 独立数据采集服务器 v3.0
//! 
//! 支持同时采集普通服和专家服数据
//! 
//! 运行方式：
//!   cargo run --bin server

use std::sync::Arc;
use chrono::{Utc, Timelike};
use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use tokio::sync::{broadcast, RwLock};
use tracing::{info, error, warn, Level};
use tracing_subscriber::FmtSubscriber;
use serde::Serialize;

mod scraper;
mod db;
mod config;

use config::ServerConfig;
use scraper::{Scraper, FirePriceSnapshot, Item};
use db::MarketMode;

const DB_PATH: &str = "/data/tl_monitor.db";
const CONFIG_PATH: &str = "/config/server_config.yaml";

#[derive(Clone)]
struct ServerState {
    config: ServerConfig,
    db: SqlitePool,
    last_collection: Arc<RwLock<CollectionStatus>>,
}

#[derive(Clone, Default, Serialize)]
struct CollectionStatus {
    normal: Option<ModeCollectionStatus>,
    expert: Option<ModeCollectionStatus>,
}

#[derive(Clone, Serialize)]
struct ModeCollectionStatus {
    timestamp: i64,
    fire_success: bool,
    fire_price: Option<f64>,
    items_count: usize,
    items_success: bool,
    error: Option<String>,
}

#[derive(Clone, Serialize)]
struct ApiStatus {
    server: String,
    version: String,
    uptime_seconds: i64,
    season_id: String,
    last_collection: CollectionStatus,
    next_collection: Option<i64>,
}

#[derive(Clone, Serialize)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .try_init();

    let start_time = Utc::now().timestamp();

    info!("==============================================");
    info!("TL Monitor Server v3.0 - 支持普通服+专家服");
    info!("==============================================");

    let config = match config::load_config(CONFIG_PATH) {
        Ok(cfg) => {
            info!("配置加载成功: season={}, http_port={}, modes={:?}", 
                cfg.season_id, cfg.http_port, 
                cfg.scrape_modes.iter().map(|m| format!("{}:{}", m.mode, m.enabled)).collect::<Vec<_>>());
            cfg
        }
        Err(e) => {
            warn!("配置加载失败: {}, 使用默认配置", e);
            ServerConfig::default()
        }
    };

    let db_path = std::env::var("TL_DB_PATH").unwrap_or_else(|_| DB_PATH.to_string());
    info!("数据库路径: {}", db_path);
    
    if let Some(parent) = std::path::Path::new(&db_path).parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(2)
        .connect(&format!("sqlite:{}?mode=rwc", db_path))
        .await?;

    db::run_migrations(&pool).await?;

    let state = Arc::new(ServerState {
        config: config.clone(),
        db: pool,
        last_collection: Arc::new(RwLock::new(CollectionStatus::default())),
    });

    let http_state = state.clone();
    let http_port = config.http_port;
    tokio::spawn(async move {
        start_http_server(http_state, http_port, start_time).await;
    });

    let (abort_tx, mut abort_rx) = broadcast::channel::<()>(1);

    let abort_tx_clone = abort_tx.clone();
    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.ok();
        info!("收到关闭信号，正在停止服务器...");
        abort_tx_clone.send(()).ok();
    });

    run_collector(state, abort_rx).await;

    info!("服务器已关闭");
    Ok(())
}

async fn start_http_server(state: Arc<ServerState>, port: u16, start_time: i64) {
    let addr = format!("0.0.0.0:{}", port);
    info!("HTTP API 服务器启动: http://{}", addr);
    
    loop {
        match tokio::net::TcpListener::bind(&addr).await {
            Ok(listener) => {
                info!("HTTP API 服务器监听中: http://{}", addr);
                
                loop {
                    match listener.accept().await {
                        Ok((stream, client_addr)) => {
                            let state_clone = state.clone();
                            let start_clone = start_time;
                            tokio::spawn(async move {
                                handle_request(stream, client_addr, state_clone, start_clone).await;
                            });
                        }
                        Err(e) => {
                            warn!("接受连接失败: {}", e);
                        }
                    }
                }
            }
            Err(e) => {
                error!("HTTP 服务器绑定失败: {}，5秒后重试...", e);
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        }
    }
}

async fn handle_request(
    stream: tokio::net::TcpStream,
    client_addr: std::net::SocketAddr,
    state: Arc<ServerState>,
    start_time: i64,
) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    
    let mut buffer = [0u8; 4096];
    let mut stream = stream;
    
    if let Err(e) = stream.read(&mut buffer).await {
        warn!("读取请求失败: {}", e);
        return;
    }
    
    let request = String::from_utf8_lossy(&buffer);
    let lines: Vec<&str> = request.lines().collect();
    
    if lines.is_empty() {
        return;
    }
    
    let first_line = lines[0];
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    
    if parts.len() < 2 {
        return;
    }
    
    let method = parts[0];
    let path = parts[1];
    
    info!("HTTP {} {} from {}", method, path, client_addr);
    
    let (status, body) = match (method, path) {
        ("GET", "/") | ("GET", "/status") => {
            let last_collection = state.last_collection.read().await.clone();
            
            let status = ApiStatus {
                server: "TL Monitor Server".to_string(),
                version: "3.0.0".to_string(),
                uptime_seconds: Utc::now().timestamp() - start_time,
                season_id: state.config.season_id.clone(),
                last_collection,
                next_collection: get_next_collection_time(),
            };
            
            let body = serde_json::to_string_pretty(&ApiResponse {
                success: true,
                data: Some(status),
                error: None,
            }).unwrap_or_default();
            
            (200, body)
        }
        ("GET", "/fire-history") => {
            let mode = get_query_param(&request, "mode").unwrap_or_else(|| "normal".to_string());
            let limit: i32 = get_query_param(&request, "limit")
                .and_then(|s| s.parse().ok())
                .unwrap_or(24);
            
            let market_mode = if mode == "expert" { "season_expert" } else { "season_normal" };
            
            match db::get_fire_history(&state.db, &state.config.season_id, market_mode, limit).await {
                Ok(records) => {
                    let body = serde_json::to_string_pretty(&ApiResponse {
                        success: true,
                        data: Some(records),
                        error: None,
                    }).unwrap_or_default();
                    (200, body)
                }
                Err(e) => {
                    let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                        success: false,
                        data: None,
                        error: Some(e),
                    }).unwrap_or_default();
                    (500, body)
                }
            }
        }
        ("GET", "/health") => {
            (200, "OK".to_string())
        }
        _ => {
            let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                success: false,
                data: None,
                error: Some("Not Found".to_string()),
            }).unwrap_or_default();
            (404, body)
        }
    };
    
    let response = format!(
        "HTTP/1.1 {} {}\r\n\
        Content-Type: application/json\r\n\
        Content-Length: {}\r\n\
        Access-Control-Allow-Origin: *\r\n\
        \r\n\
        {}",
        status,
        if status == 200 { "OK" } else { "Error" },
        body.len(),
        body
    );
    
    if let Err(e) = stream.write_all(response.as_bytes()).await {
        warn!("发送响应失败: {}", e);
    }
}

fn get_query_param(request: &str, param: &str) -> Option<String> {
    for line in request.lines() {
        if line.starts_with("GET") {
            if let Some(query_start) = line.find('?') {
                let query = &line[query_start + 1..];
                for pair in query.split('&') {
                    let kv: Vec<&str> = pair.split('=').collect();
                    if kv.len() == 2 && kv[0] == param {
                        return Some(kv[1].to_string());
                    }
                }
            }
        }
    }
    None
}

fn get_next_collection_time() -> Option<i64> {
    let now = Utc::now();
    let next_hour = (now + chrono::Duration::hours(1))
        .with_minute(0).unwrap()
        .with_second(0).unwrap()
        .with_nanosecond(0).unwrap();
    Some(next_hour.timestamp())
}

async fn run_collector(state: Arc<ServerState>, mut abort_rx: broadcast::Receiver<()>) {
    info!("数据采集任务启动中...");
    
    let now = Utc::now();
    let next_hour = (now + chrono::Duration::hours(1))
        .with_minute(0).unwrap()
        .with_second(0).unwrap()
        .with_nanosecond(0).unwrap();
    let wait_secs = (next_hour - now).num_seconds();
    
    info!("下次采集时间: {} ({} 秒后)", next_hour.format("%Y-%m-%d %H:%M:%S UTC"), wait_secs);

    info!("启动时执行首次采集...");
    collect_all_modes(&state).await;

    loop {
        tokio::select! {
            _ = abort_rx.recv() => {
                info!("收到关闭信号，退出采集循环");
                break;
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(3600)) => {
                collect_all_modes(&state).await;
            }
        }
    }
}

async fn collect_all_modes(state: &Arc<ServerState>) {
    let timestamp = Utc::now()
        .with_minute(0).unwrap()
        .with_second(0).unwrap()
        .with_nanosecond(0).unwrap()
        .timestamp();

    let mut new_status = CollectionStatus::default();

    for scrape_mode in &state.config.scrape_modes {
        if !scrape_mode.enabled {
            continue;
        }

        let market_mode = if scrape_mode.mode == "expert" { "season_expert" } else { "season_normal" };
        
        info!("[{}] 开始采集 {} 数据...", Utc::now().format("%Y-%m-%d %H:%M:%S UTC"), scrape_mode.mode);

        let mut mode_status = ModeCollectionStatus {
            timestamp,
            fire_success: false,
            fire_price: None,
            items_count: 0,
            items_success: false,
            error: None,
        };

        // 采集火价
        match Scraper::scrape_fire_price(market_mode).await {
            Ok(fire) => {
                mode_status.fire_success = true;
                mode_status.fire_price = Some(fire.rmb_per_10k_fire);
                
                if let Err(e) = db::insert_fire_record(
                    &state.db,
                    &state.config.season_id,
                    market_mode,
                    &fire,
                    timestamp,
                ).await {
                    mode_status.error = Some(format!("DB error: {}", e));
                }
            }
            Err(e) => {
                mode_status.error = Some(format!("Fire scrape error: {}", e));
            }
        }

        // 采集物品
        match Scraper::scrape_items(&state.config.season_id, market_mode).await {
            Ok(items) => {
                mode_status.items_success = true;
                mode_status.items_count = items.len();
                
                if let Err(e) = db::insert_items_record(
                    &state.db,
                    &state.config.season_id,
                    market_mode,
                    &items,
                    timestamp,
                ).await {
                    if mode_status.error.is_none() {
                        mode_status.error = Some(format!("Items DB error: {}", e));
                    }
                }
            }
            Err(e) => {
                if mode_status.error.is_none() {
                    mode_status.error = Some(format!("Items scrape error: {}", e));
                }
            }
        }

        info!("[{}] {} 采集完成: 火价={}, 物品={}", 
            Utc::now().format("%Y-%m-%d %H:%M:%S UTC"), scrape_mode.mode, 
            mode_status.fire_price.map(|p| p.to_string()).unwrap_or_else(|| "失败".to_string()),
            mode_status.items_count);

        if scrape_mode.mode == "expert" {
            new_status.expert = Some(mode_status);
        } else {
            new_status.normal = Some(mode_status);
        }
    }

    {
        let mut last = state.last_collection.write().await;
        *last = new_status;
    }

    info!("[{}] 本次采集完成", Utc::now().format("%Y-%m-%d %H:%M:%S UTC"));
}
