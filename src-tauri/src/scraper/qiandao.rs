use crate::core::errors::AppError;
use crate::core::state::{FirePriceSnapshot, SeasonApiConfig};
use chrono::Utc;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::time::Duration;

const QIANDAO_API: &str = "https://api.qiandao.com";

pub async fn scrape_fire_price() -> Result<FirePriceSnapshot, AppError> {
    scrape_by_mode("普通").await
}

pub async fn scrape_by_mode(mode: &str) -> Result<FirePriceSnapshot, AppError> {
    scrape_by_mode_with_api_config(mode, None).await
}

pub async fn scrape_by_mode_with_api_config(
    mode: &str,
    api_config: Option<&SeasonApiConfig>,
) -> Result<FirePriceSnapshot, AppError> {
    tracing::info!("Starting fire price scrape for mode: {}", mode);

    // 千岛 API 偶发超时/连接重置/临时 5xx。
    // 失败立即重试：第 1 次失败 → 等 5s 重试 → 第 2 次失败 → 等 15s 重试 → 第 3 次失败 → 放弃
    // 这样能扛过短暂的 API 抖动，避免 hourly snapshot 整点漏抓。
    const MAX_ATTEMPTS: usize = 3;
    const BACKOFF_SECS: [u64; 2] = [5, 15];

    let mut last_err: Option<AppError> = None;
    for attempt in 1..=MAX_ATTEMPTS {
        // 千岛 API 对 Rust reqwest 的 HTTP/2 连接不稳定（经常 hang 住或返回 405），
        // 优先使用 Node.js 原生 http2 模块（nghttp2）作为第一选择，
        // 只有当 Node.js fallback 不可用时才尝试 Rust reqwest。
        let result = match scrape_via_node_script(mode, api_config).await {
            Ok(snapshot) => Ok(snapshot),
            Err(node_err) => {
                tracing::warn!(
                    "Node.js Qiandao scrape failed (attempt {}/{}): {}; falling back to Rust reqwest",
                    attempt, MAX_ATTEMPTS, node_err
                );
                scrape_via_rust(mode, api_config).await
            }
        };

        match result {
            Ok(snapshot) => {
                if attempt > 1 {
                    tracing::info!(
                        "Qiandao scrape succeeded on attempt {}/{}",
                        attempt, MAX_ATTEMPTS
                    );
                }
                return Ok(snapshot);
            }
            Err(e) => {
                tracing::warn!(
                    "Qiandao scrape failed (attempt {}/{}): {}",
                    attempt, MAX_ATTEMPTS, e
                );
                last_err = Some(e);
                if attempt < MAX_ATTEMPTS {
                    let backoff = BACKOFF_SECS.get(attempt - 1).copied().unwrap_or(15);
                    tracing::info!("Retrying in {}s...", backoff);
                    tokio::time::sleep(Duration::from_secs(backoff)).await;
                }
            }
        }
    }

    Err(last_err.unwrap_or_else(|| {
        AppError::Scrape("Qiandao scrape failed after retries with no captured error".to_string())
    }))
}

async fn scrape_via_rust(
    mode: &str,
    api_config: Option<&SeasonApiConfig>,
) -> Result<FirePriceSnapshot, AppError> {
    let (tag_id, spec_id) = resolve_qiandao_params(mode, api_config);

    let timestamp = Utc::now().timestamp_millis().to_string();
    let body = serde_json::json!({
        "tagId": tag_id,
        "offset": 0,
        "limit": 20,
        "specIds": [spec_id]
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
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
        .header("user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
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

async fn scrape_via_node_script(
    mode: &str,
    api_config: Option<&SeasonApiConfig>,
) -> Result<FirePriceSnapshot, AppError> {
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
        match run_node_fallback(candidate, mode, api_config).await {
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
    api_config: Option<&SeasonApiConfig>,
) -> Result<FirePriceSnapshot, AppError> {
    let (tag_id, spec_id) = resolve_qiandao_params(mode, api_config);
    let (runner, script) = match candidate {
        NodeFallbackCandidate::Script { runner, path } => (runner.clone(), path.clone()),
    };

    let mode_arg = if mode == "专家" {
        "pro".to_string()
    } else {
        "normal".to_string()
    };
    let tag_id = tag_id.to_string();
    let spec_id = spec_id.to_string();

    // 使用独立线程 + mpsc channel 执行 Node.js 脚本，完全绕过 tokio async 机制，
    // 避免 tokio 的 process/timer 在 Tauri 应用运行时可能遇到的异常 hang 住问题。
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut command = std::process::Command::new(&runner);
        command.arg(&script);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
            command.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
        }

        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            unsafe {
                command.pre_exec(|| {
                    // 关闭所有继承的文件描述符（>=3），防止子进程因继承父进程 fd 导致网络操作异常
                    let max_fd = libc::getdtablesize();
                    for fd in 3..max_fd {
                        if libc::fcntl(fd, libc::F_GETFD) != -1 {
                            libc::close(fd);
                        }
                    }
                    Ok(())
                });
            }
        }

        let result = command
            .arg(&mode_arg)
            .env("QIANDAO_TAG_ID", &tag_id)
            .env("QIANDAO_SPEC_ID", &spec_id)
            .stdin(std::process::Stdio::null())
            .output();
        let _ = tx.send(result);
    });

    let output = rx
        .recv_timeout(Duration::from_secs(15))
        .map_err(|_| AppError::Scrape("Node.js script execution timed out after 15s".to_string()))?
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

fn resolve_qiandao_params(mode: &str, api_config: Option<&SeasonApiConfig>) -> (String, String) {
    let default_config = SeasonApiConfig::default();
    let config = api_config.unwrap_or(&default_config);

    let (tag_id, spec_id, fallback_tag, fallback_spec) = if mode == "专家" {
        (
            config.qiandao_tag_id_expert.as_str(),
            config.qiandao_spec_id_expert.as_str(),
            "1560053",
            "267417",
        )
    } else {
        (
            config.qiandao_tag_id_normal.as_str(),
            config.qiandao_spec_id_normal.as_str(),
            "1560053",
            "267416",
        )
    };

    (
        non_empty_or(tag_id, fallback_tag).to_string(),
        non_empty_or(spec_id, fallback_spec).to_string(),
    )
}

fn non_empty_or<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback
    } else {
        trimmed
    }
}

fn safe_slice(s: &str, max_len: usize) -> &str {
    if s.len() <= max_len {
        return s;
    }
    let mut end = max_len;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

fn round_to_4(value: f64) -> f64 {
    (value * 10000.0).round() / 10000.0
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
    Script { runner: String, path: PathBuf },
}

impl NodeFallbackCandidate {
    fn path(&self) -> &Path {
        match self {
            Self::Script { path, .. } => path,
        }
    }

    fn label(&self) -> String {
        match self {
            Self::Script { runner, path } => format!("{} {}", runner, path.display()),
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

    // 优先尝试内嵌的 Node.js 二进制
    for dir in &resource_dirs {
        if let Some(embedded) = embedded_node_in_dir(dir) {
            push_embedded_node_candidate(&mut candidates, dir.join("qiandao_fire.cjs"), &embedded);
            push_embedded_node_candidate(&mut candidates, dir.join("qiandao_fire.mjs"), &embedded);
        }
    }

    // 然后尝试系统 PATH 中的 node
    for dir in resource_dirs {
        push_script_candidates(&mut candidates, dir.join("qiandao_fire.cjs"));
        push_script_candidates(&mut candidates, dir.join("qiandao_fire.mjs"));
    }

    candidates
}

#[cfg(target_os = "windows")]
fn embedded_node_in_dir(dir: &Path) -> Option<PathBuf> {
    let path = dir.join("node.exe");
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

#[cfg(not(target_os = "windows"))]
fn embedded_node_in_dir(dir: &Path) -> Option<PathBuf> {
    let path = dir.join("node");
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

fn push_embedded_node_candidate(
    candidates: &mut Vec<NodeFallbackCandidate>,
    script: PathBuf,
    node: &Path,
) {
    candidates.push(NodeFallbackCandidate::Script {
        runner: node.to_string_lossy().to_string(),
        path: script,
    });
}

#[cfg(target_os = "windows")]
fn push_script_candidates(candidates: &mut Vec<NodeFallbackCandidate>, path: PathBuf) {
    candidates.push(NodeFallbackCandidate::Script {
        runner: "node".to_string(),
        path,
    });
}

#[cfg(not(target_os = "windows"))]
fn push_script_candidates(candidates: &mut Vec<NodeFallbackCandidate>, path: PathBuf) {
    for runner in node_runner_candidates() {
        candidates.push(NodeFallbackCandidate::Script {
            runner,
            path: path.clone(),
        });
    }
}

#[cfg(target_os = "macos")]
fn node_runner_candidates() -> Vec<String> {
    [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
        "node",
    ]
    .into_iter()
    .filter(|runner| runner_exists(runner))
    .map(str::to_string)
    .collect()
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn node_runner_candidates() -> Vec<String> {
    ["node"]
        .into_iter()
        .filter(|runner| runner_exists(runner))
        .map(str::to_string)
        .collect()
}

#[cfg(not(target_os = "windows"))]
fn runner_exists(runner: &str) -> bool {
    runner == "node" || Path::new(runner).exists()
}

fn push_unique_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !paths.iter().any(|existing| existing == &path) {
        paths.push(path);
    }
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
struct NodeJsData {
    #[serde(default, deserialize_with = "deserialize_f64_from_any")]
    fire_per_rmb: f64,
    #[serde(default, deserialize_with = "deserialize_f64_from_any")]
    rmb_per_fire: f64,
    #[serde(default, deserialize_with = "deserialize_f64_from_any")]
    ten_k: f64,
    #[serde(default, deserialize_with = "deserialize_f64_from_any")]
    increase_ratio: f64,
    #[serde(default, deserialize_with = "deserialize_string_from_any")]
    trading_volume: String,
    #[serde(default)]
    source: String,
}

fn deserialize_f64_from_any<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::Number(n) => n
            .as_f64()
            .ok_or_else(|| serde::de::Error::custom("invalid number")),
        serde_json::Value::String(s) => {
            let normalized = s.trim().trim_end_matches('%').replace(',', "");
            normalized
                .parse::<f64>()
                .map_err(|e| serde::de::Error::custom(format!("invalid f64 string: {}", e)))
        }
        _ => Err(serde::de::Error::custom(
            "expected string or number for f64",
        )),
    }
}

fn deserialize_string_from_any<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::String(s) => Ok(s),
        serde_json::Value::Number(n) => Ok(n.to_string()),
        serde_json::Value::Bool(b) => Ok(b.to_string()),
        _ => Err(serde::de::Error::custom("expected stringable value")),
    }
}

fn deserialize_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    deserialize_optional_string(deserializer).map(|opt| opt.unwrap_or_default())
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

    #[tokio::test]
    #[ignore = "calls the live Qiandao API"]
    async fn live_scrape_expert_fire_price() {
        let snapshot = scrape_by_mode("专家")
            .await
            .expect("live Qiandao expert fire scrape should succeed");
        println!(
            "expert fire price: rmb_per_10k_fire={}, fire_per_rmb={}, source={}",
            snapshot.rmb_per_10k_fire, snapshot.fire_per_rmb, snapshot.source
        );
        assert!(snapshot.rmb_per_10k_fire > 0.0);
        assert!(snapshot.fire_per_rmb > 0.0);
        assert!(snapshot.source.contains("千岛API"));
    }

    /// 直接测试 Rust 原生抓取，不走 Node.js fallback
    #[tokio::test]
    #[ignore = "calls the live Qiandao API"]
    async fn live_scrape_rust_only_normal() {
        let snapshot = scrape_via_rust("普通", None)
            .await
            .expect("Rust-only Qiandao normal fire scrape should succeed");
        println!(
            "[RUST ONLY] normal fire price: rmb_per_10k_fire={}, fire_per_rmb={}, source={}",
            snapshot.rmb_per_10k_fire, snapshot.fire_per_rmb, snapshot.source
        );
        assert!(snapshot.rmb_per_10k_fire > 0.0);
        assert!(snapshot.fire_per_rmb > 0.0);
        assert!(snapshot.source.contains("千岛API"));
    }

    /// 直接测试 Rust 原生抓取专家模式，不走 Node.js fallback
    #[tokio::test]
    #[ignore = "calls the live Qiandao API"]
    async fn live_scrape_rust_only_expert() {
        let snapshot = scrape_via_rust("专家", None)
            .await
            .expect("Rust-only Qiandao expert fire scrape should succeed");
        println!(
            "[RUST ONLY] expert fire price: rmb_per_10k_fire={}, fire_per_rmb={}, source={}",
            snapshot.rmb_per_10k_fire, snapshot.fire_per_rmb, snapshot.source
        );
        assert!(snapshot.rmb_per_10k_fire > 0.0);
        assert!(snapshot.fire_per_rmb > 0.0);
        assert!(snapshot.source.contains("千岛API"));
    }
}
