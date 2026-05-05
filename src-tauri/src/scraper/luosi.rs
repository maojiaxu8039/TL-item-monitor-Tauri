use crate::core::errors::AppError;
use crate::db::models::Item;
use serde::Deserialize;
use std::collections::HashMap;

const LUOSI_BASE_URL: &str = "http://115.231.176.101:8080/get";

#[derive(Debug, Deserialize)]
struct LuosiItem {
    name: String,
    price: f64,
    #[serde(rename = "last_time")]
    last_time: i64,
    #[serde(rename = "type")]
    item_type: Option<String>,
}

/// Scrape items from Luosi API for SS12 普通服 (season_id=1401).
#[allow(dead_code)]
pub async fn scrape_normal_items() -> Result<Vec<Item>, AppError> {
    scrape_by_season_id(1401, "ss12", "season_normal").await
}

/// Scrape items from Luosi API for SS12 专家服 (season_id=1431).
#[allow(dead_code)]
pub async fn scrape_expert_items() -> Result<Vec<Item>, AppError> {
    scrape_by_season_id(1431, "ss12", "season_expert").await
}

/// Scrape items from Luosi API, selecting the correct season_id
/// based on `season_id` and `market_mode`.
///
/// season_id mapping (刷图小助手 API):
///   ss12 赛季普通 → 1401 | ss12 赛季专家 → 1431
///   ss11 赛季普通 → 1201 | ss11 赛季专家 → 1231
///
/// 公式: 200 * season_num - 1000 + mode_suffix
///   - season_num = 12 (from "ss12") or 11 (from "ss11")
///   - mode_suffix = 1 (普通) 或 31 (专家)
pub async fn scrape_items(season_id: &str, market_mode: &str) -> Result<Vec<Item>, AppError> {
    let season_num = match season_id.strip_prefix("ss") {
        Some(s) => s.parse::<i32>().ok(),
        None => None,
    };

    let season_num = match season_num {
        Some(n) if n >= 11 => n,
        _ => {
            tracing::warn!("Unknown season_id '{}', defaulting to ss12", season_id);
            12
        }
    };

    let mode_suffix = match market_mode {
        "season_expert" => 31,
        _ => 1,
    };

    let api_season_id = 200 * season_num - 1000 + mode_suffix;
    let target_season_id = season_id.to_string();
    let target_market_mode = market_mode.to_string();
    scrape_by_season_id(api_season_id, &target_season_id, &target_market_mode).await
}

async fn scrape_by_season_id(api_season_id: i32, season_id: &str, market_mode: &str) -> Result<Vec<Item>, AppError> {
    let url = format!("{}?season_id={}", LUOSI_BASE_URL, api_season_id);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::Scrape(format!("reqwest build error: {}", e)))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Scrape(format!("request failed: {}", e)))?;

    if !resp.status().is_success() {
        return Err(AppError::Scrape(format!("API returned status: {}", resp.status())));
    }

    let map: HashMap<String, LuosiItem> = resp
        .json()
        .await
        .map_err(|e| AppError::Scrape(format!("failed to parse JSON: {}", e)))?;

    let now = chrono::Utc::now().timestamp();
    let items: Vec<Item> = map
        .into_iter()
        .map(|(item_id, item)| Item {
            item_id,
            season_id: season_id.to_string(),
            market_mode: market_mode.to_string(),
            name: item.name,
            item_type: item.item_type.unwrap_or_default(),
            source: "luosi_api".to_string(),
            price: item.price,
            last_time: Some(item.last_time),
            updated_at: now,
        })
        .collect();

    tracing::info!("Scraped {} items from Luosi API for {}/{}", items.len(), season_id, market_mode);
    Ok(items)
}
