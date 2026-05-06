//! TL Monitor Server - 独立数据采集服务器 v3.2
//!
//! 支持同时采集普通服和专家服数据
//! 支持管理员操作（需要密码验证）
//!
//! 运行方式：
//!   cargo run --bin server

use tl_monitor::core::constants::{SECONDS_PER_HOUR, SERVER_VERSION};
use chrono::{Timelike, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tracing::{error, info, warn, Level};
use tracing_subscriber::FmtSubscriber;

use tl_monitor::server::config::{ApiConfig, ServerConfig};
use tl_monitor::server::db;
use tl_monitor::server::scraper::Scraper;

const DB_PATH: &str = "/data/tl_monitor.db";
const CONFIG_PATH: &str = "/config/server_config.yaml";

#[derive(Clone)]
struct ServerState {
    config: ServerConfig,
    db: SqlitePool,
    last_collection: Arc<RwLock<CollectionStatus>>,
    cors_allowed_origins: Vec<String>,
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

#[derive(Debug, Deserialize)]
struct InitSeasonRequest {
    password: String,
    season_id: String,
    season_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateApiConfigRequest {
    password: String,
    api_config: ApiConfig,
}

#[derive(Debug, Serialize)]
struct InitSeasonResponse {
    success: bool,
    season_id: String,
    tables_created: Vec<String>,
    message: String,
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
    info!("TL Monitor Server v{} - 支持普通服+专家服+管理员API", SERVER_VERSION);
    info!("==============================================");

    let config = match tl_monitor::server::config::load_config(CONFIG_PATH) {
        Ok(cfg) => {
            info!(
                "配置加载成功: season={}, http_port={}, admin_password_set={}",
                cfg.season_id,
                cfg.http_port,
                !cfg.admin_password.is_empty()
            );
            info!(
                "API配置: qiandao_normal={}, luosi_normal={}",
                cfg.api_config.qiandao_tag_id_normal, cfg.api_config.luosi_season_id_normal
            );
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
        cors_allowed_origins: config.cors_allowed_origins.clone(),
    });

    let http_state = state.clone();
    let http_port = config.http_port;
    tokio::spawn(async move {
        start_http_server(http_state, http_port, start_time).await;
    });

    let (abort_tx, abort_rx) = broadcast::channel::<()>(1);

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

fn verify_admin(request_body: &str, password: &str) -> Result<(), String> {
    if password.is_empty() {
        return Err("管理员密码未设置".to_string());
    }
    if request_body.is_empty() {
        return Err("缺少密码字段".to_string());
    }
    if !constant_time_eq(request_body.as_bytes(), password.as_bytes()) {
        return Err("密码错误".to_string());
    }
    Ok(())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut result = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        result |= x ^ y;
    }
    result == 0
}

async fn handle_request(
    stream: tokio::net::TcpStream,
    client_addr: std::net::SocketAddr,
    state: Arc<ServerState>,
    start_time: i64,
) {
    use tokio::io::AsyncReadExt;

    let mut buffer = [0u8; 65536];
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

    let mut request_body = String::new();
    let mut content_length = 0usize;

    for line in &lines[1..] {
        if line.to_lowercase().starts_with("content-length:") {
            content_length = line
                .split(':')
                .nth(1)
                .unwrap_or("0")
                .trim()
                .parse()
                .unwrap_or(0);
        }
        if line.is_empty() {
            break;
        }
    }

    if content_length > 0 && lines.len() > 1 {
        let body_start = request.find("\r\n\r\n").map(|p| p + 4).unwrap_or(0);
        if body_start < request.len() {
            request_body = request
                [body_start..body_start + content_length.min(request.len() - body_start)]
                .to_string();
        }
    }

    let (status, body) = match (method, path) {
        ("GET", "/") | ("GET", "/status") => {
            let last_collection = state.last_collection.read().await.clone();

            let status = ApiStatus {
                server: "TL Monitor Server".to_string(),
                version: SERVER_VERSION.to_string(),
                uptime_seconds: Utc::now().timestamp() - start_time,
                season_id: state.config.season_id.clone(),
                last_collection,
                next_collection: get_next_collection_time(),
            };

            let body = serde_json::to_string_pretty(&ApiResponse {
                success: true,
                data: Some(status),
                error: None,
            })
            .unwrap_or_default();

            (200, body)
        }
        ("GET", "/fire-history") => {
            let mode = get_query_param(&request, "mode").unwrap_or_else(|| "normal".to_string());
            let limit: i32 = get_query_param(&request, "limit")
                .and_then(|s| s.parse().ok())
                .unwrap_or(24);

            let market_mode = if mode == "expert" {
                "season_expert"
            } else {
                "season_normal"
            };

            match db::get_fire_history(&state.db, &state.config.season_id, market_mode, limit).await
            {
                Ok(records) => {
                    let body = serde_json::to_string_pretty(&ApiResponse {
                        success: true,
                        data: Some(records),
                        error: None,
                    })
                    .unwrap_or_default();
                    (200, body)
                }
                Err(e) => {
                    let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                        success: false,
                        data: None,
                        error: Some(e),
                    })
                    .unwrap_or_default();
                    (500, body)
                }
            }
        }
        ("GET", "/items-history") => {
            let mode = get_query_param(&request, "mode").unwrap_or_else(|| "normal".to_string());
            let item_id = get_query_param(&request, "item_id");
            let limit: i32 = get_query_param(&request, "limit")
                .and_then(|s| s.parse().ok())
                .unwrap_or(24);

            let market_mode = if mode == "expert" {
                "season_expert"
            } else {
                "season_normal"
            };

            if let Some(item_id) = item_id {
                match db::get_items_history(
                    &state.db,
                    &item_id,
                    &state.config.season_id,
                    market_mode,
                    limit,
                )
                .await
                {
                    Ok(records) => {
                        let body = serde_json::to_string_pretty(&ApiResponse {
                            success: true,
                            data: Some(records),
                            error: None,
                        })
                        .unwrap_or_default();
                        (200, body)
                    }
                    Err(e) => {
                        let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                            success: false,
                            data: None,
                            error: Some(e),
                        })
                        .unwrap_or_default();
                        (500, body)
                    }
                }
            } else {
                let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                    success: false,
                    data: None,
                    error: Some("Missing item_id parameter".to_string()),
                })
                .unwrap_or_default();
                (400, body)
            }
        }
        ("GET", "/items-history-all") => {
            let mode = get_query_param(&request, "mode").unwrap_or_else(|| "normal".to_string());
            let limit: i32 = get_query_param(&request, "limit")
                .and_then(|s| s.parse().ok())
                .unwrap_or(99999);

            let market_mode = if mode == "expert" {
                "season_expert"
            } else {
                "season_normal"
            };

            match db::get_items_history_all(&state.db, &state.config.season_id, market_mode, limit)
                .await
            {
                Ok(records) => {
                    let body = serde_json::to_string_pretty(&ApiResponse {
                        success: true,
                        data: Some(records),
                        error: None,
                    })
                    .unwrap_or_default();
                    (200, body)
                }
                Err(e) => {
                    let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                        success: false,
                        data: None,
                        error: Some(e),
                    })
                    .unwrap_or_default();
                    (500, body)
                }
            }
        }
        ("GET", "/fire-history-all") => {
            let mode = get_query_param(&request, "mode").unwrap_or_else(|| "normal".to_string());
            let limit: i32 = get_query_param(&request, "limit")
                .and_then(|s| s.parse().ok())
                .unwrap_or(99999);

            let market_mode = if mode == "expert" {
                "season_expert"
            } else {
                "season_normal"
            };

            match db::get_fire_history_all(&state.db, &state.config.season_id, market_mode, limit)
                .await
            {
                Ok(records) => {
                    let body = serde_json::to_string_pretty(&ApiResponse {
                        success: true,
                        data: Some(records),
                        error: None,
                    })
                    .unwrap_or_default();
                    (200, body)
                }
                Err(e) => {
                    let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                        success: false,
                        data: None,
                        error: Some(e),
                    })
                    .unwrap_or_default();
                    (500, body)
                }
            }
        }
        ("GET", "/api-config") => {
            let body = serde_json::to_string_pretty(&ApiResponse {
                success: true,
                data: Some(&state.config.api_config),
                error: None,
            })
            .unwrap_or_default();
            (200, body)
        }
        ("GET", "/health") => (200, "OK".to_string()),

        // ─── 管理员 API ───────────────────────────────────────
        ("POST", "/admin/init-season") => {
            match serde_json::from_str::<InitSeasonRequest>(&request_body) {
                Ok(req) => {
                    if let Err(e) = verify_admin(&req.password, &state.config.admin_password) {
                        let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                            success: false,
                            data: None,
                            error: Some(e),
                        })
                        .unwrap_or_default();
                        (401, body)
                    } else {
                        match db::init_new_season(
                            &state.db,
                            &req.season_id,
                            req.season_name.as_deref(),
                        )
                        .await
                        {
                            Ok(tables) => {
                                let response = InitSeasonResponse {
                                    success: true,
                                    season_id: req.season_id.clone(),
                                    tables_created: tables,
                                    message: "新赛季初始化成功".to_string(),
                                };
                                let body = serde_json::to_string_pretty(&ApiResponse {
                                    success: true,
                                    data: Some(response),
                                    error: None,
                                })
                                .unwrap_or_default();
                                (200, body)
                            }
                            Err(e) => {
                                let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                                    success: false,
                                    data: None,
                                    error: Some(e),
                                })
                                .unwrap_or_default();
                                (500, body)
                            }
                        }
                    }
                }
                Err(e) => {
                    let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                        success: false,
                        data: None,
                        error: Some(format!("请求格式错误: {}", e)),
                    })
                    .unwrap_or_default();
                    (400, body)
                }
            }
        }
        ("POST", "/admin/update-api-config") => {
            match serde_json::from_str::<UpdateApiConfigRequest>(&request_body) {
                Ok(req) => {
                    if let Err(e) = verify_admin(&req.password, &state.config.admin_password) {
                        let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                            success: false,
                            data: None,
                            error: Some(e),
                        })
                        .unwrap_or_default();
                        (401, body)
                    } else {
                        let mut new_config = state.config.clone();
                        new_config.api_config = req.api_config;

                        if let Err(e) =
                            tl_monitor::server::config::save_config(CONFIG_PATH, &new_config)
                        {
                            let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                                success: false,
                                data: None,
                                error: Some(format!("保存配置失败: {}", e)),
                            })
                            .unwrap_or_default();
                            (500, body)
                        } else {
                            let body = serde_json::to_string_pretty(&ApiResponse {
                                success: true,
                                data: Some("API配置已更新，重启服务器后生效".to_string()),
                                error: None,
                            })
                            .unwrap_or_default();
                            (200, body)
                        }
                    }
                }
                Err(e) => {
                    let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                        success: false,
                        data: None,
                        error: Some(format!("请求格式错误: {}", e)),
                    })
                    .unwrap_or_default();
                    (400, body)
                }
            }
        }

        _ => {
            let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                success: false,
                data: None,
                error: Some("Not Found".to_string()),
            })
            .unwrap_or_default();
            (404, body)
        }
    };

    let origin = get_origin_header(&request);
    send_response(stream, status, &body, &origin, &state.cors_allowed_origins).await;
}

fn get_origin_header(request: &str) -> Option<String> {
    for line in request.lines() {
        if line.len() > 7 && (&line[..7]).eq_ignore_ascii_case("origin:") {
            return Some(line[7..].trim().to_string());
        }
    }
    None
}

async fn send_response(
    stream: tokio::net::TcpStream,
    status: u16,
    body: &str,
    origin: &Option<String>,
    allowed_origins: &[String],
) {
    let cors_header = if let Some(ref orig) = origin {
        if allowed_origins.is_empty() || allowed_origins.iter().any(|o| o == orig) {
            orig.clone()
        } else {
            warn!("CORS origin rejected: {}", orig);
            return send_error_response(stream, status, "CORS origin not allowed").await;
        }
    } else {
        return send_error_response(stream, status, "Missing origin header").await;
    };

    let response = format!(
        "HTTP/1.1 {} {}\r\n\
        Content-Type: application/json\r\n\
        Content-Length: {}\r\n\
        Access-Control-Allow-Origin: {}\r\n\
        Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
        Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
        \r\n\
        {}",
        status,
        if status == 200 { "OK" } else { "Error" },
        body.len(),
        cors_header,
        body
    );

    if let Err(e) = tokio::io::AsyncWriteExt::write_all(&mut tokio::io::BufWriter::new(stream), response.as_bytes()).await {
        warn!("发送响应失败: {}", e);
    }
}

async fn send_error_response(
    stream: tokio::net::TcpStream,
    status: u16,
    message: &str,
) {
    let response = format!(
        "HTTP/1.1 {} {}\r\n\
        Content-Type: text/plain\r\n\
        Content-Length: {}\r\n\
        \r\n\
        {}",
        status,
        if status == 200 { "OK" } else { "Error" },
        message.len(),
        message
    );

    if let Err(e) = tokio::io::AsyncWriteExt::write_all(&mut tokio::io::BufWriter::new(stream), response.as_bytes()).await {
        warn!("发送错误响应失败: {}", e);
    }
}

fn get_query_param(request: &str, param: &str) -> Option<String> {
    for line in request.lines() {
        if line.starts_with("GET") {
            if let Some(query_start) = line.find('?') {
                let query = &line[query_start + 1..line.find(' ').unwrap_or(query_start)];
                for pair in query.split('&') {
                    let kv: Vec<&str> = pair.splitn(2, '=').collect();
                    if kv.len() >= 1 && kv[0] == param {
                        let value = kv.get(1).unwrap_or(&"");
                        let decoded = urlencoding_decode(value);
                        return Some(decoded);
                    }
                }
            }
        }
    }
    None
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
                    continue;
                }
            }
            result.push('%');
            result.push_str(&hex);
        } else if c == '+' {
            result.push(' ');
        } else {
            result.push(c);
        }
    }
    result
}

fn get_next_collection_time() -> Option<i64> {
    let now = Utc::now();
    let next_hour = match (now + chrono::Duration::hours(1))
        .with_minute(0)
        .and_then(|t| t.with_second(0))
        .and_then(|t| t.with_nanosecond(0))
    {
        Some(t) => t,
        None => {
            error!("Failed to calculate next collection time");
            return None;
        }
    };
    Some(next_hour.timestamp())
}

async fn run_collector(state: Arc<ServerState>, mut abort_rx: broadcast::Receiver<()>) {
    info!("数据采集任务启动中...");

    let now = Utc::now();
    let next_hour = match (now + chrono::Duration::hours(1))
        .with_minute(0)
        .and_then(|t| t.with_second(0))
        .and_then(|t| t.with_nanosecond(0))
    {
        Some(t) => t,
        None => {
            error!("Failed to calculate next hour timestamp");
            return;
        }
    };
    let wait_secs = (next_hour - now).num_seconds();

    info!(
        "下次采集时间: {} ({} 秒后)",
        next_hour.format("%Y-%m-%d %H:%M:%S UTC"),
        wait_secs
    );

    info!("启动时执行首次采集...");
    collect_all_modes(&state).await;

    loop {
        tokio::select! {
            _ = abort_rx.recv() => {
                info!("收到关闭信号，退出采集循环");
                break;
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(SECONDS_PER_HOUR as u64)) => {
                collect_all_modes(&state).await;
            }
        }
    }
}

async fn collect_all_modes(state: &Arc<ServerState>) {
    let timestamp = match Utc::now()
        .with_minute(0)
        .and_then(|t| t.with_second(0))
        .and_then(|t| t.with_nanosecond(0))
    {
        Some(t) => t.timestamp(),
        None => {
            error!("Failed to calculate collection timestamp");
            return;
        }
    };

    let mut new_status = CollectionStatus::default();

    for scrape_mode in &state.config.scrape_modes {
        if !scrape_mode.enabled {
            continue;
        }

        let market_mode = if scrape_mode.mode == "expert" {
            "season_expert"
        } else {
            "season_normal"
        };

        info!(
            "[{}] 开始采集 {} 数据...",
            Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
            scrape_mode.mode
        );

        let mut mode_status = ModeCollectionStatus {
            timestamp,
            fire_success: false,
            fire_price: None,
            items_count: 0,
            items_success: false,
            error: None,
        };

        let mut fire_per_rmb = 0.0;

        match Scraper::scrape_fire_price(market_mode, &state.config.api_config).await {
            Ok(fire) => {
                mode_status.fire_success = true;
                mode_status.fire_price = Some(fire.rmb_per_10k_fire);
                fire_per_rmb = fire.fire_per_rmb;

                if let Err(e) = db::insert_fire_snapshot(
                    &state.db,
                    &state.config.season_id,
                    market_mode,
                    &fire,
                    timestamp,
                )
                .await
                {
                    mode_status.error = Some(format!("DB error: {}", e));
                }
            }
            Err(e) => {
                mode_status.error = Some(format!("Fire scrape error: {}", e));
            }
        }

        if fire_per_rmb > 0.0 {
            match Scraper::scrape_items(
                &state.config.season_id,
                market_mode,
                &state.config.api_config,
            )
            .await
            {
                Ok(items) => {
                    mode_status.items_success = true;
                    mode_status.items_count = items.len();

                    if let Err(e) = db::insert_items_snapshots(
                        &state.db,
                        &state.config.season_id,
                        market_mode,
                        fire_per_rmb,
                        &items,
                        timestamp,
                    )
                    .await
                    {
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
        } else {
            if mode_status.error.is_none() {
                mode_status.error = Some("Skip items: no fire price".to_string());
            }
        }

        info!(
            "[{}] {} 采集完成: 火价={}, 物品={}",
            Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
            scrape_mode.mode,
            mode_status
                .fire_price
                .map(|p| p.to_string())
                .unwrap_or_else(|| "失败".to_string()),
            mode_status.items_count
        );

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

    info!(
        "[{}] 本次采集完成",
        Utc::now().format("%Y-%m-%d %H:%M:%S UTC")
    );
}
