//! 数据抓取模块

fn safe_truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::info;

use super::config::ApiConfig;

const LUOSI_API: &str = "http://115.231.176.101:8080/get";
const QIANDAO_API: &str = "https://api.qiandao.com";
const QIANDAO_FIRE_PRICE_ENDPOINT: &str = "/c2c-web/v1/common/currency-spu-price-list";

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
    /// 从刷图小助手 API 抓取物品数据
    pub async fn scrape_items(
        _season_id: &str,
        market_mode: &str,
        config: &ApiConfig,
    ) -> Result<Vec<Item>, String> {
        let luosi_season_id = if market_mode.contains("expert") {
            config.luosi_season_id_expert
        } else {
            config.luosi_season_id_normal
        };

        let url = format!("{}?season_id={}", LUOSI_API, luosi_season_id);
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
    pub async fn scrape_fire_price(
        market_mode: &str,
        config: &ApiConfig,
    ) -> Result<FirePriceSnapshot, String> {
        let is_expert = market_mode.contains("expert");
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

        let timestamp = chrono::Utc::now().timestamp_millis().to_string();
        let body = serde_json::json!({
            "tagId": tag_id,
            "offset": 0,
            "limit": 20,
            "specIds": [spec_id]
        });

        info!("抓取火价: {}{}", QIANDAO_API, QIANDAO_FIRE_PRICE_ENDPOINT);

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("HTTP client 创建失败: {}", e))?;

        let resp = client
            .post(format!("{}{}", QIANDAO_API, QIANDAO_FIRE_PRICE_ENDPOINT))
            .header("content-type", "application/json")
            .header("authorization", "Bearer undefined")
            .header("x-request-timestamp", &timestamp)
            .header("x-request-sign-type", "HMAC_SHA256")
            .header("x-request-sign-version", "v1")
            .header("x-request-package-id", "1044")
            .header("x-request-package-sign-version", "0.0.1")
            .header("origin", "https://qiandao.com")
            .header("referer", "https://qiandao.com/")
            .header(
                "user-agent",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            )
            .header("x-echo-region", "CN")
            .header("accept", "application/json, text/plain, */*")
            .header("accept-language", "zh-CN,zh;q=0.9")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("API 返回错误状态: {}", resp.status()));
        }

        let text = resp
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

        info!("火价API响应: {}", safe_truncate(&text, 500));

        // 解析 JSON 响应
        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| format!("JSON 解析失败: {} | body: {}", e, safe_truncate(&text, 200)))?;

        let code = json["code"].as_str().unwrap_or("");
        if code != "0" {
            return Err(format!(
                "千岛API返回错误: code={}, errCode={}, msg={}",
                code,
                json["errCode"].as_str().unwrap_or(""),
                json["message"].as_str().unwrap_or("")
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

        let now = chrono::Utc::now().timestamp();

        Ok(FirePriceSnapshot {
            rmb_per_10k_fire,
            fire_per_rmb,
            increase_ratio,
            trading_volume: "".to_string(),
            source: format!(
                "千岛API-{}",
                if is_expert {
                    "赛季专家"
                } else {
                    "赛季普通"
                }
            ),
            source_time: chrono::Utc::now().to_rfc3339(),
            scraped_at: now,
        })
    }
}
