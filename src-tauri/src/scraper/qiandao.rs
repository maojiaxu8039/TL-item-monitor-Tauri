use crate::core::errors::AppError;
use crate::core::state::FirePriceSnapshot;
use chrono::Utc;

const QIANDAO_API: &str = "https://api.qiandao.com";

#[derive(Debug, serde::Deserialize)]
struct QiandaoResponse {
    #[serde(rename = "code")]
    code: Option<i32>,
    #[serde(rename = "data")]
    data: Option<QiandaoData>,
}

#[derive(Debug, serde::Deserialize)]
struct QiandaoData {
    #[serde(rename = "items")]
    items: Option<Vec<QiandaoItem>>,
}

#[derive(Debug, serde::Deserialize)]
struct QiandaoItem {
    #[serde(rename = "ratioPrice")]
    ratio_price: Option<f64>,
    #[serde(rename = "changePct")]
    change_pct: Option<f64>,
}

pub async fn scrape_fire_price() -> Result<FirePriceSnapshot, AppError> {
    scrape_by_mode("普通").await
}

pub async fn scrape_by_mode(mode: &str) -> Result<FirePriceSnapshot, AppError> {
    tracing::info!("Starting fire price scrape for mode: {}", mode);

    let spec_id = if mode == "专家" { "267417" } else { "267416" };
    let timestamp = Utc::now().timestamp_millis().to_string();

    let body = serde_json::json!({
        "tagId": "1560053",
        "offset": 0,
        "limit": 20,
        "specIds": [spec_id]
    });

    let body_bytes = serde_json::to_vec(&body)
        .map_err(|e| AppError::Scrape(format!("JSON serialization failed: {}", e)))?;

    tracing::debug!("Request body size: {} bytes", body_bytes.len());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .danger_accept_invalid_certs(true)
        .http2_prior_knowledge()
        .build()
        .map_err(|e| AppError::Scrape(format!("reqwest build failed: {}", e)))?;

    tracing::debug!("Built HTTP/2 client with prior knowledge");

    let resp = client
        .post(&format!("{}/c2c-web/v1/common/currency-spu-price-list", QIANDAO_API))
        .header("content-type", "application/json")
        .header("authorization", "Bearer undefined")
        .header("x-request-timestamp", &timestamp)
        .header("x-request-sign-type", "HMAC_SHA256")
        .header("x-request-sign-version", "v1")
        .header("x-request-package-id", "1044")
        .header("x-request-package-sign-version", "0.0.1")
        .header("origin", "https://qiandao.com")
        .header("referer", "https://qiandao.com/")
        .header("user-agent", "Mozilla/5.0")
        .header("x-echo-region", "CN")
        .body(body_bytes)
        .send()
        .await
        .map_err(|e| AppError::Scrape(format!("HTTP/2 prior knowledge request failed: {}", e)))?;

    let status = resp.status();
    let text: String = resp.text().await.map_err(|e| AppError::Scrape(e.to_string()))?;

    tracing::debug!("HTTP/2 prior knowledge response: status={}, body={}", status, &text[..text.len().min(500)]);

    if !status.is_success() {
        return Err(AppError::Scrape(format!("HTTP error {}: {}", status, &text[..text.len().min(200)])));
    }

    let data: QiandaoResponse = serde_json::from_str(&text)
        .map_err(|e| AppError::Scrape(format!("JSON parse error: {}", e)))?;

    if data.code != Some(20000) && data.code != Some(0) {
        return Err(AppError::Scrape(format!("API error: {:?}", data.code)));
    }

    let item = data.data
        .and_then(|d| d.items)
        .and_then(|mut items| items.drain(..).next())
        .ok_or_else(|| AppError::Scrape("No fire price data".to_string()))?;

    let ratio_price = item.ratio_price.unwrap_or(0.0);
    let price_per_wan = if ratio_price > 0.0 {
        10000.0 / ratio_price
    } else {
        0.0
    };

    tracing::info!(
        "Fire price scraped: ratio={}, price_per_wan={}",
        ratio_price,
        price_per_wan
    );

    Ok(FirePriceSnapshot {
        price_per_wan,
        rmb_per_10k_fire: price_per_wan,
        fire_per_rmb: ratio_price,
        increase_ratio: item.change_pct,
        trading_volume: None,
        source: format!("千岛API-{}", if mode == "专家" { "赛季专家" } else { "赛季普通" }),
        source_time: None,
        scraped_at: Utc::now().timestamp(),
    })
}
