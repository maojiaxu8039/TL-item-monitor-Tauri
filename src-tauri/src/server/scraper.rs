//! 数据抓取模块
//!
//! 使用客户端的 scraper::qiandao 模块进行火价采集
//! 物品火价采集

use once_cell::sync::Lazy;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tracing::{debug, info, warn};

use super::config::{ApiConfig, ApiEndpoints};

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

static HTTP_CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .pool_max_idle_per_host(1)
        .tcp_keepalive(Some(Duration::from_secs(60)))
        .tcp_nodelay(true)
        .danger_accept_invalid_certs(true)
        .build()
        .expect("Failed to create HTTP client")
});

static QIANDAO_CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .timeout(Duration::from_secs(15))
        .pool_max_idle_per_host(1)
        .tcp_keepalive(Some(Duration::from_secs(60)))
        .tcp_nodelay(true)
        .danger_accept_invalid_certs(true)
        .build()
        .expect("Failed to create Qiandao HTTP client")
});

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
struct LuosiItem {
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

        let resp = HTTP_CLIENT
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
                    warn!("Rust 火价抓取失败 (尝试 {}/{}): {}，尝试 Node 脚本", attempt, SCRAPE_MAX_RETRIES, last_error);

                    match scrape_via_node_script(mode).await {
                        Ok(snapshot) => {
                            debug!("Node 脚本火价获取成功: {} 火/元", snapshot.fire_per_rmb);
                            return Ok(snapshot);
                        }
                        Err(node_e) => {
                            warn!("Node 脚本火价抓取失败: {}", node_e);
                            if attempt < SCRAPE_MAX_RETRIES {
                                info!("{}ms 后重试...", SCRAPE_RETRY_DELAY_MS);
                                tokio::time::sleep(Duration::from_millis(SCRAPE_RETRY_DELAY_MS)).await;
                            }
                        }
                    }
                }
            }
        }

        Err(format!("火价抓取在 {} 次尝试后仍失败 (最后 Rust 错误: {})", SCRAPE_MAX_RETRIES, last_error))
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

    let resp = QIANDAO_CLIENT
        .post(&qiandao_url)
        .header("content-type", "application/json")
        .header("authorization", "Bearer undefined")
        .header("x-request-timestamp", &timestamp)
        .header("x-request-sign-type", "HMAC_SHA256")
        .header("x-request-sign-version", "v1")
        .header("x-request-package-id", "1044")
        .header("origin", "https://qiandao.com")
        .header("referer", "https://qiandao.com/")
        .header("user-agent", "Mozilla/5.0")
        .header("x-echo-region", "CN")
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

    let output = cmd
        .output()
        .await
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
