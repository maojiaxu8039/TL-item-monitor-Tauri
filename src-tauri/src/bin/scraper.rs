//! 数据抓取模块

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{info, warn};

const LUOSI_API: &str = "http://115.231.176.101:8080/get";
const QIANDAL_URL: &str = "https://www.palworld.com.cn/api/fire-price";

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
    /// 从罗四 API 抓取物品数据
    pub async fn scrape_items(season_id: &str, market_mode: &str) -> Result<Vec<Item>, String> {
        let api_season_id = calculate_api_season_id(season_id, market_mode)?;
        
        let url = format!("{}?season_id={}", LUOSI_API, api_season_id);
        info!("抓取物品: {}", url);

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| format!("HTTP client 创建失败: {}", e))?;

        let resp = client
            .get(&url)
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

    /// 从千岛 API 抓取火价数据
    pub async fn scrape_fire_price(market_mode: &str) -> Result<FirePriceSnapshot, String> {
        let url = format!("{}?mode={}", QIANDAL_URL, market_mode);
        info!("抓取火价: {}", url);

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("HTTP client 创建失败: {}", e))?;

        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("API 返回错误状态: {}", resp.status()));
        }

        let body = resp
            .text()
            .await
            .map_err(|e| format!("读取响应失败: {}", e))?;

        // 解析 JSON 响应
        let json: serde_json::Value = serde_json::from_str(&body)
            .map_err(|e| format!("JSON 解析失败: {}", e))?;

        let rmb_per_10k_fire = json["data"]["rmb_per_10k_fire"]
            .as_f64()
            .unwrap_or(0.0);
        
        let fire_per_rmb = if rmb_per_10k_fire > 0.0 {
            10000.0 / rmb_per_10k_fire
        } else {
            0.0
        };

        let increase_ratio = json["data"]["increase_ratio"]
            .as_f64()
            .unwrap_or(0.0);

        let trading_volume = json["data"]["trading_volume"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let source_time = json["data"]["source_time"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let now = chrono::Utc::now().timestamp();

        Ok(FirePriceSnapshot {
            rmb_per_10k_fire,
            fire_per_rmb,
            increase_ratio,
            trading_volume,
            source: "qiandao".to_string(),
            source_time,
            scraped_at: now,
        })
    }
}

/// 计算 API season_id
fn calculate_api_season_id(season_id: &str, market_mode: &str) -> Result<i32, String> {
    let season_num = season_id
        .strip_prefix("ss")
        .ok_or("Invalid season_id format")?
        .parse::<i32>()
        .map_err(|_| "Invalid season number")?;

    let mode_suffix = match market_mode {
        "season_expert" => 31,
        _ => 1,
    };

    let api_season_id = 200 * season_num - 1000 + mode_suffix;
    Ok(api_season_id)
}
