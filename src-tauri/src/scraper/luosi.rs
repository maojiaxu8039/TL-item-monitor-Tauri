use crate::core::errors::AppError;
use crate::db::models::Item;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::LazyLock;

// SECURITY NOTE: This third-party API endpoint only supports HTTP (not HTTPS).
// The upstream service provider does not offer TLS, so all traffic to this
// endpoint is unencrypted. No sensitive credentials are transmitted.
const LUOSI_BASE_URL: &str = "http://115.231.176.101:8080/get";

static LUOSI_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .connect_timeout(std::time::Duration::from_secs(15))
        .pool_max_idle_per_host(4)
        .build()
        .unwrap_or_else(|e| {
            tracing::error!(
                "Failed to create Luosi HTTP client: {}, using default client",
                e
            );
            reqwest::Client::new()
        })
});

#[derive(Debug, Deserialize, Clone)]
pub struct LuosiItem {
    pub name: String,
    pub price: f64,
    #[serde(rename = "last_time")]
    pub last_time: i64,
    #[serde(rename = "type")]
    pub item_type: Option<String>,
}

pub async fn scrape_normal_items() -> Result<Vec<Item>, AppError> {
    scrape_by_season_id(1401, "ss12", "season_normal").await
}

pub async fn scrape_expert_items() -> Result<Vec<Item>, AppError> {
    scrape_by_season_id(1431, "ss12", "season_expert").await
}

pub async fn scrape_items(season_id: &str, market_mode: &str) -> Result<Vec<Item>, AppError> {
    let season_num = match season_id.strip_prefix("ss") {
        Some(s) => s.parse::<i32>().ok(),
        None => None,
    };

    let season_num = match season_num {
        Some(n) if n >= 11 => n,
        _ => {
            tracing::warn!("Unknown season '{}', defaulting to ss12", season_id);
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

/// 使用指定的 API 赛季ID 抓取刷图小助手物品（用于双源合并时统一配置）
pub async fn scrape_items_with_api_id(
    season_id: &str,
    market_mode: &str,
    api_season_id: i32,
) -> Result<Vec<Item>, AppError> {
    scrape_by_season_id(api_season_id, season_id, market_mode).await
}

/// 获取刷图小助手的物品ID+名称+类型列表（用于对照表更新）
pub async fn fetch_luosi_item_list(
    api_season_id: i32,
) -> Result<HashMap<String, LuosiItem>, AppError> {
    let url = format!("{}?season_id={}", LUOSI_BASE_URL, api_season_id);
    tracing::info!("[LUOSI] Fetching item list for mapping update: {}", url);

    let resp = LUOSI_CLIENT
        .get(&url)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| AppError::Scrape(format!("luosi mapping request failed: {}", e)))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(AppError::Scrape(format!(
            "luosi mapping API status: {}",
            status
        )));
    }

    let body = resp
        .text()
        .await
        .map_err(|e| AppError::Scrape(format!("luosi mapping read failed: {}", e)))?;
    let map: HashMap<String, LuosiItem> = serde_json::from_str(&body)
        .map_err(|e| AppError::Scrape(format!("luosi mapping parse failed: {}", e)))?;

    tracing::info!("[LUOSI] Fetched {} items for mapping update", map.len());
    Ok(map)
}

async fn scrape_by_season_id(
    api_season_id: i32,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<Item>, AppError> {
    let url = format!("{}?season_id={}", LUOSI_BASE_URL, api_season_id);

    tracing::info!("[LUOSI] Sending HTTP request to: {}", url);

    let resp = LUOSI_CLIENT
        .get(&url)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| {
            tracing::error!("[LUOSI] HTTP request failed: {}", e);
            AppError::Scrape(format!("request failed: {}", e))
        })?;

    let status = resp.status();
    tracing::info!("[LUOSI] Response received, status: {}", status);

    let body = resp.text().await.map_err(|e| {
        tracing::error!("[LUOSI] Failed to read response: {}", e);
        AppError::Scrape(format!("failed to read response: {}", e))
    })?;

    tracing::info!("[LUOSI] Response body: {} bytes", body.len());

    if !status.is_success() {
        return Err(AppError::Scrape(format!(
            "API returned error status: {}, body: {}",
            status,
            &body[..body.len().min(200)]
        )));
    }

    if body.len() < 100 {
        tracing::warn!(
            "[LUOSI] Response body too small, might be an error: {}",
            body
        );
        return Err(AppError::Scrape(format!(
            "API returned empty or invalid response: {}",
            body
        )));
    }

    let map: HashMap<String, LuosiItem> = serde_json::from_str(&body).map_err(|e| {
        tracing::error!("[LUOSI] JSON parse error: {}", e);
        AppError::Scrape(format!("failed to parse JSON: {}", e))
    })?;

    tracing::info!("[LUOSI] Parsed {} items from API", map.len());

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

    tracing::info!(
        "[LUOSI] Transformed {} items for {}/{}",
        items.len(),
        season_id,
        market_mode
    );
    Ok(items)
}
