use crate::core::errors::AppError;
use crate::core::state::FirePriceSnapshot;
use chrono::Utc;
use serde::Deserialize;

const QIANDAO_API: &str = "https://api.qiandao.com";

/// Default fetch (赛季普通模式)
pub async fn scrape_fire_price() -> Result<FirePriceSnapshot, AppError> {
    scrape_by_mode("普通").await
}

/// Fetch by mode (普通 / 专家).
///
/// The Rust HTTP client is tried first, but Qiandao currently returns
/// SYSTEM.FAIL for non-Node HTTP/2 client fingerprints. Keep the Node fallback
/// so packaged builds do not silently lose the fire-price source.
pub async fn scrape_by_mode(mode: &str) -> Result<FirePriceSnapshot, AppError> {
    tracing::info!("Starting fire price scrape for mode: {}", mode);

    match scrape_via_rust(mode).await {
        Ok(snapshot) => Ok(snapshot),
        Err(e) => {
            tracing::warn!(
                "Rust Qiandao scrape failed: {}; falling back to Node HTTP/2",
                e
            );
            scrape_via_node_script(mode).await
        }
    }
}

/// Rust reqwest HTTP/2 implementation.
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
        .post(format!(
            "{}/c2c-web/v1/common/currency-spu-price-list",
            QIANDAO_API
        ))
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
        .map_err(|e| AppError::Scrape(format!("HTTP request failed: {}", e)))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| AppError::Scrape(format!("HTTP response read failed: {}", e)))?;

    tracing::debug!(
        "Qiandao Rust response: status={}, body={}",
        status,
        safe_slice(&text, 500)
    );

    if !status.is_success() {
        return Err(AppError::Scrape(format!(
            "Qiandao HTTP status error: {} | body: {}",
            status,
            safe_slice(&text, 200)
        )));
    }

    let data: QiandaoResponse = serde_json::from_str(&text).map_err(|e| {
        AppError::Scrape(format!(
            "JSON parse error: {} | body: {}",
            e,
            safe_slice(&text, 200)
        ))
    })?;

    parse_qiandao_response(data, mode)
}

/// Node.js native HTTP/2 implementation.
async fn scrape_via_node_script(mode: &str) -> Result<FirePriceSnapshot, AppError> {
    let possible_paths = [
        std::path::PathBuf::from(option_env!("CARGO_MANIFEST_DIR").unwrap_or("."))
            .join("resources/qiandao_fire.mjs"),
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|p| p.join("resources/qiandao_fire.mjs")))
            .unwrap_or_default(),
        std::env::current_exe()
            .ok()
            .and_then(|exe| {
                exe.parent()
                    .and_then(|p| p.parent())
                    .map(|p| p.join("resources/qiandao_fire.mjs"))
            })
            .unwrap_or_default(),
    ];

    let script_path = possible_paths
        .iter()
        .find(|p| p.exists())
        .cloned()
        .ok_or_else(|| {
            let paths = possible_paths
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join(", ");
            AppError::Scrape(format!("Node.js script not found. Tried paths: {}", paths))
        })?;

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

    let result: NodeJsOutput = serde_json::from_str(&stdout).map_err(|e| {
        AppError::Scrape(format!(
            "Node.js output parse error: {} | output: {}",
            e, stdout
        ))
    })?;

    if let Some(error) = result.error {
        return Err(AppError::Scrape(format!("Node.js script error: {}", error)));
    }

    let data = result
        .data
        .ok_or_else(|| AppError::Scrape("No data in Node.js output".to_string()))?;

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

fn safe_slice(s: &str, max_len: usize) -> &str {
    &s[..s.len().min(max_len)]
}

fn parse_qiandao_response(
    data: QiandaoResponse,
    mode: &str,
) -> Result<FirePriceSnapshot, AppError> {
    if data.code != "0" {
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
    let rmb_per_10k_fire = if ratio_price > 0.0 {
        round_to_4(10000.0 / ratio_price)
    } else {
        0.0
    };

    Ok(FirePriceSnapshot {
        price_per_wan: rmb_per_10k_fire,
        rmb_per_10k_fire,
        fire_per_rmb: ratio_price,
        increase_ratio: item.change_pct,
        trading_volume: Some(item.change_24h.unwrap_or_default()),
        source: format!(
            "千岛API-{}",
            if mode == "专家" {
                "赛季专家"
            } else {
                "赛季普通"
            }
        ),
        source_time: Some(Utc::now().format("%Y-%m-%d %H:%M").to_string()),
        scraped_at: Utc::now().timestamp(),
    })
}

fn round_to_4(value: f64) -> f64 {
    (value * 10000.0).round() / 10000.0
}

fn parse_optional_f64(value: serde_json::Value) -> Option<f64> {
    match value {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => {
            let normalized = s.trim().trim_end_matches('%').replace(',', "");
            normalized.parse::<f64>().ok()
        }
        _ => None,
    }
}

fn parse_optional_string(value: serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::Null => None,
        serde_json::Value::String(s) => Some(s),
        serde_json::Value::Number(n) => Some(n.to_string()),
        serde_json::Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn deserialize_optional_f64<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(value.and_then(parse_optional_f64))
}

fn deserialize_optional_string<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(value.and_then(parse_optional_string))
}

fn deserialize_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(value.and_then(parse_optional_string).unwrap_or_default())
}

#[derive(Debug, serde::Deserialize)]
struct QiandaoResponse {
    #[serde(rename = "code")]
    #[serde(deserialize_with = "deserialize_string")]
    code: String,
    #[serde(rename = "message")]
    #[serde(alias = "msg")]
    #[serde(default)]
    #[serde(deserialize_with = "deserialize_optional_string")]
    _msg: Option<String>,
    #[serde(rename = "errCode")]
    #[serde(default)]
    #[serde(deserialize_with = "deserialize_optional_string")]
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
    #[serde(default, deserialize_with = "deserialize_optional_f64")]
    ratio_price: Option<f64>,
    #[serde(rename = "changePct")]
    #[serde(default, deserialize_with = "deserialize_optional_f64")]
    change_pct: Option<f64>,
    #[serde(rename = "change24h")]
    #[serde(default, deserialize_with = "deserialize_optional_string")]
    change_24h: Option<String>,
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_qiandao_item_accepts_string_and_number_fields() {
        let item: QiandaoItem = serde_json::from_value(serde_json::json!({
            "ratioPrice": "162.1534",
            "changePct": "1.25%",
            "change24h": 42
        }))
        .expect("item should parse");

        assert_eq!(item.ratio_price, Some(162.1534));
        assert_eq!(item.change_pct, Some(1.25));
        assert_eq!(item.change_24h.as_deref(), Some("42"));
    }

    #[test]
    fn parse_response_maps_fire_snapshot_metadata() {
        let response: QiandaoResponse = serde_json::from_value(serde_json::json!({
            "code": "0",
            "data": {
                "items": [{
                    "ratioPrice": 200.0,
                    "changePct": -0.5,
                    "change24h": "123"
                }]
            }
        }))
        .expect("response should parse");

        let snapshot = parse_qiandao_response(response, "专家").expect("snapshot should parse");
        assert_eq!(snapshot.fire_per_rmb, 200.0);
        assert_eq!(snapshot.rmb_per_10k_fire, 50.0);
        assert_eq!(snapshot.increase_ratio, Some(-0.5));
        assert_eq!(snapshot.trading_volume.as_deref(), Some("123"));
        assert_eq!(snapshot.source, "千岛API-赛季专家");
        assert!(snapshot.source_time.is_some());
    }

    #[tokio::test]
    #[ignore = "calls the live Qiandao API"]
    async fn live_scrape_normal_fire_price() {
        let snapshot = scrape_by_mode("普通")
            .await
            .expect("live Qiandao normal fire scrape should succeed");
        println!(
            "normal fire price: rmb_per_10k_fire={}, fire_per_rmb={}, source={}",
            snapshot.rmb_per_10k_fire, snapshot.fire_per_rmb, snapshot.source
        );
        assert!(snapshot.rmb_per_10k_fire > 0.0);
        assert!(snapshot.fire_per_rmb > 0.0);
        assert!(snapshot.source.contains("千岛API"));
    }
}
