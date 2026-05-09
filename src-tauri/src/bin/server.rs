//! TL Monitor Server - 独立数据采集服务器 v3.3
//!
//! 支持同时采集普通服和专家服数据
//! 支持管理员操作（需要密码验证）
//!
//! 优化特性：
//! - HTTP Client 连接复用
//! - API 端点可配置
//! - 请求限流保护
//! - 日志脱敏
//!
//! 运行方式：
//!   cargo run --bin server

use chrono::{Timelike, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tl_monitor::core::constants::{SECONDS_PER_HOUR, SERVER_VERSION};
use tokio::io::AsyncWriteExt;
use tokio::sync::{broadcast, RwLock};
use tracing::{error, info, warn, Level};
use tracing_subscriber::FmtSubscriber;

use tl_monitor::server::config::{ApiConfig, RateLimitConfig, ServerConfig};
use tl_monitor::server::db;
use tl_monitor::server::scraper::Scraper;

const DB_PATH: &str = "/data/tl_monitor.db";

fn get_config_path() -> String {
    std::env::var("TL_CONFIG_PATH").unwrap_or_else(|_| CONFIG_PATH.to_string())
}

const CONFIG_PATH: &str = "/config/server_config.yaml";

#[derive(Clone)]
struct ServerState {
    config: ServerConfig,
    db: SqlitePool,
    last_collection: Arc<RwLock<CollectionStatus>>,
    rate_limiter: Arc<RwLock<RateLimiter>>,
}

struct RateLimiter {
    requests: HashMap<String, Vec<Instant>>,
    config: RateLimitConfig,
}

impl RateLimiter {
    fn new(config: RateLimitConfig) -> Self {
        Self {
            requests: HashMap::new(),
            config,
        }
    }

    fn is_allowed(&mut self, client_ip: &str) -> bool {
        if !self.config.enabled {
            return true;
        }

        let now = Instant::now();
        let window = Duration::from_secs(60);

        let requests = self.requests.entry(client_ip.to_string()).or_default();

        requests.retain(|t| now.duration_since(*t) < window);

        if requests.len() >= self.config.requests_per_minute as usize {
            return false;
        }

        requests.push(now);
        true
    }
}

#[derive(Clone, Default, Serialize)]
struct CollectionStatus {
    normal: Option<ModeCollectionStatus>,
    expert: Option<ModeCollectionStatus>,
}

#[derive(Clone, Serialize)]
struct ModeCollectionStatus {
    timestamp: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    fire_success: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fire_price: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    items_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    items_success: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(rename = "is_success", skip_serializing_if = "Option::is_none")]
    collection_success: Option<bool>,
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
    #[serde(default)]
    season_name: Option<String>,
    #[serde(default)]
    started_at: Option<i64>,
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
    info!(
        "TL Monitor Server v{} - 支持普通服+专家服+管理员API",
        SERVER_VERSION
    );
    info!("==============================================");

    let config = match tl_monitor::server::config::load_config(&*get_config_path()) {
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
            info!(
                "限流配置: enabled={}, requests_per_minute={}",
                cfg.rate_limit.enabled, cfg.rate_limit.requests_per_minute
            );
            info!(
                "API端点: luosi={}, qiandao={}",
                mask_url_for_log(&cfg.api_endpoints.luosi),
                mask_url_for_log(&cfg.api_endpoints.qiandao)
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
        rate_limiter: Arc::new(RwLock::new(RateLimiter::new(config.rate_limit.clone()))),
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
    let len = a.len().max(b.len());
    let mut result = 0u8;
    for i in 0..len {
        let x = a.get(i).unwrap_or(&0);
        let y = b.get(i).unwrap_or(&0);
        result |= x ^ y;
    }
    result == 0 && a.len() == b.len()
}

async fn handle_request(
    stream: tokio::net::TcpStream,
    client_addr: std::net::SocketAddr,
    state: Arc<ServerState>,
    start_time: i64,
) {
    use tokio::io::AsyncReadExt;

    let client_ip = client_addr.ip().to_string();

    {
        let mut limiter = state.rate_limiter.write().await;
        if !limiter.is_allowed(&client_ip) {
            warn!("客户端 {} 请求过于频繁，已限流", client_ip);
            let response = "HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/plain\r\nContent-Length: 29\r\n\r\nRate limit exceeded, try again";
            let _ = tokio::io::AsyncWriteExt::write_all(
                &mut tokio::io::BufWriter::new(stream),
                response.as_bytes(),
            )
            .await;
            return;
        }
    }

    let mut stream = stream;
    let mut buffer = Vec::new();
    let mut temp = [0u8; 4096];
    let mut header_complete = false;
    let mut content_length = 0usize;
    let mut header_end_pos = 0usize;

    loop {
        match stream.read(&mut temp).await {
            Ok(0) => {
                if !header_complete && buffer.is_empty() {
                    return;
                }
                break;
            }
            Ok(n) => {
                buffer.extend_from_slice(&temp[..n]);

                if !header_complete {
                    if let Some(pos) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
                        header_complete = true;
                        header_end_pos = pos + 4;

                        let header_str = String::from_utf8_lossy(&buffer[..header_end_pos]);
                        for line in header_str.lines() {
                            if line.to_lowercase().starts_with("content-length:") {
                                content_length = line
                                    .split(':')
                                    .nth(1)
                                    .unwrap_or("0")
                                    .trim()
                                    .parse()
                                    .unwrap_or(0);
                            }
                        }
                    }
                }

                if header_complete {
                    let total_expected = header_end_pos + content_length;
                    if buffer.len() >= total_expected {
                        break;
                    }
                }

                if buffer.len() >= 65536 {
                    warn!("请求体超过 64KB 限制");
                    let response = "HTTP/1.1 413 Payload Too Large\r\nContent-Type: text/plain\r\nContent-Length: 18\r\n\r\nPayload too large";
                    let _ = tokio::io::AsyncWriteExt::write_all(
                        &mut tokio::io::BufWriter::new(&mut stream),
                        response.as_bytes(),
                    )
                    .await;
                    return;
                }
            }
            Err(e) => {
                warn!("读取请求失败: {}", e);
                return;
            }
        }
    }

    if header_complete && content_length > 0 {
        let expected_body_len = header_end_pos + content_length;
        if buffer.len() < expected_body_len {
            warn!(
                "请求 body 不完整: 期望 {} 字节，实际收到 {} 字节",
                content_length,
                buffer.len() - header_end_pos
            );
            let response = "HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nContent-Length: 26\r\n\r\nIncomplete request body";
            let _ = tokio::io::AsyncWriteExt::write_all(
                &mut tokio::io::BufWriter::new(stream),
                response.as_bytes(),
            )
            .await;
            return;
        }
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
    let target = parts[1];
    let (path, query_string) = target.split_once('?').unwrap_or((target, ""));

    info!(
        "HTTP {} {} from {} (query: {:?})",
        method, path, client_ip, query_string
    );

    let mut request_body = String::new();
    if content_length > 0 && header_end_pos < buffer.len() {
        request_body =
            String::from_utf8_lossy(&buffer[header_end_pos..header_end_pos + content_length])
                .to_string();
    }

    let (status, body) = match (method, path) {
        ("OPTIONS", _) => {
            let origin = get_origin_header(&request);
            let cors_header = if let Some(ref orig) = origin {
                if state.config.cors_allowed_origins.is_empty()
                    || state.config.cors_allowed_origins.iter().any(|o| o == orig)
                {
                    orig.clone()
                } else {
                    warn!("CORS origin rejected: {}", orig);
                    return send_options_response(stream, "CORS origin not allowed").await;
                }
            } else {
                state
                    .config
                    .cors_allowed_origins
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "http://localhost:8080".to_string())
            };
            return send_options_response_with_cors(stream, &cors_header).await;
        }
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
        ("GET", "/admin.html") | ("GET", "/admin") => {
            let html = include_str!("../server/admin.html");
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
                html.len(),
                html
            );
            let _ = tokio::io::AsyncWriteExt::write_all(
                &mut tokio::io::BufWriter::new(stream),
                response.as_bytes(),
            )
            .await;
            return;
        }
        ("GET", "/api/admin/status") => {
            let body = serde_json::to_string_pretty(&ApiResponse {
                success: true,
                data: Some(serde_json::json!({
                    "version": SERVER_VERSION,
                    "uptime_seconds": Utc::now().timestamp() - start_time,
                    "season_id": state.config.season_id,
                    "last_collection": state.last_collection.read().await.clone(),
                    "next_collection": get_next_collection_time(),
                })),
                error: None,
            })
            .unwrap_or_default();
            (200, body)
        }
        ("POST", "/api/admin/status") => {
            #[derive(serde::Deserialize)]
            struct StatusRequest {
                password: String,
            }
            match serde_json::from_str::<StatusRequest>(&request_body) {
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
                        let body = serde_json::to_string_pretty(&ApiResponse {
                            success: true,
                            data: Some(serde_json::json!({
                                "version": SERVER_VERSION,
                                "uptime_seconds": Utc::now().timestamp() - start_time,
                                "season_id": state.config.season_id,
                                "last_collection": state.last_collection.read().await.clone(),
                                "next_collection": get_next_collection_time(),
                                "config": {
                                    "season_id": state.config.season_id,
                                    "http_port": state.config.http_port,
                                    "cors_allowed_origins": state.config.cors_allowed_origins,
                                    "rate_limit": state.config.rate_limit,
                                    "api_config": state.config.api_config,
                                }
                            })),
                            error: None,
                        })
                        .unwrap_or_default();
                        (200, body)
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
        ("GET", "/api/admin/config") => {
            let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                success: false,
                data: None,
                error: Some("此接口需要管理员密码，请使用 POST /api/admin/config".to_string()),
            })
            .unwrap_or_default();
            (401, body)
        }
        ("POST", "/api/admin/config") => {
            #[derive(serde::Deserialize)]
            struct ConfigRequest {
                password: String,
            }
            match serde_json::from_str::<ConfigRequest>(&request_body) {
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
                        let body = serde_json::to_string_pretty(&ApiResponse {
                            success: true,
                            data: Some(serde_json::json!({
                                "season_id": state.config.season_id,
                                "http_port": state.config.http_port,
                                "cors_allowed_origins": state.config.cors_allowed_origins,
                                "rate_limit": state.config.rate_limit,
                                "api_config": state.config.api_config,
                                "scrape_modes": state.config.scrape_modes,
                            })),
                            error: None,
                        })
                        .unwrap_or_default();
                        (200, body)
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
        ("POST", "/api/admin/update-config") => {
            #[derive(serde::Deserialize)]
            struct ScrapeModeConfig {
                mode: String,
                enabled: bool,
            }
            #[derive(serde::Deserialize)]
            struct UpdateConfigRequest {
                password: Option<String>,
                cors_allowed_origins: Option<Vec<String>>,
                rate_limit_enabled: Option<bool>,
                scrape_modes: Option<Vec<ScrapeModeConfig>>,
            }
            match serde_json::from_str::<UpdateConfigRequest>(&request_body) {
                Ok(req) => {
                    if let Some(password) = &req.password {
                        if let Err(e) = verify_admin(password, &state.config.admin_password) {
                            let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                                success: false,
                                data: None,
                                error: Some(e),
                            })
                            .unwrap_or_default();
                            (401, body)
                        } else {
                            let mut new_config = state.config.clone();
                            if let Some(cors) = req.cors_allowed_origins {
                                new_config.cors_allowed_origins = cors;
                            }
                            if let Some(enabled) = req.rate_limit_enabled {
                                new_config.rate_limit.enabled = enabled;
                            }
                            if let Some(modes) = req.scrape_modes {
                                new_config.scrape_modes = modes
                                    .into_iter()
                                    .map(|m| tl_monitor::server::config::ScrapeMode {
                                        mode: m.mode,
                                        enabled: m.enabled,
                                    })
                                    .collect();
                            }
                            if let Err(e) = tl_monitor::server::config::save_config(
                                &*get_config_path(),
                                &new_config,
                            ) {
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
                                    data: Some("配置已保存，重启后生效".to_string()),
                                    error: None,
                                })
                                .unwrap_or_default();
                                (200, body)
                            }
                        }
                    } else {
                        let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                            success: false,
                            data: None,
                            error: Some("缺少密码".to_string()),
                        })
                        .unwrap_or_default();
                        (400, body)
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
        ("GET", "/fire-history") => {
            let mode =
                get_query_param(query_string, "mode").unwrap_or_else(|| "normal".to_string());
            let limit: i32 = get_query_param(query_string, "limit")
                .and_then(|s| s.parse().ok())
                .unwrap_or(99999);

            let min_day: Option<i32> = get_query_param(query_string, "min_day")
                .and_then(|s| s.parse().ok());
            let max_day: Option<i32> = get_query_param(query_string, "max_day")
                .and_then(|s| s.parse().ok());

            let market_mode = if mode == "expert" {
                "season_expert"
            } else {
                "season_normal"
            };

            let season_id = get_query_param(query_string, "season")
                .unwrap_or_else(|| state.config.season_id.clone());

            if let Err(e) = db::validate_season_id(&season_id) {
                let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                    success: false,
                    data: None,
                    error: Some(e),
                })
                .unwrap_or_default();
                (400, body)
            } else {
                match db::get_fire_history(&state.db, &season_id, market_mode, limit, min_day, max_day).await {
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
        }
        ("GET", "/items-history") => {
            let mode =
                get_query_param(query_string, "mode").unwrap_or_else(|| "normal".to_string());
            let item_id = get_query_param(query_string, "item_id");
            let limit: i32 = get_query_param(query_string, "limit")
                .and_then(|s| s.parse().ok())
                .unwrap_or(24);

            let market_mode = if mode == "expert" {
                "season_expert"
            } else {
                "season_normal"
            };

            let season_id = get_query_param(query_string, "season")
                .unwrap_or_else(|| state.config.season_id.clone());

            if let Some(item_id) = item_id {
                if let Err(e) = db::validate_season_id(&season_id) {
                    let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                        success: false,
                        data: None,
                        error: Some(e),
                    })
                    .unwrap_or_default();
                    (400, body)
                } else {
                    match db::get_items_history(&state.db, &item_id, &season_id, market_mode, limit)
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
            let mode =
                get_query_param(query_string, "mode").unwrap_or_else(|| "normal".to_string());
            let limit: i32 = get_query_param(query_string, "limit")
                .and_then(|s| s.parse().ok())
                .unwrap_or(99999);
            let offset: i32 = get_query_param(query_string, "offset")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);

            let min_day: Option<i32> = get_query_param(query_string, "min_day")
                .and_then(|s| s.parse().ok());
            let max_day: Option<i32> = get_query_param(query_string, "max_day")
                .and_then(|s| s.parse().ok());

            let market_mode = if mode == "expert" {
                "season_expert"
            } else {
                "season_normal"
            };

            let season_id = get_query_param(query_string, "season")
                .unwrap_or_else(|| state.config.season_id.clone());

            if let Err(e) = db::validate_season_id(&season_id) {
                let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                    success: false,
                    data: None,
                    error: Some(e),
                })
                .unwrap_or_default();
                (400, body)
            } else {
                match db::get_items_history_all(&state.db, &season_id, market_mode, limit, offset, min_day, max_day).await
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
        }
        ("GET", "/fire-history-all") => {
            let mode =
                get_query_param(query_string, "mode").unwrap_or_else(|| "normal".to_string());
            let limit: i32 = get_query_param(query_string, "limit")
                .and_then(|s| s.parse().ok())
                .unwrap_or(99999);
            let offset: i32 = get_query_param(query_string, "offset")
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);

            let market_mode = if mode == "expert" {
                "season_expert"
            } else {
                "season_normal"
            };

            let season_id = get_query_param(query_string, "season")
                .unwrap_or_else(|| state.config.season_id.clone());

            if let Err(e) = db::validate_season_id(&season_id) {
                let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                    success: false,
                    data: None,
                    error: Some(e),
                })
                .unwrap_or_default();
                (400, body)
            } else {
                match db::get_fire_history_all(&state.db, &season_id, market_mode, limit, offset).await
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
        }
        ("GET", "/health") => (200, "OK".to_string()),
        ("GET", "/season-start") => {
            let season_id = get_query_param(query_string, "season")
                .unwrap_or_else(|| state.config.season_id.clone());
            let season_start =
                tl_monitor::server::db::get_season_start_time(&state.db, &season_id).await;
            let body = serde_json::to_string_pretty(&ApiResponse {
                success: true,
                data: Some(serde_json::json!({
                    "season_id": season_id,
                    "started_at": season_start
                })),
                error: None,
            })
            .unwrap_or_default();
            (200, body)
        }
        ("GET", "/stats") => {
            let season_id = get_query_param(query_string, "season")
                .unwrap_or_else(|| state.config.season_id.clone());
            match tl_monitor::server::db::get_season_stats(&state.db, &season_id).await {
                Ok(stats) => {
                    let body = serde_json::to_string_pretty(&ApiResponse {
                        success: true,
                        data: Some(stats),
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
        ("GET", "/seasons") => {
            let seasons = tl_monitor::server::db::get_all_seasons_list(&state.db).await;
            let body = serde_json::to_string_pretty(&ApiResponse {
                success: true,
                data: Some(seasons),
                error: None,
            })
            .unwrap_or_default();
            (200, body)
        }

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
                            req.started_at,
                        )
                        .await
                        {
                            Ok(tables) => {
                                // 初始化成功后立即触发一次采集
                                info!("新赛季 {} 初始化成功，触发首次采集", req.season_id);
                                let state_clone = state.clone();
                                tokio::spawn(async move {
                                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                                    collect_all_modes(&state_clone).await;
                                });

                                let response = InitSeasonResponse {
                                    success: true,
                                    season_id: req.season_id.clone(),
                                    tables_created: tables,
                                    message: "新赛季初始化成功，已触发首次采集".to_string(),
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
        ("POST", "/admin/archive-season") => {
            match serde_json::from_str::<serde_json::Value>(&request_body) {
                Ok(req) => {
                    let password = req["password"].as_str().unwrap_or("");
                    if let Err(e) = verify_admin(password, &state.config.admin_password) {
                        let body = serde_json::to_string_pretty(&ApiResponse::<()> {
                            success: false,
                            data: None,
                            error: Some(e),
                        })
                        .unwrap_or_default();
                        (401, body)
                    } else {
                        let season_id = req["season_id"].as_str().unwrap_or("");
                        match db::archive_season(&state.db, season_id).await {
                            Ok(_) => {
                                let body = serde_json::to_string_pretty(&ApiResponse {
                                    success: true,
                                    data: Some(serde_json::json!({"archived": season_id})),
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

                        if let Err(e) = tl_monitor::server::config::save_config(
                            &*get_config_path(),
                            &new_config,
                        ) {
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
        ("POST", "/admin/reset-table") => {
            #[derive(serde::Deserialize)]
            struct ResetTableRequest {
                password: String,
                season_id: String,
                table_type: String,
                market_mode: String,
            }
            match serde_json::from_str::<ResetTableRequest>(&request_body) {
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
                        match db::reset_table(&state.db, &req.season_id, &req.table_type, &req.market_mode).await {
                            Ok(_) => {
                                let body = serde_json::to_string_pretty(&ApiResponse {
                                    success: true,
                                    data: Some(format!("表已重置: {}_{}_{}", req.season_id, req.table_type, req.market_mode)),
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
        ("POST", "/admin/reset-season") => {
            #[derive(serde::Deserialize)]
            struct ResetSeasonRequest {
                password: String,
                season_id: String,
                tables: Vec<String>,
            }
            match serde_json::from_str::<ResetSeasonRequest>(&request_body) {
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
                        match db::reset_season_tables(&state.db, &req.season_id, &req.tables).await {
                            Ok(results) => {
                                let body = serde_json::to_string_pretty(&ApiResponse {
                                    success: true,
                                    data: Some(serde_json::json!({ "results": results })),
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
    send_response(
        stream,
        status,
        &body,
        &origin,
        &state.config.cors_allowed_origins,
    )
    .await;
}

fn get_origin_header(request: &str) -> Option<String> {
    for line in request.lines() {
        if line.len() > 7 && line[..7].eq_ignore_ascii_case("origin:") {
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
        allowed_origins
            .first()
            .cloned()
            .unwrap_or_else(|| "http://localhost:8080".to_string())
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

    let mut buf_writer = tokio::io::BufWriter::new(stream);
    if let Err(e) = buf_writer.write_all(response.as_bytes()).await {
        warn!("发送响应失败: {}", e);
        return;
    }
    if let Err(e) = buf_writer.flush().await {
        warn!("刷新响应失败: {}", e);
    }
}

async fn send_error_response(stream: tokio::net::TcpStream, status: u16, message: &str) {
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

    let mut buf_writer = tokio::io::BufWriter::new(stream);
    if let Err(e) = buf_writer.write_all(response.as_bytes()).await {
        warn!("发送错误响应失败: {}", e);
        return;
    }
    if let Err(e) = buf_writer.flush().await {
        warn!("刷新错误响应失败: {}", e);
    }
}

async fn send_options_response(stream: tokio::net::TcpStream, message: &str) {
    let response = format!(
        "HTTP/1.1 403 Forbidden\r\n\
        Content-Type: text/plain\r\n\
        Content-Length: {}\r\n\
        \r\n\
        {}",
        message.len(),
        message
    );
    let mut buf_writer = tokio::io::BufWriter::new(stream);
    let _ = buf_writer.write_all(response.as_bytes()).await;
    let _ = buf_writer.flush().await;
}

async fn send_options_response_with_cors(stream: tokio::net::TcpStream, cors_header: &str) {
    let response = format!(
        "HTTP/1.1 204 No Content\r\n\
        Access-Control-Allow-Origin: {}\r\n\
        Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
        Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
        Access-Control-Max-Age: 86400\r\n\
        \r\n\
        ",
        cors_header
    );
    let mut buf_writer = tokio::io::BufWriter::new(stream);
    let _ = buf_writer.write_all(response.as_bytes()).await;
    let _ = buf_writer.flush().await;
}

fn get_query_param(query_string: &str, param: &str) -> Option<String> {
    for pair in query_string.split('&') {
        let kv: Vec<&str> = pair.splitn(2, '=').collect();
        if !kv.is_empty() && kv[0] == param {
            let value = kv.get(1).unwrap_or(&"");
            let decoded = urlencoding_decode(value);
            return Some(decoded);
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
    // 检查是否有当前活跃赛季
    match db::get_current_season(&state.db).await {
        Some(current_season) => {
            info!("当前活跃赛季: {}，开始采集", current_season);
        }
        None => {
            info!("没有活跃的赛季（已全部归档），采集任务暂停");
            return;
        }
    }

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
            fire_success: Some(false),
            fire_price: None,
            items_count: None,
            items_success: Some(false),
            error: None,
            collection_success: None,
        };

        let mut fire_per_rmb = 0.0;

        match Scraper::scrape_fire_price(
            market_mode,
            &state.config.api_config,
            &state.config.api_endpoints,
        )
        .await
        {
            Ok(fire) => {
                mode_status.fire_success = Some(true);
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

        let items_result = Scraper::scrape_items(
            &state.config.season_id,
            market_mode,
            &state.config.api_config,
            &state.config.api_endpoints,
        )
        .await;

        match items_result {
            Ok(items) => {
                mode_status.items_success = Some(true);
                mode_status.items_count = Some(items.len());

                let price_for_calc = if fire_per_rmb > 0.0 {
                    fire_per_rmb
                } else {
                    1.0
                };

                if let Err(e) = db::insert_items_snapshots(
                    &state.db,
                    &state.config.season_id,
                    market_mode,
                    price_for_calc,
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

        info!(
            "[{}] {} 采集完成: 火价={}, 物品={}",
            Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
            scrape_mode.mode,
            mode_status
                .fire_price
                .map(|p| p.to_string())
                .unwrap_or_else(|| "失败".to_string()),
            mode_status.items_count.unwrap_or(0)
        );

        let final_success =
            mode_status.fire_success == Some(true) && mode_status.items_success == Some(true);
        mode_status.collection_success = Some(final_success);

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

fn mask_url_for_log(url: &str) -> String {
    url.replace("api.qiandao.com", "***")
        .replace("115.231.176.101", "***")
}
