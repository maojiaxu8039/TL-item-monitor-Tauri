//! 数据抓取模块

use once_cell::sync::Lazy;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;
use tokio::process::Command;
use tracing::{error, info, warn};

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
        config: &ApiConfig,
        endpoints: &ApiEndpoints,
    ) -> Result<FirePriceSnapshot, String> {
        let is_expert = market_mode.contains("expert");

        match scrape_fire_via_node(is_expert).await {
            Ok(snapshot) => {
                info!("通过 Node 脚本成功获取火价: {}", snapshot.rmb_per_10k_fire);
                Ok(snapshot)
            }
            Err(e) => {
                warn!("Node 脚本获取火价失败: {}，尝试 HTTP API", e);
                Self::scrape_fire_via_http(is_expert, config, endpoints).await
            }
        }
    }

    async fn scrape_fire_via_http(
        is_expert: bool,
        config: &ApiConfig,
        endpoints: &ApiEndpoints,
    ) -> Result<FirePriceSnapshot, String> {
        let (tag_id, spec_id) = if is_expert {
            (
                config.qiandao_tag_id_expert.as_str(),
                config.qiandao_spec_id_expert.as_str(),
            )
        } else {
            (
                config.qiandao_tag_id_normal.as_str(),
                config.qiandao_spec_id_normal.as_str(),
            )
        };

        let api_url = format!("{}{}?tagId={}&specIds={}",
            endpoints.qiandao,
            endpoints.qiandao_fire_endpoint,
            tag_id,
            spec_id
        );
        info!("抓取火价(HTTP): {}", mask_url_for_log(&api_url));

        let resp = HTTP_CLIENT
            .get(&api_url)
            .header("authorization", "Bearer undefined")
            .header("origin", "https://qiandao.com")
            .header("referer", "https://qiandao.com/")
            .header(
                "user-agent",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            )
            .header("x-echo-region", "CN")
            .header("accept", "application/json, text/plain, */*")
            .header("accept-language", "zh-CN,zh;q=0.9")
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        info!("火价API状态: {}", resp.status().as_u16());

        if !resp.status().is_success() {
            return Err(format!("API返回错误状态: {}", resp.status()));
        }

        let text = resp
            .text()
            .await
            .map_err(|e| format!("读取响应失败: {}", e))?;

        info!("火价API响应: {}", safe_truncate(&text, 500));

        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| format!("JSON解析失败: {}", e))?;

        let code = json["code"].as_str().unwrap_or("");
        if code != "0" {
            let err_code = json["errCode"].as_str().unwrap_or("");
            let msg = json["message"].as_str().unwrap_or("");
            return Err(format!(
                "千岛API返回错误: code={}, errCode={}, msg={}",
                code, err_code, msg
            ));
        }

        let item = json["data"]["items"]
            .as_array()
            .and_then(|items| items.first())
            .ok_or("No fire price data in response")?;

        let ratio_price = item["ratioPrice"].as_f64().unwrap_or(0.0);
        let rmb_per_10k_fire = if ratio_price > 0.0 {
            10000.0 / ratio_price
        } else {
            0.0
        };

        let fire_per_rmb = ratio_price;

        let increase_ratio = item["changePct"].as_f64().unwrap_or(0.0);

        Ok(FirePriceSnapshot {
            rmb_per_10k_fire,
            fire_per_rmb,
            increase_ratio,
            trading_volume: "".to_string(),
            source: format!(
                "千岛API-{}",
                if is_expert { "赛季专家" } else { "赛季普通" }
            ),
            source_time: chrono::Utc::now().to_rfc3339(),
            scraped_at: chrono::Utc::now().timestamp(),
        })
    }
}

async fn scrape_fire_via_node(is_expert: bool) -> Result<FirePriceSnapshot, String> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();

    let possible_scripts = vec![
        exe_dir.join("resources/qiandao_fire.mjs"),
        exe_dir.join("../../../resources/qiandao_fire.mjs"),
        PathBuf::from("/Users/mc/.openclaw/workspace/TL-item-monitor-Tauri/src-tauri/resources/qiandao_fire.mjs"),
    ];

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

    info!("使用 Node 脚本抓取火价: {}", script_path.display());

    let mode_arg = if is_expert { "pro" } else { "normal" };

    let output = Command::new("node")
        .arg(script_path)
        .arg(mode_arg)
        .output()
        .await
        .map_err(|e| format!("Node execution failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !stderr.is_empty() {
        warn!("Node.js stderr: {}", stderr);
    }

    if !output.status.success() {
        return Err(format!(
            "Node.js script exited with code {:?}: {}",
            output.status.code(),
            stderr
        ));
    }

    #[derive(Deserialize)]
    struct NodeOutput {
        error: Option<String>,
        data: Option<NodeData>,
    }

    #[derive(Deserialize)]
    struct NodeData {
        ten_k: f64,
        rmb_per_fire: f64,
        change_pct: Option<f64>,
        trading_volume: Option<String>,
        update_time: Option<String>,
    }

    let result: NodeOutput = serde_json::from_str(&stdout).map_err(|e| {
        format!("Node.js output parse error: {} | output: {}", e, stdout)
    })?;

    if let Some(error) = result.error {
        return Err(format!("Node.js script error: {}", error));
    }

    let data = result.data.ok_or("No data in Node.js output")?;

    Ok(FirePriceSnapshot {
        rmb_per_10k_fire: data.ten_k,
        fire_per_rmb: data.rmb_per_fire,
        increase_ratio: data.change_pct.unwrap_or(0.0),
        trading_volume: data.trading_volume.unwrap_or_default(),
        source: format!("Node脚本-{}", if is_expert { "赛季专家" } else { "赛季普通" }),
        source_time: data.update_time.unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
        scraped_at: chrono::Utc::now().timestamp(),
    })
}

fn mask_url_for_log(url: &str) -> String {
    url.replace("api.qiandao.com", "***")
        .replace("115.231.176.101", "***")
}