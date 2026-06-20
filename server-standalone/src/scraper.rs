//! 数据抓取模块
//!
//! 使用客户端的 scraper::qiandao 模块进行火价采集
//! 物品火价采集

use once_cell::sync::Lazy;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tokio::time::timeout;
use tracing::{debug, info, warn};

use super::config::{ApiConfig, ApiEndpoints};

const QIANDAO_PACKAGE_ID: &str = "1044";
const QIANDAO_SIGN_VERSION: &str = "v1";
const QIANDAO_SIGN_TYPE: &str = "HMAC_SHA256";
const QIANDAO_ORIGIN: &str = "https://qiandao.com";
const QIANDAO_REFERER: &str = "https://qiandao.com/";
const QIANDAO_USER_AGENT: &str = "Mozilla/5.0";
const QIANDAO_ECHO_REGION: &str = "CN";
const QIANDAO_DEFAULT_TOKEN: &str = "Bearer undefined";

fn safe_truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        let mut end = max_len;
        while end > 0 && !s.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}...", &s[..end])
    }
}

fn build_http_client(timeout_secs: u64) -> Result<Client, String> {
    let builder = Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .pool_max_idle_per_host(10)
        .tcp_keepalive(Some(Duration::from_secs(60)))
        .tcp_nodelay(true);

    let skip_cert_verify = std::env::var("TL_SKIP_CERT_VERIFY")
        .map(|v| v == "1" || v.to_lowercase() == "true")
        .unwrap_or(false);

    let builder = if skip_cert_verify {
        warn!("跳过 HTTPS 证书验证 (TL_SKIP_CERT_VERIFY=1)");
        builder.danger_accept_invalid_certs(true)
    } else {
        builder
    };
    builder
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))
}

static HTTP_CLIENT: Lazy<Result<Client, String>> = Lazy::new(|| build_http_client(30));
static QIANDAO_CLIENT: Lazy<Result<Client, String>> = Lazy::new(|| build_http_client(15));

fn http_client() -> Result<&'static Client, String> {
    HTTP_CLIENT.as_ref().map_err(|e| e.clone())
}

fn qiandao_client() -> Result<&'static Client, String> {
    QIANDAO_CLIENT.as_ref().map_err(|e| e.clone())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirePriceSnapshot {
    pub rmb_per_10k_fire: f64,
    pub fire_per_rmb: f64,
    pub increase_ratio: f64,
    pub trading_volume: String,
    pub source: String,
    pub source_time: String,
    pub scraped_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct LuosiItem {
    name: String,
    #[serde(rename = "price")]
    item_price: Option<f64>,
    #[serde(rename = "type")]
    item_type: Option<String>,
    #[serde(rename = "is_placeholder")]
    #[allow(dead_code)]
    is_placeholder: Option<bool>,
    last_time: Option<i64>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Item {
    pub item_id: String,
    pub name: String,
    pub item_type: String,
    pub price: f64,
    pub last_time: i64,
}

const SCRAPE_MAX_RETRIES: u32 = 3;
const SCRAPE_RETRY_DELAY_MS: u64 = 1000;

pub struct Scraper;

impl Scraper {
    pub async fn scrape_items(
        _season_id: &str,
        market_mode: &str,
        config: &ApiConfig,
        endpoints: &ApiEndpoints,
    ) -> Result<Vec<Item>, String> {
        let luosi_season_id = if market_mode.contains("expert") {
            config.luosi_season_id_expert
        } else {
            config.luosi_season_id_normal
        };

        let url = format!("{}/get?season_id={}", endpoints.luosi, luosi_season_id);
        info!("抓取物品: {}", mask_url_for_log(&url));

        let resp = http_client()?
            .get(&url)
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("API 返回错误状态: {}", resp.status()));
        }

        let map: HashMap<String, LuosiItem> = resp
            .json()
            .await
            .map_err(|e| format!("JSON 解析失败: {}", e))?;

        let raw_count = map.len();

        let now = chrono::Utc::now().timestamp();
        let items: Vec<Item> = map
            .into_iter()
            .map(|(item_id, item)| Item {
                item_id,
                name: item.name,
                item_type: item.item_type.unwrap_or_default(),
                price: item.item_price.unwrap_or(0.0),
                last_time: item.last_time.unwrap_or(now),
            })
            .collect();

        debug!("抓取物品: 总数={}", raw_count);
        Ok(items)
    }

    pub async fn scrape_fire_price(
        market_mode: &str,
        config: &ApiConfig,
        endpoints: &ApiEndpoints,
    ) -> Result<FirePriceSnapshot, String> {
        let mode = if market_mode.contains("expert") {
            "专家"
        } else {
            "普通"
        };
        debug!("抓取火价 (模式: {})", mode);

        let mut last_error = String::new();

        for attempt in 1..=SCRAPE_MAX_RETRIES {
            match scrape_via_rust(mode, config, endpoints).await {
                Ok(snapshot) => {
                    debug!("火价获取成功: {} 火/元", snapshot.fire_per_rmb);
                    return Ok(snapshot);
                }
                Err(rust_e) => {
                    last_error = rust_e;
                    warn!(
                        "Rust 火价抓取失败 (尝试 {}/{}): {}，尝试 Node 脚本",
                        attempt, SCRAPE_MAX_RETRIES, last_error
                    );

                    match scrape_via_node_script(mode).await {
                        Ok(snapshot) => {
                            debug!("Node 脚本火价获取成功: {} 火/元", snapshot.fire_per_rmb);
                            return Ok(snapshot);
                        }
                        Err(node_e) => {
                            warn!("Node 脚本火价抓取失败: {}", node_e);
                            if attempt < SCRAPE_MAX_RETRIES {
                                info!("{}ms 后重试...", SCRAPE_RETRY_DELAY_MS);
                                tokio::time::sleep(Duration::from_millis(SCRAPE_RETRY_DELAY_MS))
                                    .await;
                            }
                        }
                    }
                }
            }
        }

        Err(format!(
            "火价抓取在 {} 次尝试后仍失败 (最后 Rust 错误: {})",
            SCRAPE_MAX_RETRIES, last_error
        ))
    }
}

async fn scrape_via_rust(
    mode: &str,
    config: &ApiConfig,
    endpoints: &ApiEndpoints,
) -> Result<FirePriceSnapshot, String> {
    let (tag_id, spec_id) = if mode == "专家" {
        (
            config.qiandao_tag_id_expert.as_str(),
            config.qiandao_spec_id_expert.to_string(),
        )
    } else {
        (
            config.qiandao_tag_id_normal.as_str(),
            config.qiandao_spec_id_normal.to_string(),
        )
    };

    let qiandao_url = format!("{}{}", endpoints.qiandao, endpoints.qiandao_fire_endpoint);
    let timestamp = chrono::Utc::now().timestamp_millis().to_string();
    let body = serde_json::json!({
        "tagId": tag_id,
        "offset": 0,
        "limit": 20,
        "specIds": [spec_id]
    });

    let resp = qiandao_client()?
        .post(&qiandao_url)
        .header("content-type", "application/json")
        .header("authorization", QIANDAO_DEFAULT_TOKEN)
        .header("x-request-timestamp", &timestamp)
        .header("x-request-sign-type", QIANDAO_SIGN_TYPE)
        .header("x-request-sign-version", QIANDAO_SIGN_VERSION)
        .header("x-request-package-id", QIANDAO_PACKAGE_ID)
        .header("origin", QIANDAO_ORIGIN)
        .header("referer", QIANDAO_REFERER)
        .header("user-agent", QIANDAO_USER_AGENT)
        .header("x-echo-region", QIANDAO_ECHO_REGION)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("HTTP response read failed: {}", e))?;

    info!(
        "火价API响应: status={}, body={}",
        status,
        safe_truncate(&text, 300)
    );

    if !status.is_success() {
        return Err(format!(
            "Qiandao HTTP status error: {} | body: {}",
            status,
            safe_truncate(&text, 200)
        ));
    }

    let data: QiandaoResponse = serde_json::from_str(&text).map_err(|e| {
        format!(
            "JSON parse error: {} | body: {}",
            e,
            safe_truncate(&text, 200)
        )
    })?;

    parse_qiandao_response(data, mode)
}

async fn scrape_via_node_script(mode: &str) -> Result<FirePriceSnapshot, String> {
    let mut possible_scripts: Vec<std::path::PathBuf> = vec![];

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            possible_scripts.push(parent.join("resources/qiandao_fire.cjs"));
            possible_scripts.push(parent.join("resources/qiandao_fire.mjs"));
        }
    }

    possible_scripts.push(std::path::PathBuf::from("resources/qiandao_fire.cjs"));
    possible_scripts.push(std::path::PathBuf::from("resources/qiandao_fire.mjs"));

    if let Ok(dir) = std::env::var("TL_RESOURCES_DIR") {
        possible_scripts.push(std::path::PathBuf::from(dir.clone()).join("qiandao_fire.cjs"));
        possible_scripts.push(std::path::PathBuf::from(dir).join("qiandao_fire.mjs"));
    }

    let script_path = possible_scripts
        .iter()
        .find(|p| p.exists())
        .cloned()
        .ok_or_else(|| {
            let paths_str = possible_scripts
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join(", ");
            format!("Node.js script not found. Tried: {}", paths_str)
        })?;

    debug!("使用 Node 脚本抓取火价: {}", script_path.display());

    let mut cmd = tokio::process::Command::new("node");
    cmd.arg(&script_path)
        .arg(if mode == "专家" { "pro" } else { "normal" });

    debug!(
        "执行命令: node {} {}",
        script_path.display(),
        if mode == "专家" { "pro" } else { "normal" }
    );

    const NODE_SCRIPT_TIMEOUT_SECS: u64 = 30;
    let output = timeout(Duration::from_secs(NODE_SCRIPT_TIMEOUT_SECS), cmd.output())
        .await
        .map_err(|_| format!("Node.js script 执行超时 ({}秒)", NODE_SCRIPT_TIMEOUT_SECS))?
        .map_err(|e| format!("Node execution failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout_str = stdout.trim();
    let stderr_str = stderr.trim();

    debug!("Node stdout: {}", stdout_str);
    debug!("Node stderr: {}", stderr_str);
    debug!("Node exit code: {:?}", output.status.code());

    if !output.status.success() {
        return Err(format!(
            "Node.js script exited with code {:?}: {}",
            output.status.code(),
            stderr_str
        ));
    }

    let mut json_str = stdout_str.to_string();

    if (json_str.starts_with("{\"error\"") || json_str.is_empty() || json_str == "null")
        && stderr_str.contains("fire_per_rmb")
    {
        let lines: Vec<&str> = stderr_str.lines().collect();
        for line in lines.iter().rev() {
            if line.starts_with('{') && line.contains("fire_per_rmb") {
                json_str = line.to_string();
                break;
            }
        }
    }

    if !json_str.starts_with('{') || json_str.starts_with("{\"error\"") {
        return Err("No fire price data in Node output".to_string());
    }

    debug!("使用 JSON: {}", json_str);
    debug!("解析 Node 输出...");

    #[derive(Deserialize)]
    #[allow(dead_code)]
    struct NodeFireResult {
        error: Option<String>,
        fire_per_rmb: f64,
        #[serde(default)]
        #[allow(dead_code)]
        rmb_per_fire: f64,
        ten_k: f64,
        #[serde(default)]
        increase_ratio: f64,
        #[serde(default)]
        trading_volume: String,
        source: String,
        #[allow(dead_code)]
        ts: String,
    }

    let result: NodeFireResult = serde_json::from_str(&json_str)
        .map_err(|e| format!("JSON parse error: {} | input: {}", e, json_str))?;

    if let Some(error) = result.error {
        return Err(format!("Node error: {}", error));
    }

    let now = chrono::Utc::now();
    let now_timestamp = now.timestamp();
    let source_time = (now + chrono::Duration::hours(8))
        .format("%Y/%m/%d %H:%M:%S")
        .to_string();

    Ok(FirePriceSnapshot {
        rmb_per_10k_fire: result.ten_k,
        fire_per_rmb: result.fire_per_rmb,
        increase_ratio: result.increase_ratio,
        trading_volume: result.trading_volume,
        source: result.source,
        source_time,
        scraped_at: now_timestamp,
    })
}

fn parse_qiandao_response(data: QiandaoResponse, mode: &str) -> Result<FirePriceSnapshot, String> {
    if data.code != "0" {
        return Err(format!(
            "Qiandao API error: code={:?}, errCode={:?}, msg={:?}",
            data.code, data.err_code, data._msg
        ));
    }

    let item = data
        .data
        .and_then(|d| d.items)
        .and_then(|mut items| items.drain(..).next())
        .ok_or_else(|| "No fire price data in response".to_string())?;

    let ratio_price = item.ratio_price.unwrap_or(0.0);
    let rmb_per_10k_fire = if ratio_price > 0.0 {
        round_to_4(10000.0 / ratio_price)
    } else {
        0.0
    };

    let now = chrono::Utc::now();
    let source_time = (now + chrono::Duration::hours(8))
        .format("%Y/%m/%d %H:%M:%S")
        .to_string();

    Ok(FirePriceSnapshot {
        rmb_per_10k_fire,
        fire_per_rmb: ratio_price,
        increase_ratio: item.change_pct.unwrap_or(0.0),
        trading_volume: item.change_24h.unwrap_or_default(),
        source: format!(
            "千岛API-{}",
            if mode == "专家" {
                "赛季专家"
            } else {
                "赛季普通"
            }
        ),
        source_time,
        scraped_at: now.timestamp(),
    })
}

fn round_to_4(value: f64) -> f64 {
    (value * 10000.0).round() / 10000.0
}

#[derive(Debug, Deserialize)]
struct QiandaoResponse {
    #[serde(rename = "code")]
    code: String,
    #[serde(rename = "message")]
    #[serde(alias = "msg")]
    #[serde(default)]
    _msg: Option<String>,
    #[serde(rename = "errCode")]
    #[serde(default)]
    err_code: Option<String>,
    #[serde(rename = "data")]
    data: Option<QiandaoData>,
}

#[derive(Debug, Deserialize)]
struct QiandaoData {
    #[serde(rename = "items")]
    items: Option<Vec<QiandaoItem>>,
}

#[derive(Debug, Deserialize)]
struct QiandaoItem {
    #[serde(rename = "ratioPrice")]
    #[serde(default)]
    ratio_price: Option<f64>,
    #[serde(rename = "changePct")]
    #[serde(default)]
    change_pct: Option<f64>,
    #[serde(rename = "change24h")]
    #[serde(default)]
    change_24h: Option<String>,
}

fn mask_url_for_log(url: &str) -> String {
    url.replace("api.qiandao.com", "***")
        .replace("115.231.176.101", "***")
}

// ==================== 双源数据获取 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LuosiHistoryPoint {
    pub ts: i64,
    pub price: f64,
    #[serde(default)]
    pub count: Option<i64>,
    #[serde(default)]
    pub filled: Option<bool>,
    #[serde(default)]
    pub realtime: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LuosiHistoryResponse {
    pub status: String,
    #[serde(default)]
    pub points: Vec<LuosiHistoryPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DualSourceItemData {
    pub item_id: String,
    pub name: String,
    pub current_price: f64,
    pub price_24h_ago: Option<f64>,
    pub last_time: i64,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DualSourceHistoryPoint {
    pub ts: i64,
    pub price: f64,
    pub source: String,
}

pub struct DualSourceScraper;

impl DualSourceScraper {
    const LUOSI_SERVER: &'static str = "http://115.231.176.101:8080";
    const ETOR_BASE: &'static str = "https://api.etor.com/etor-api/api";

    pub async fn get_overview(season_id: i32) -> Result<HashMap<String, LuosiItem>, String> {
        let url = format!("{}/get?season_id={}", Self::LUOSI_SERVER, season_id);
        info!("[双源] 获取物品概览: {}", mask_url_for_log(&url));

        let resp = http_client()?
            .get(&url)
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| format!("刷图小助手请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("刷图小助手 API 返回错误: {}", resp.status()));
        }

        let map: HashMap<String, LuosiItem> = resp
            .json()
            .await
            .map_err(|e| format!("JSON 解析失败: {}", e))?;

        Ok(map)
    }

    pub async fn get_luosi_history(season_id: i32, item_id: &str) -> Result<LuosiHistoryResponse, String> {
        let url = format!(
            "{}/price/history?season_id={}&item_id={}&range=season",
            Self::LUOSI_SERVER, season_id, item_id
        );

        let resp = http_client()?
            .get(&url)
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("API 返回错误: {}", resp.status()));
        }

        let history: LuosiHistoryResponse = resp
            .json()
            .await
            .map_err(|e| format!("JSON 解析失败: {}", e))?;

        Ok(history)
    }

    pub async fn get_etor_history(season_id: i32, item_id: &str) -> Result<Vec<DualSourceHistoryPoint>, String> {
        let url = format!(
            "{}/chart/{}/{}?interval=1h",
            Self::ETOR_BASE, season_id, item_id
        );

        let resp = http_client()?
            .get(&url)
            .header("accept", "application/json,text/plain,*/*")
            .header("accept-language", "zh-CN,zh;q=0.9")
            .header("x-frontend-version", "10.5.50")
            .header("seasonid", season_id.to_string())
            .header("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| format!("易火请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("易火 API 返回错误: {}", resp.status()));
        }

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("读取响应失败: {}", e))?;

        let text = String::from_utf8_lossy(&bytes);

        #[derive(Deserialize)]
        struct EtorChartResponse {
            #[serde(default)]
            trend: Option<Vec<EtorTrendPoint>>,
        }

        #[derive(Deserialize)]
        struct EtorTrendPoint {
            timestamp: i64,
            price: f64,
        }

        let chart_resp: EtorChartResponse = serde_json::from_str(&text)
            .map_err(|e| format!("易火 JSON 解析失败: {}", e))?;

        let items = chart_resp
            .trend
            .unwrap_or_default()
            .into_iter()
            .map(|t| DualSourceHistoryPoint {
                ts: t.timestamp / 1000,
                price: t.price,
                source: "etor".to_string(),
            })
            .collect();

        Ok(items)
    }

    pub async fn fetch_dual_source_history(
        season_id: i32,
        item_id: &str,
        item_name: &str,
    ) -> Vec<DualSourceHistoryPoint> {
        let mut all_points: Vec<DualSourceHistoryPoint> = Vec::new();

        if let Ok(history) = Self::get_luosi_history(season_id, item_id).await {
            for pt in history.points {
                all_points.push(DualSourceHistoryPoint {
                    ts: pt.ts,
                    price: pt.price,
                    source: "luosi".to_string(),
                });
            }
        }

        if let Ok(history) = Self::get_etor_history(season_id, item_id).await {
            for pt in history {
                all_points.push(DualSourceHistoryPoint {
                    ts: pt.ts,
                    price: pt.price,
                    source: "etor".to_string(),
                });
            }
        }

        all_points.sort_by_key(|p| p.ts);
        all_points
    }

    pub async fn fetch_all_dual_source(
        season_id: i32,
    ) -> Result<Vec<DualSourceItemData>, String> {
        info!("[双源] 开始获取所有物品数据 (赛季: {})", season_id);

        let overview = Self::get_overview(season_id).await?;
        let now = chrono::Utc::now().timestamp();

        let items: Vec<DualSourceItemData> = overview
            .into_iter()
            .map(|(item_id, item)| DualSourceItemData {
                item_id,
                name: item.name.clone(),
                current_price: item.item_price.unwrap_or(0.0),
                price_24h_ago: None,
                last_time: item.last_time.unwrap_or(now),
                source: "luosi".to_string(),
            })
            .collect();

        info!("[双源] 获取到 {} 个物品", items.len());
        Ok(items)
    }
}
