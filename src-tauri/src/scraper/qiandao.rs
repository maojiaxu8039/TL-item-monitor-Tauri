use crate::core::errors::AppError;
use crate::core::state::FirePriceSnapshot;
use chrono::Utc;
use serde::Deserialize;
use std::path::{Path, PathBuf};

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
    let candidates = node_fallback_candidates();
    if candidates.is_empty() {
        return Err(AppError::Scrape(
            "Node.js script not found: no candidate paths were generated".to_string(),
        ));
    }

    let mut errors = Vec::new();
    for candidate in candidates
        .iter()
        .filter(|candidate| candidate.path().exists())
    {
        tracing::info!("Trying Qiandao Node fallback: {}", candidate.label());
        match run_node_fallback(candidate, mode).await {
            Ok(snapshot) => return Ok(snapshot),
            Err(err) => {
                tracing::warn!("Qiandao Node fallback failed: {}", err);
                errors.push(format!("{}: {}", candidate.label(), err));
            }
        }
    }

    if errors.is_empty() {
        let paths = candidates
            .iter()
            .map(|candidate| candidate.label())
            .collect::<Vec<_>>()
            .join(", ");
        Err(AppError::Scrape(format!(
            "Node.js script not found. Tried: {}",
            paths
        )))
    } else {
        Err(AppError::Scrape(format!(
            "All Node.js fire-price fallbacks failed. {}",
            errors.join(" | ")
        )))
    }
}

async fn run_node_fallback(
    candidate: &NodeFallbackCandidate,
    mode: &str,
) -> Result<FirePriceSnapshot, AppError> {
    let mut command = match candidate {
        NodeFallbackCandidate::Script(path) => {
            let mut command = tokio::process::Command::new("node");
            command.arg(path);
            command
        }
        NodeFallbackCandidate::Executable(path) => tokio::process::Command::new(path),
    };

    let output = command
        .arg(if mode == "专家" { "pro" } else { "normal" })
        .output()
        .await
        .map_err(|e| AppError::Scrape(format!("Script execution failed: {}", e)))?;

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

    let data = parse_node_output(&stdout)?;

    let now = Utc::now();
    let now_timestamp = now.timestamp();
    let source_time = (now + chrono::Duration::hours(8))
        .format("%Y/%m/%d %H:%M:%S")
        .to_string();

    Ok(FirePriceSnapshot {
        price_per_wan: data.ten_k,
        rmb_per_10k_fire: data.rmb_per_fire,
        fire_per_rmb: data.fire_per_rmb,
        increase_ratio: Some(data.increase_ratio),
        trading_volume: Some(data.trading_volume),
        source: data.source,
        source_time: Some(source_time),
        scraped_at: now_timestamp,
    })
}

fn parse_node_output(stdout: &str) -> Result<NodeJsData, AppError> {
    let trimmed = stdout.trim();
    let value: serde_json::Value = serde_json::from_str(trimmed).map_err(|e| {
        AppError::Scrape(format!(
            "Node.js output parse error: {} | output: {}",
            e, stdout
        ))
    })?;

    if let Some(error) = value.get("error").and_then(|v| v.as_str()) {
        return Err(AppError::Scrape(format!("Node.js script error: {}", error)));
    }

    let data_value = value
        .get("data")
        .filter(|data| data.is_object())
        .unwrap_or(&value)
        .clone();

    serde_json::from_value(data_value).map_err(|e| {
        AppError::Scrape(format!(
            "Node.js output data parse error: {} | output: {}",
            e, stdout
        ))
    })
}

#[derive(Debug, Clone)]
enum NodeFallbackCandidate {
    Script(PathBuf),
    Executable(PathBuf),
}

impl NodeFallbackCandidate {
    fn path(&self) -> &Path {
        match self {
            Self::Script(path) | Self::Executable(path) => path,
        }
    }

    fn label(&self) -> String {
        match self {
            Self::Script(path) => format!("node {}", path.display()),
            Self::Executable(path) => path.display().to_string(),
        }
    }
}

fn node_fallback_candidates() -> Vec<NodeFallbackCandidate> {
    let mut resource_dirs = Vec::new();

    if let Ok(dir) = std::env::var("TL_RESOURCES_DIR") {
        push_unique_path(&mut resource_dirs, PathBuf::from(dir));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            if let Some(contents_dir) = exe_dir.parent() {
                push_unique_path(&mut resource_dirs, contents_dir.join("Resources"));
                push_unique_path(&mut resource_dirs, exe_dir.join("Resources"));
                push_unique_path(&mut resource_dirs, contents_dir.join("Resources/resources"));
            }
            push_unique_path(&mut resource_dirs, exe_dir.join("resources"));
            push_unique_path(&mut resource_dirs, exe_dir.to_path_buf());
        }
    }

    if let Ok(current_dir) = std::env::current_dir() {
        push_unique_path(&mut resource_dirs, current_dir.join("resources"));
        push_unique_path(&mut resource_dirs, current_dir.join("src-tauri/resources"));
    }

    let mut candidates = Vec::new();
    for dir in resource_dirs {
        candidates.push(NodeFallbackCandidate::Executable(dir.join(
            if cfg!(windows) {
                "qiandao_fire.exe"
            } else {
                "qiandao_fire"
            },
        )));
        candidates.push(NodeFallbackCandidate::Script(dir.join("qiandao_fire.cjs")));
        candidates.push(NodeFallbackCandidate::Script(dir.join("qiandao_fire.mjs")));
    }

    candidates
}

fn push_unique_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !paths.iter().any(|existing| existing == &path) {
        paths.push(path);
    }
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

    let now = Utc::now();
    let source_time = (now + chrono::Duration::hours(8))
        .format("%Y/%m/%d %H:%M:%S")
        .to_string();

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
        source_time: Some(source_time),
        scraped_at: now.timestamp(),
    })
}

fn round_to_4(value: f64) -> f64 {
    (value * 10000.0).round() / 10000.0
}

fn deserialize_optional_f64<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(value.and_then(|v| match v {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => {
            let normalized = s.trim().trim_end_matches('%').replace(',', "");
            normalized.parse::<f64>().ok()
        }
        _ => None,
    }))
}

fn deserialize_optional_string<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(value.and_then(|v| match v {
        serde_json::Value::Null => None,
        serde_json::Value::String(s) => Some(s),
        serde_json::Value::Number(n) => Some(n.to_string()),
        serde_json::Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }))
}

fn deserialize_f64<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    deserialize_optional_f64(deserializer).map(|opt| opt.unwrap_or_default())
}

fn deserialize_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    deserialize_optional_string(deserializer).map(|opt| opt.unwrap_or_default())
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
#[allow(dead_code)]
struct NodeJsData {
    #[serde(default, deserialize_with = "deserialize_f64")]
    fire_per_rmb: f64,
    #[serde(default, deserialize_with = "deserialize_f64")]
    rmb_per_fire: f64,
    #[serde(default, deserialize_with = "deserialize_f64")]
    ten_k: f64,
    #[serde(default, deserialize_with = "deserialize_f64")]
    increase_ratio: f64,
    #[serde(default, deserialize_with = "deserialize_string")]
    trading_volume: String,
    #[serde(default, deserialize_with = "deserialize_string")]
    source: String,
    #[serde(default, deserialize_with = "deserialize_string")]
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

    #[test]
    fn parse_node_output_accepts_flat_and_nested_payloads() {
        let flat = parse_node_output(
            r#"{"fire_per_rmb":"200.5","rmb_per_fire":49.8753,"ten_k":49.8753,"increase_ratio":"1.25%","trading_volume":42,"source":"千岛API","ts":"2026-05-08 12:00"}"#,
        )
        .expect("flat node output should parse");
        assert_eq!(flat.fire_per_rmb, 200.5);
        assert_eq!(flat.increase_ratio, 1.25);
        assert_eq!(flat.trading_volume, "42");

        let nested = parse_node_output(
            r#"{"data":{"fire_per_rmb":200.5,"rmb_per_fire":49.8753,"ten_k":49.8753,"increase_ratio":1.25,"trading_volume":"42","source":"千岛API","ts":"2026-05-08 12:00"}}"#,
        )
        .expect("nested node output should parse");
        assert_eq!(nested.fire_per_rmb, 200.5);
        assert_eq!(nested.rmb_per_fire, 49.8753);
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
