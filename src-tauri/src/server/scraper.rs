//! 数据抓取模块
//!
//! 使用客户端的 scraper::qiandao 模块进行火价采集
//! 物品采集使用裸丝 API

use once_cell::sync::Lazy;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tracing::info;

use super::config::{ApiConfig, ApiEndpoints};

fn safe_truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}

static HTTP_CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .build()
        .expect("Failed to create HTTP client")
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

        info!("成功抓取 {} 个物品", items.len());
        Ok(items)
    }

    pub async fn scrape_fire_price(
        market_mode: &str,
        _config: &ApiConfig,
        _endpoints: &ApiEndpoints,
    ) -> Result<FirePriceSnapshot, String> {
        let mode = if market_mode.contains("expert") { "专家" } else { "普通" };

        info!("抓取火价 (模式: {})", mode);

        match scrape_via_rust(mode).await {
            Ok(snapshot) => {
                info!("火价获取成功: {} 火/元", snapshot.fire_per_rmb);
                Ok(snapshot)
            }
            Err(e) => {
                info!("Rust 火价抓取失败: {}，尝试 Node 脚本", e);
                scrape_via_node_script(mode).await
            }
        }
    }
}

async fn scrape_via_rust(mode: &str) -> Result<FirePriceSnapshot, String> {
    let (tag_id, spec_id) = if mode == "专家" {
        ("1560055", "267417")
    } else {
        ("1560053", "267416")
    };

    let timestamp = chrono::Utc::now().timestamp_millis().to_string();
    let body = serde_json::json!({
        "tagId": tag_id,
        "offset": 0,
        "limit": 20,
        "specIds": [spec_id]
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| format!("reqwest build failed: {}", e))?;

    let resp = client
        .post("https://api.qiandao.com/c2c-web/v1/common/currency-spu-price-list")
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

    info!("火价API响应: status={}, body={}", status, safe_truncate(&text, 300));

    if !status.is_success() {
        return Err(format!("Qiandao HTTP status error: {} | body: {}", status, safe_truncate(&text, 200)));
    }

    let data: QiandaoResponse = serde_json::from_str(&text)
        .map_err(|e| format!("JSON parse error: {} | body: {}", e, safe_truncate(&text, 200)))?;

    parse_qiandao_response(data, mode)
}

async fn scrape_via_node_script(mode: &str) -> Result<FirePriceSnapshot, String> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();

    let possible_executables = vec![
        exe_dir.join("resources/qiandao_fire"),
        exe_dir.join("qiandao_fire"),
        exe_dir.join("../../../resources/qiandao_fire"),
        std::path::PathBuf::from("/Users/mc/.openclaw/workspace/TL-item-monitor-Tauri/src-tauri/target/debug/resources/qiandao_fire"),
    ];

    let script_path = possible_executables
        .iter()
        .find(|p| p.exists())
        .cloned()
        .ok_or_else(|| {
            let paths_str = possible_executables
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join(", ");
            format!("Node.js script not found. Tried: {}", paths_str)
        })?;

    info!("使用 Node 脚本抓取火价: {}", script_path.display());

    let output = tokio::process::Command::new(&script_path)
        .arg(if mode == "专家" { "pro" } else { "normal" })
        .output()
        .await
        .map_err(|e| format!("Script execution failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !stderr.is_empty() {
        info!("Node.js stderr: {}", stderr);
    }

    if !output.status.success() {
        return Err(format!(
            "Node.js script exited with code {:?}: {}",
            output.status.code(),
            stderr
        ));
    }

    #[derive(Deserialize)]
    struct NodeJsOutput {
        error: Option<String>,
        data: Option<NodeJsData>,
    }

    #[derive(Deserialize)]
    struct NodeJsData {
        fire_per_rmb: f64,
        rmb_per_fire: f64,
        ten_k: f64,
        increase_ratio: f64,
        trading_volume: String,
        source: String,
        ts: String,
    }

    let result: NodeJsOutput = serde_json::from_str(&stdout)
        .map_err(|e| format!("Node.js output parse error: {} | output: {}", e, stdout))?;

    if let Some(error) = result.error {
        return Err(format!("Node.js script error: {}", error));
    }

    let data = result
        .data
        .ok_or_else(|| "No data in Node.js output".to_string())?;

    Ok(FirePriceSnapshot {
        rmb_per_10k_fire: data.ten_k,
        fire_per_rmb: data.fire_per_rmb,
        increase_ratio: data.increase_ratio,
        trading_volume: data.trading_volume,
        source: data.source,
        source_time: data.ts,
        scraped_at: chrono::Utc::now().timestamp(),
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

    Ok(FirePriceSnapshot {
        rmb_per_10k_fire,
        fire_per_rmb: ratio_price,
        increase_ratio: item.change_pct.unwrap_or(0.0),
        trading_volume: item.change_24h.unwrap_or_default(),
        source: format!(
            "千岛API-{}",
            if mode == "专家" { "赛季专家" } else { "赛季普通" }
        ),
        source_time: chrono::Utc::now().format("%Y-%m-%d %H:%M").to_string(),
        scraped_at: chrono::Utc::now().timestamp(),
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
