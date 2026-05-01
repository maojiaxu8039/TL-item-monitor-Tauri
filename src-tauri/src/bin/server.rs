//! TL Monitor Server - 独立数据采集服务器
//! 
//! 用于在 NAS 等服务器上 24 小时运行，定时抓取火价和物品价格数据。
//! 同时提供 HTTP API 供桌面客户端查询状态和拉取数据。
//! 
//! 运行方式：
//!   cargo run --bin server
//!   cargo run --bin server -- --season ss12 --mode season_normal --port 8080

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

const DB_PATH: &str = "/data/tl_monitor.db";
const CONFIG_PATH: &str = "/config/server_config.yaml";

#[derive(Clone)]
struct ServerState {
    config: ServerConfig,
    db: SqlitePool,
    last_collection: Arc<RwLock<Option<CollectionStatus>>>,
}

#[derive(Clone, Serialize)]
struct CollectionStatus {
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
    market_mode: String,
    last_collection: Option<CollectionStatus>,
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
    // 初始化日志
    let _ = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .try_init();

    let start_time = Utc::now().timestamp();

    info!("==============================================");
    info!("TL Monitor Server - 独立数据采集服务器 v2.0");
    info!("==============================================");

    // 加载配置
    let config = match config::load_config(CONFIG_PATH) {
        Ok(cfg) => {
            info!("配置加载成功: season={}, mode={}, http_port={}", 
                cfg.season_id, cfg.market_mode, cfg.http_port);
            cfg
        }
        Err(e) => {
            warn!("配置加载失败: {}, 使用默认配置", e);
            ServerConfig::default()
        }
    };

    // 解析命令行参数覆盖配置
    let args: Vec<String> = std::env::args().collect();
    let config = parse_args(args, config);

    // 初始化数据库
    let db_path = std::env::var("TL_DB_PATH").unwrap_or_else(|_| DB_PATH.to_string());
    info!("数据库路径: {}", db_path);
    
    // 确保数据目录存在
    if let Some(parent) = std::path::Path::new(&db_path).parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(2)
        .connect(&format!("sqlite:{}?mode=rwc", db_path))
        .await?;

    // 运行数据库迁移
    db::run_migrations(&pool).await?;

    // 创建共享状态
    let state = Arc::new(ServerState {
        config: config.clone(),
        db: pool,
        last_collection: Arc::new(RwLock::new(None)),
    });

    // 启动 HTTP API 服务器
    let http_state = state.clone();
    let http_port = config.http_port;
    tokio::spawn(async move {
        start_http_server(http_state, http_port, start_time).await;
    });

    // 创建广播通道用于优雅关闭
    let (abort_tx, mut abort_rx) = broadcast::channel::<()>(1);

    // 注册信号处理
    let abort_tx_clone = abort_tx.clone();
    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.ok();
        info!("收到关闭信号，正在停止服务器...");
        abort_tx_clone.send(()).ok();
    });

    // 启动数据采集任务
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
            let next_collection = get_next_collection_time();
            
            let status = ApiStatus {
                server: "TL Monitor Server".to_string(),
                version: "2.0.0".to_string(),
                uptime_seconds: Utc::now().timestamp() - start_time,
                season_id: state.config.season_id.clone(),
                market_mode: state.config.market_mode.clone(),
                last_collection,
                next_collection,
            };
            
            let body = serde_json::to_string_pretty(&ApiResponse {
                success: true,
                data: Some(status),
                error: None,
            }).unwrap_or_default();
            
            (200, body)
        }
        ("GET", "/fire-history") => {
            let limit: i32 = get_query_param(&request, "limit")
                .and_then(|s| s.parse().ok())
                .unwrap_or(24);
            match db::get_fire_history(&state.db, &state.config.season_id, &state.config.market_mode, limit).await {
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
        ("GET", "/fire-history-all") => {
            let season_id = get_query_param(&request, "season_id")
                .unwrap_or_else(|| state.config.season_id.clone());
            let market_mode = get_query_param(&request, "market_mode")
                .unwrap_or_else(|| state.config.market_mode.clone());
            
            match db::get_fire_history_all(&state.db, &season_id, &market_mode).await {
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
        ("GET", "/items-history") => {
            let item_id = get_query_param(&request, "item_id");
            let limit: i32 = get_query_param(&request, "limit")
                .and_then(|s| s.parse().ok())
                .unwrap_or(24);
            
            if let Some(item_id) = item_id {
                match db::get_items_history(&state.db, &item_id, &state.config.season_id, &state.config.market_mode, limit).await {
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
            } else {
                let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                    success: false,
                    data: None,
                    error: Some("Missing item_id parameter".to_string()),
                }).unwrap_or_default();
                (400, body)
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
    
    // 等待到下一个整点
    let now = Utc::now();
    let next_hour = (now + chrono::Duration::hours(1))
        .with_minute(0).unwrap()
        .with_second(0).unwrap()
        .with_nanosecond(0).unwrap();
    let wait_secs = (next_hour - now).num_seconds();
    
    info!("下次采集时间: {} ({} 秒后)", next_hour.format("%Y-%m-%d %H:%M:%S UTC"), wait_secs);

    // 启动时立即执行一次采集
    info!("启动时执行首次采集...");
    collect_and_save(&state).await;

    // 定时循环
    loop {
        tokio::select! {
            _ = abort_rx.recv() => {
                info!("收到关闭信号，退出采集循环");
                break;
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(3600)) => {
                collect_and_save(&state).await;
            }
        }
    }
}

async fn collect_and_save(state: &Arc<ServerState>) {
    let now = Utc::now();
    let timestamp = now.with_minute(0).unwrap()
        .with_second(0).unwrap()
        .with_nanosecond(0).unwrap()
        .timestamp();

    info!("[{}] 开始数据采集...", now.format("%Y-%m-%d %H:%M:%S UTC"));

    let mut collection_status = CollectionStatus {
        timestamp,
        fire_success: false,
        fire_price: None,
        items_count: 0,
        items_success: false,
        error: None,
    };

    // 采集火价
    info!("采集火价数据...");
    let fire_result = Scraper::scrape_fire_price(&state.config.market_mode).await;
    
    match fire_result {
        Ok(fire) => {
            collection_status.fire_success = true;
            collection_status.fire_price = Some(fire.rmb_per_10k_fire);
            info!("火价采集成功: {} RMB/10K", fire.rmb_per_10k_fire);
            
            if let Err(e) = db::insert_fire_record(
                &state.db,
                &state.config.season_id,
                &state.config.market_mode,
                &fire,
                timestamp,
            ).await {
                error!("火价记录保存失败: {}", e);
                collection_status.error = Some(format!("DB error: {}", e));
            } else {
                info!("火价记录已保存到数据库");
            }
        }
        Err(e) => {
            error!("火价采集失败: {}", e);
            collection_status.error = Some(format!("Fire scrape error: {}", e));
        }
    }

    // 采集物品数据
    info!("采集物品数据...");
    let items_result = Scraper::scrape_items(&state.config.season_id, &state.config.market_mode).await;
    
    match items_result {
        Ok(items) => {
            collection_status.items_success = true;
            collection_status.items_count = items.len();
            info!("物品采集成功: {} 个物品", items.len());
            
            if let Err(e) = db::insert_items_record(
                &state.db,
                &state.config.season_id,
                &state.config.market_mode,
                &items,
                timestamp,
            ).await {
                error!("物品记录保存失败: {}", e);
                collection_status.error = Some(format!("Items DB error: {}", e));
            } else {
                info!("物品记录已保存到数据库");
            }
        }
        Err(e) => {
            error!("物品采集失败: {}", e);
            if collection_status.error.is_none() {
                collection_status.error = Some(format!("Items scrape error: {}", e));
            }
        }
    }

    // 更新状态
    {
        let mut last = state.last_collection.write().await;
        *last = Some(collection_status);
    }

    info!("[{}] 数据采集完成", Utc::now().format("%Y-%m-%d %H:%M:%S UTC"));
}

fn parse_args(args: Vec<String>, mut config: ServerConfig) -> ServerConfig {
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--season" | "-s" if i + 1 < args.len() => {
                config.season_id = args[i + 1].clone();
                i += 2;
            }
            "--mode" | "-m" if i + 1 < args.len() => {
                config.market_mode = args[i + 1].clone();
                i += 2;
            }
            "--port" | "-p" if i + 1 < args.len() => {
                if let Ok(port) = args[i + 1].parse::<u16>() {
                    config.http_port = port;
                }
                i += 2;
            }
            "--help" | "-h" => {
                println!("TL Monitor Server - 独立数据采集服务器 v2.0");
                println!();
                println!("用法: server [选项]");
                println!();
                println!("选项:");
                println!("  --season, -s <id>    设置赛季ID (默认: ss12)");
                println!("  --mode, -m <mode>    设置市场模式 (默认: season_normal)");
                println!("  --port, -p <port>    设置HTTP API端口 (默认: 8080)");
                println!("  --help, -h           显示帮助");
                println!();
                println!("环境变量:");
                println!("  TL_DB_PATH           数据库路径 (默认: /data/tl_monitor.db)");
                println!();
                println!("HTTP API 端点:");
                println!("  GET /status          服务器状态和采集状态");
                println!("  GET /fire-history    火价历史数据");
                println!("  GET /items-history   物品历史数据 (需要 item_id 参数)");
                println!("  GET /health          健康检查");
                std::process::exit(0);
            }
            _ => i += 1,
        }
    }
    config
}
