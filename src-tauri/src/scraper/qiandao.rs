use crate::core::errors::AppError;
use crate::core::state::FirePriceSnapshot;
use chrono::Utc;

const QIANDAO_API: &str = "https://api.qiandao.com";

/// Default fetch (赛季普通模式)
pub async fn scrape_fire_price() -> Result<FirePriceSnapshot, AppError> {
    scrape_by_mode("普通").await
}

/// Fetch by mode (普通 / 专家)
pub async fn scrape_by_mode(mode: &str) -> Result<FirePriceSnapshot, AppError> {
    tracing::info!("Starting fire price scrape for mode: {}", mode);

    // Try Node.js HTTP/2 first, fallback to Rust reqwest
    match scrape_via_node_script(mode).await {
        Ok(snapshot) => {
            tracing::info!("Fire price scraped via Node.js HTTP/2");
            return Ok(snapshot);
        }
        Err(e) => {
            tracing::warn!("Node.js HTTP/2 failed: {}, trying Rust reqwest...", e);
        }
    }

    scrape_via_rust(mode).await
}

/// Node.js native HTTP/2 implementation
async fn scrape_via_node_script(mode: &str) -> Result<FirePriceSnapshot, AppError> {
    let script_path = std::path::PathBuf::from(
        option_env!("CARGO_MANIFEST_DIR")
            .unwrap_or(".")
    ).join("resources/qiandao_fire.mjs");

    if !script_path.exists() {
        return Err(AppError::Scrape(format!(
            "Node.js script not found at: {}",
            script_path.display()
        )));
    }

    let output = tokio::process::Command::new("node")
        .arg(&script_path)
        .arg(if mode == "专家" { "pro" } else { "normal" })
        .output()
        .await
        .map_err(|e| AppError::Scrape(format!("Node.js execution failed: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !stderr.is_empty() {
        tracing::warn!("Node.js stderr: {}", stderr);
    }

    if !output.status.success() {
        return Err(AppError::Scrape(format!(
            "Node.js script exited with code {:?}: {}",
            output.status.code(),
            stderr
        )));
    }

    // Parse the new output format: {"code":"0","data":{...}}
    let result: NodeJsOutput = serde_json::from_str(&stdout).map_err(|e| {
        AppError::Scrape(format!("Node.js output parse error: {} | output: {}", e, stdout))
    })?;

    if let Some(error) = result.error {
        return Err(AppError::Scrape(format!("Node.js script error: {}", error)));
    }

    let data = result.data.ok_or_else(|| AppError::Scrape("No data in Node.js output".to_string()))?;

    tracing::info!(
        "Fire price scraped via Node.js: fire_per_rmb={}, rmb_per_fire={}",
        data.fire_per_rmb,
        data.rmb_per_fire
    );

    Ok(FirePriceSnapshot {
        price_per_wan: data.ten_k,
        rmb_per_10k_fire: data.rmb_per_fire,
        fire_per_rmb: data.fire_per_rmb,
        increase_ratio: Some(data.increase_ratio),
        trading_volume: Some(data.trading_volume),
        source: data.source,
        source_time: Some(data.ts),
        scraped_at: Utc::now().timestamp(),
    })
}

/// Rust reqwest HTTP/2 implementation (fallback)
async fn scrape_via_rust(mode: &str) -> Result<FirePriceSnapshot, AppError> {
    let (tag_id, spec_id) = if mode == "专家" {
        ("1560055", "267417")
    } else {
        ("1560053", "267416")
    };

    let timestamp = Utc::now().timestamp_millis().to_string();
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
        .map_err(|e| AppError::Scrape(format!("reqwest build failed: {}", e)))?;

    let resp = client
        .post(&format!(
            "{}/c2c-web/v1/common/currency-spu-price-list",
            QIANDAO_API
        ))
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
        .map_err(|e| AppError::Scrape(format!("HTTP request failed: {}", e)))?;

    let status = resp.status();
    let text: String = resp.text().await.map_err(|e| AppError::Scrape(e.to_string()))?;

    tracing::debug!("Response: status={}, body={}", status, &text[..text.len().min(500)]);

    let data: QiandaoResponse = serde_json::from_str(&text).map_err(|e| {
        AppError::Scrape(format!("JSON parse error: {} | body: {}", e, &text[..200]))
    })?;

    parse_qiandao_response(data, mode)
}

/// Parse Qiandao API response into FirePriceSnapshot (fallback)
fn parse_qiandao_response(
    data: QiandaoResponse,
    mode: &str,
) -> Result<FirePriceSnapshot, AppError> {
    if data.code != "0" {
        tracing::warn!(
            "Qiandao API returned error: code={:?}, errCode={:?}",
            data.code,
            data.err_code
        );
        return Err(AppError::Scrape(format!(
            "Qiandao API error: code={:?}, errCode={:?}, msg={:?}",
            data.code, data.err_code, data._msg
        )));
    }

    let item = data
        .data
        .and_then(|d| d.items)
        .and_then(|mut items| items.drain(..).next())
        .ok_or_else(|| AppError::Scrape("No fire price data in response".to_string()))?;

    let ratio_price = item.ratio_price.unwrap_or(0.0);
    let price_per_wan = if ratio_price > 0.0 {
        10000.0 / ratio_price
    } else {
        0.0
    };

    tracing::info!(
        "Fire price scraped via Rust: ratio={}, price_per_wan={}",
        ratio_price,
        price_per_wan
    );

    Ok(FirePriceSnapshot {
        price_per_wan,
        rmb_per_10k_fire: price_per_wan,
        fire_per_rmb: ratio_price,
        increase_ratio: item.change_pct,
        trading_volume: None,
        source: format!(
            "千岛API-{}",
            if mode == "专家" { "赛季专家" } else { "赛季普通" }
        ),
        source_time: None,
        scraped_at: Utc::now().timestamp(),
    })
}

// ========== Data structures ==========

/// Node.js script output format
#[derive(Debug, serde::Deserialize)]
struct NodeJsOutput {
    #[serde(default)]
    _code: Option<String>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    data: Option<NodeJsData>,
}

#[derive(Debug, serde::Deserialize)]
struct NodeJsData {
    fire_per_rmb: f64,
    rmb_per_fire: f64,
    ten_k: f64,
    increase_ratio: f64,
    trading_volume: String,
    source: String,
    ts: String,
}

/// Rust fallback - Qiandao API response format
#[derive(Debug, serde::Deserialize)]
struct QiandaoResponse {
    #[serde(rename = "code")]
    code: String,
    #[serde(rename = "message")]
    #[serde(default)]
    _msg: Option<String>,
    #[serde(rename = "errCode")]
    #[serde(default)]
    err_code: Option<String>,
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
