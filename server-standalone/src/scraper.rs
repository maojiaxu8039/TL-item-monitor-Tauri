//! 数据抓取模块
//!
//! 使用客户端的 scraper::qiandao 模块进行火价采集
//! 物品火价采集

use futures_util::stream::{self, StreamExt};
use once_cell::sync::Lazy;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tokio::time::timeout;
use tracing::{debug, info, warn};

use super::config::{ApiConfig, ApiEndpoints};

const QIANDAO_PACKAGE_ID: &str = "1044";
const QIANDAO_SIGN_VERSION: &str = "v1";
const QIANDAO_SIGN_TYPE: &str = "HMAC_SHA256";
const QIANDAO_ORIGIN: &str = "https://qiandao.com";
const QIANDAO_REFERER: &str = "https://qiandao.com/";
const QIANDAO_USER_AGENT: &str = "Mozilla/5.0";
const QIANDAO_ECHO_REGION: &str = "CN";
const QIANDAO_DEFAULT_TOKEN: &str = "Bearer undefined";

fn safe_truncate(s: &str, max_len: usize) -> String {
    // 按字符数（chars）而非字节数截断，避免：
    // 1. 中文场景下 max_len=10 字节最多容纳 3 个汉字，体验差
    // 2. 极端情况下 char_boundary 回退到 0 导致输出只剩 "..."
    if s.chars().count() <= max_len {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max_len).collect();
        format!("{}...", truncated)
    }
}

fn build_http_client(timeout_secs: u64) -> Result<Client, String> {
    let builder = Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .pool_max_idle_per_host(10)
        .tcp_keepalive(Some(Duration::from_secs(60)))
        .tcp_nodelay(true);

    let skip_cert_verify = std::env::var("TL_SKIP_CERT_VERIFY")
        .map(|v| v == "1" || v.to_lowercase() == "true")
        .unwrap_or(false);

    let builder = if skip_cert_verify {
        warn!("跳过 HTTPS 证书验证 (TL_SKIP_CERT_VERIFY=1)");
        builder.danger_accept_invalid_certs(true)
    } else {
        builder
    };
    builder
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))
}

static HTTP_CLIENT: Lazy<Result<Client, String>> = Lazy::new(|| build_http_client(30));
static QIANDAO_CLIENT: Lazy<Result<Client, String>> = Lazy::new(|| build_http_client(15));
static ETOR_CLIENT: Lazy<Result<Client, String>> = Lazy::new(|| build_http_client(12));

fn http_client() -> Result<&'static Client, String> {
    HTTP_CLIENT.as_ref().map_err(|e| e.clone())
}

fn qiandao_client() -> Result<&'static Client, String> {
    QIANDAO_CLIENT.as_ref().map_err(|e| e.clone())
}

fn etor_client() -> Result<&'static Client, String> {
    ETOR_CLIENT.as_ref().map_err(|e| e.clone())
}

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
pub(crate) struct LuosiItem {
    name: String,
    #[serde(rename = "price")]
    item_price: Option<f64>,
    #[serde(rename = "type")]
    item_type: Option<String>,
    #[serde(rename = "is_placeholder")]
    #[allow(dead_code)]
    is_placeholder: Option<bool>,
    last_time: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[allow(dead_code)]
pub struct Item {
    pub item_id: String,
    pub name: String,
    pub item_type: String,
    pub price: f64,
    pub last_time: i64,
    pub source: String,
}

const SCRAPE_MAX_RETRIES: u32 = 3;
const SCRAPE_RETRY_DELAY_MS: u64 = 1000;
const ETOR_BASE_URL: &str = "https://etor.710421059.xyz";
const ETOR_INVALID_PRICE_MARKER: f64 = 710421059.0;
const ETOR_CHART_CONCURRENCY: usize = 48;
const ETOR_CHART_TIMEOUT_SECS: u64 = 8;

#[derive(Debug, Clone, Deserialize)]
struct MappingEntry {
    name: String,
    #[serde(rename = "type", default)]
    item_type: String,
    #[serde(default)]
    source: String,
}

static ITEM_MAPPING: Lazy<HashMap<String, MappingEntry>> = Lazy::new(|| {
    // 资源加载策略（按优先级）：
    // 1. 运行时路径: TL_RESOURCES_DIR 环境变量 / 配置文件 resources_dir 指定的目录
    //    → 容器化部署时挂载 ./resources/ 即可，无需 rebuild
    // 2. 编译时内置: include_str!("../../src-tauri/resources/item_id_mapping.json")
    //    → 保留向后兼容，单仓开发时仍可用
    // 3. 都没找到 → 返回空 Map，ETOR 抓取功能降级（warn 告警）
    let mut json_text: Option<String> = None;

    // 1. 尝试运行时路径
    if let Some(resources_dir) = std::env::var_os("TL_RESOURCES_DIR") {
        let p = std::path::Path::new(&resources_dir).join("item_id_mapping.json");
        if let Ok(content) = std::fs::read_to_string(&p) {
            info!("[ETOR] Loaded item mapping from runtime path: {}", p.display());
            json_text = Some(content);
        } else {
            warn!("[ETOR] TL_RESOURCES_DIR set but file not found: {}", p.display());
        }
    }

    // 2. 回退到编译时内置
    if json_text.is_none() {
        let builtin = include_str!("../../src-tauri/resources/item_id_mapping.json");
        info!("[ETOR] Loaded item mapping from built-in (跨项目编译时依赖)");
        json_text = Some(builtin.to_string());
    }

    let json = json_text.unwrap_or_default();
    match serde_json::from_str::<HashMap<String, MappingEntry>>(&json) {
        Ok(mut mapping) => {
            let original_count = mapping.len();
            let deduplicated = dedupe_mapping_by_name(&mut mapping);
            info!(
                "[ETOR] Loaded {} item mappings (deduplicated={}, final={})",
                original_count,
                deduplicated,
                mapping.len()
            );
            mapping
        }
        Err(e) => {
            warn!("[ETOR] Failed to parse item mapping: {}", e);
            HashMap::new()
        }
    }
});

pub struct Scraper;

impl Scraper {
    pub async fn scrape_items(
        season_id: &str,
        market_mode: &str,
        config: &ApiConfig,
        endpoints: &ApiEndpoints,
    ) -> Result<Vec<Item>, String> {
        Self::scrape_dual_items(season_id, market_mode, config, endpoints).await
    }

    async fn scrape_luosi_items(
        season_id: &str,
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

        let resp = http_client()?
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

        let raw_count = map.len();

        let now = chrono::Utc::now().timestamp();
        let items: Vec<Item> = map
            .into_iter()
            .map(|(item_id, item)| Item {
                item_id,
                name: item.name,
                item_type: item.item_type.unwrap_or_default(),
                price: item.item_price.unwrap_or(0.0),
                last_time: item.last_time.unwrap_or(now),
                source: "luosi_api".to_string(),
            })
            .collect();

        debug!(
            "抓取刷图小助手物品: season={}, mode={}, 总数={}",
            season_id, market_mode, raw_count
        );
        Ok(items)
    }

    async fn scrape_etor_items(
        season_id: &str,
        market_mode: &str,
        config: &ApiConfig,
    ) -> Result<Vec<Item>, String> {
        let api_season_id = if market_mode.contains("expert") {
            config.etor_season_id_expert
        } else {
            config.etor_season_id_normal
        };
        let now = chrono::Utc::now().timestamp();
        let item_ids: Vec<String> = ITEM_MAPPING.keys().cloned().collect();

        info!(
            "[ETOR] Fetching chart data for {} items (season={}, api_season_id={}, concurrency={})",
            item_ids.len(),
            season_id,
            api_season_id,
            ETOR_CHART_CONCURRENCY
        );

        let chart_results = fetch_etor_chart_data_concurrent(api_season_id, &item_ids).await?;
        let mut items = Vec::new();
        let mut failed_count = 0usize;

        for (item_id, chart) in chart_results {
            match chart.and_then(|data| data.end_price.map(|price| (data, price))) {
                Some((data, price)) if price > 0.0 && price < ETOR_INVALID_PRICE_MARKER => {
                    let entry = ITEM_MAPPING.get(&item_id);
                    let name = entry
                        .map(|e| e.name.clone())
                        .unwrap_or_else(|| format!("未知物品_{}", item_id));
                    let item_type = entry.map(|e| e.item_type.clone()).unwrap_or_default();
                    let last_time = data.last_timestamp.or(data.start_timestamp).unwrap_or(now);
                    items.push(Item {
                        item_id: item_id.clone(),
                        name,
                        item_type,
                        price,
                        last_time,
                        source: "etor_api".to_string(),
                    });
                }
                _ => failed_count += 1,
            }
        }

        info!(
            "[ETOR] Chart fetch complete: success={}, failed={}, total={} for {}/{}",
            items.len(),
            failed_count,
            item_ids.len(),
            season_id,
            market_mode
        );

        if items.is_empty() {
            return Err("易火 API 未返回有效物品价格".to_string());
        }

        Ok(items)
    }

    async fn scrape_dual_items(
        season_id: &str,
        market_mode: &str,
        config: &ApiConfig,
        endpoints: &ApiEndpoints,
    ) -> Result<Vec<Item>, String> {
        info!(
            "[ITEM-SOURCE] Fetching items from DUAL sources for {}/{}",
            season_id, market_mode
        );

        let (luosi_res, etor_res) = tokio::join!(
            Self::scrape_luosi_items(season_id, market_mode, config, endpoints),
            Self::scrape_etor_items(season_id, market_mode, config),
        );

        let luosi_items = match luosi_res {
            Ok(items) => {
                info!("[ITEM-SOURCE] DUAL: luosi returned {} items", items.len());
                Some(items)
            }
            Err(e) => {
                warn!("[ITEM-SOURCE] DUAL: luosi failed: {}", e);
                None
            }
        };

        let etor_items = match etor_res {
            Ok(items) => {
                info!("[ITEM-SOURCE] DUAL: etor returned {} items", items.len());
                Some(items)
            }
            Err(e) => {
                warn!("[ITEM-SOURCE] DUAL: etor failed: {}", e);
                None
            }
        };

        match (luosi_items, etor_items) {
            (Some(l), Some(e)) => {
                let merged = merge_dual_items(l, e);
                info!(
                    "[ITEM-SOURCE] DUAL: merged {} items for {}",
                    merged.len(),
                    market_mode
                );
                Ok(merged)
            }
            (Some(l), None) => {
                warn!("[ITEM-SOURCE] DUAL: using luosi only for {}", market_mode);
                Ok(l)
            }
            (None, Some(e)) => {
                warn!("[ITEM-SOURCE] DUAL: using etor only for {}", market_mode);
                Ok(e)
            }
            (None, None) => Err(format!(
                "DUAL scrape failed for {}: both sources failed",
                market_mode
            )),
        }
    }

    pub async fn scrape_fire_price(
        market_mode: &str,
        config: &ApiConfig,
        endpoints: &ApiEndpoints,
    ) -> Result<FirePriceSnapshot, String> {
        let mode = if market_mode.contains("expert") {
            "专家"
        } else {
            "普通"
        };
        debug!("抓取火价 (模式: {})", mode);

        let mut last_error = String::new();

        for attempt in 1..=SCRAPE_MAX_RETRIES {
            match scrape_via_rust(mode, config, endpoints).await {
                Ok(snapshot) => {
                    debug!("火价获取成功: {} 火/元", snapshot.fire_per_rmb);
                    return Ok(snapshot);
                }
                Err(rust_e) => {
                    last_error = rust_e;
                    warn!(
                        "Rust 火价抓取失败 (尝试 {}/{}): {}，尝试 Node 脚本",
                        attempt, SCRAPE_MAX_RETRIES, last_error
                    );

                    match scrape_via_node_script(mode).await {
                        Ok(snapshot) => {
                            debug!("Node 脚本火价获取成功: {} 火/元", snapshot.fire_per_rmb);
                            return Ok(snapshot);
                        }
                        Err(node_e) => {
                            warn!("Node 脚本火价抓取失败: {}", node_e);
                            if attempt < SCRAPE_MAX_RETRIES {
                                info!("{}ms 后重试...", SCRAPE_RETRY_DELAY_MS);
                                tokio::time::sleep(Duration::from_millis(SCRAPE_RETRY_DELAY_MS))
                                    .await;
                            }
                        }
                    }
                }
            }
        }

        Err(format!(
            "火价抓取在 {} 次尝试后仍失败 (最后 Rust 错误: {})",
            SCRAPE_MAX_RETRIES, last_error
        ))
    }
}

#[derive(Debug, Deserialize)]
struct EtorChartResponse {
    #[serde(default)]
    trend: Option<Vec<EtorTrendItem>>,
    #[serde(default)]
    summary: Option<EtorSummary>,
}

#[derive(Debug, Deserialize)]
struct EtorTrendItem {
    timestamp: i64,
    price: f64,
}

#[derive(Debug, Deserialize)]
struct EtorSummary {
    #[serde(rename = "endPrice")]
    end_price: Option<f64>,
    #[serde(rename = "lastTimestamp")]
    last_timestamp: Option<i64>,
}

#[derive(Debug, Clone)]
struct EtorChartSummary {
    end_price: Option<f64>,
    start_timestamp: Option<i64>,
    last_timestamp: Option<i64>,
}

async fn fetch_etor_chart_data_concurrent(
    api_season_id: i32,
    item_ids: &[String],
) -> Result<Vec<(String, Option<EtorChartSummary>)>, String> {
    let client = etor_client()?.clone();
    let results = stream::iter(item_ids.iter().cloned())
        .map(|item_id| {
            let client = client.clone();
            async move {
                let result = timeout(
                    Duration::from_secs(ETOR_CHART_TIMEOUT_SECS),
                    fetch_single_etor_chart(&client, api_season_id, &item_id),
                )
                .await
                .unwrap_or_else(|_| {
                    debug!(
                        "[ETOR] Chart request timed out for {} after {}s",
                        item_id, ETOR_CHART_TIMEOUT_SECS
                    );
                    None
                });
                (item_id, result)
            }
        })
        .buffer_unordered(ETOR_CHART_CONCURRENCY)
        .collect()
        .await;
    Ok(results)
}

async fn fetch_single_etor_chart(
    client: &Client,
    api_season_id: i32,
    item_id: &str,
) -> Option<EtorChartSummary> {
    let url = format!(
        "{}/etor-api/api/chart/{}/{}?interval=15m",
        ETOR_BASE_URL, api_season_id, item_id
    );

    let resp = match client
        .get(&url)
        .header("accept", "application/json,text/plain,*/*")
        .header("accept-language", "zh-CN,zh;q=0.9")
        .header(
            "user-agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        .header("x-frontend-version", "10.5.50")
        .header("seasonid", api_season_id.to_string())
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            debug!("[ETOR] Chart request failed for {}: {}", item_id, e);
            return None;
        }
    };

    if !resp.status().is_success() {
        debug!("[ETOR] Chart API status {} for {}", resp.status(), item_id);
        return None;
    }

    let text = match resp.text().await {
        Ok(text) => text,
        Err(e) => {
            debug!("[ETOR] Chart read failed for {}: {}", item_id, e);
            return None;
        }
    };

    if !text.starts_with('{') && !text.starts_with('[') {
        let preview = text.chars().take(50).collect::<String>();
        warn!("[ETOR] Non-JSON response for {}: {}...", item_id, preview);
        return None;
    }

    let chart_resp: EtorChartResponse = match serde_json::from_str(&text) {
        Ok(r) => r,
        Err(e) => {
            warn!("[ETOR] Chart parse failed for {}: {}", item_id, e);
            return None;
        }
    };

    let summary = chart_resp.summary?;
    let trend = chart_resp.trend;
    let summary_last_ts = summary.last_timestamp.map(normalize_timestamp);
    let last_ts = trend
        .as_ref()
        .and_then(|t| t.last())
        .map(|t| normalize_timestamp(t.timestamp))
        .or(summary_last_ts);

    Some(EtorChartSummary {
        end_price: summary
            .end_price
            .or_else(|| trend.as_ref().and_then(|t| t.last()).map(|t| t.price)),
        start_timestamp: trend
            .as_ref()
            .and_then(|t| t.first())
            .map(|t| normalize_timestamp(t.timestamp)),
        last_timestamp: last_ts,
    })
}

fn normalize_timestamp(ts: i64) -> i64 {
    if ts > 10_000_000_000 {
        ts / 1000
    } else {
        ts
    }
}

fn merge_dual_items(luosi_items: Vec<Item>, etor_items: Vec<Item>) -> Vec<Item> {
    let mut map: HashMap<String, Item> =
        HashMap::with_capacity(luosi_items.len() + etor_items.len());
    let input_total = luosi_items.len() + etor_items.len();

    for item in luosi_items.into_iter().chain(etor_items) {
        match map.get(&item.item_id) {
            Some(existing) if should_keep_existing_item(existing, &item) => {}
            _ => {
                map.insert(item.item_id.clone(), item);
            }
        }
    }

    let after_id_merge = map.len();
    let mut canonical_by_name: HashMap<String, String> = HashMap::with_capacity(map.len());
    let mut ids: Vec<String> = map.keys().cloned().collect();
    ids.sort_by_key(|id| numeric_item_id(id));

    for item_id in ids {
        let Some(item) = map.get(&item_id) else {
            continue;
        };
        let normalized_name = normalize_item_name(&item.name);
        if normalized_name.is_empty() || normalized_name.starts_with("未知物品_") {
            continue;
        }

        match canonical_by_name.get(&normalized_name).cloned() {
            Some(current_id) => {
                let current_item = map.get(&current_id).cloned();
                let candidate_item = map.get(&item_id).cloned();
                let (Some(current_item), Some(candidate_item)) = (current_item, candidate_item)
                else {
                    continue;
                };

                if should_keep_existing_item(&current_item, &candidate_item) {
                    map.remove(&item_id);
                } else {
                    map.remove(&current_id);
                    canonical_by_name.insert(normalized_name, item_id.clone());
                    if let Some(winner) = map.get_mut(&item_id) {
                        winner.name = normalize_item_name(&winner.name);
                    }
                }
            }
            None => {
                if let Some(item) = map.get_mut(&item_id) {
                    item.name = normalized_name.clone();
                }
                canonical_by_name.insert(normalized_name, item_id);
            }
        }
    }

    let output_total = map.len();
    if input_total != output_total {
        info!(
            "[ITEM-SOURCE] DUAL: input={}, after_id_merge={}, after_name_merge={}, removed_by_name={}",
            input_total,
            after_id_merge,
            output_total,
            after_id_merge.saturating_sub(output_total)
        );
    }

    map.into_values().collect()
}

fn should_keep_existing_item(existing: &Item, candidate: &Item) -> bool {
    item_score(existing) >= item_score(candidate)
}

fn item_score(item: &Item) -> (i64, u8, u8, std::cmp::Reverse<u64>) {
    (
        item.last_time,
        u8::from(item.price > 0.0),
        item_source_rank(&item.source),
        std::cmp::Reverse(numeric_item_id(&item.item_id)),
    )
}

fn item_source_rank(source: &str) -> u8 {
    match source {
        "etor_api" => 3,
        "luosi_api" => 2,
        _ => 1,
    }
}

fn normalize_item_name(name: &str) -> String {
    name.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn numeric_item_id(item_id: &str) -> u64 {
    item_id.parse::<u64>().unwrap_or(u64::MAX)
}

fn dedupe_mapping_by_name(mapping: &mut HashMap<String, MappingEntry>) -> usize {
    let mut canonical_by_name: HashMap<String, String> = HashMap::new();
    let mut ids: Vec<String> = mapping.keys().cloned().collect();
    ids.sort_by_key(|id| numeric_item_id(id));

    let mut removed = 0usize;
    for item_id in ids {
        let Some(entry) = mapping.get(&item_id) else {
            continue;
        };
        let normalized_name = normalize_item_name(&entry.name);
        if normalized_name.is_empty() || normalized_name.starts_with("未知物品_") {
            continue;
        }

        match canonical_by_name.get(&normalized_name).cloned() {
            Some(current_id) => {
                let current_entry = mapping.get(&current_id).cloned();
                let candidate_entry = mapping.get(&item_id).cloned();
                let (Some(current_entry), Some(candidate_entry)) = (current_entry, candidate_entry)
                else {
                    continue;
                };

                if mapping_score(&current_id, &current_entry)
                    >= mapping_score(&item_id, &candidate_entry)
                {
                    mapping.remove(&item_id);
                } else {
                    mapping.remove(&current_id);
                    canonical_by_name.insert(normalized_name, item_id.clone());
                    if let Some(winner) = mapping.get_mut(&item_id) {
                        winner.name = normalize_item_name(&winner.name);
                    }
                }
                removed += 1;
            }
            None => {
                if let Some(entry) = mapping.get_mut(&item_id) {
                    entry.name = normalized_name.clone();
                }
                canonical_by_name.insert(normalized_name, item_id);
            }
        }
    }
    removed
}

fn mapping_score(item_id: &str, entry: &MappingEntry) -> (u8, u8, u8, std::cmp::Reverse<u64>) {
    (
        mapping_source_rank(&entry.source),
        u8::from(!entry.name.trim().is_empty() && !entry.name.starts_with("未知物品_")),
        u8::from(!entry.item_type.trim().is_empty()),
        std::cmp::Reverse(numeric_item_id(item_id)),
    )
}

fn mapping_source_rank(source: &str) -> u8 {
    match source {
        "both" => 4,
        "etor" => 3,
        "tl" => 2,
        _ => 1,
    }
}

async fn scrape_via_rust(
    mode: &str,
    config: &ApiConfig,
    endpoints: &ApiEndpoints,
) -> Result<FirePriceSnapshot, String> {
    let (tag_id, spec_id) = if mode == "专家" {
        (
            config.qiandao_tag_id_expert.as_str(),
            config.qiandao_spec_id_expert.to_string(),
        )
    } else {
        (
            config.qiandao_tag_id_normal.as_str(),
            config.qiandao_spec_id_normal.to_string(),
        )
    };

    let qiandao_url = format!("{}{}", endpoints.qiandao, endpoints.qiandao_fire_endpoint);
    let timestamp = chrono::Utc::now().timestamp_millis().to_string();
    let body = serde_json::json!({
        "tagId": tag_id,
        "offset": 0,
        "limit": 20,
        "specIds": [spec_id]
    });

    let resp = qiandao_client()?
        .post(&qiandao_url)
        .header("content-type", "application/json")
        .header("authorization", QIANDAO_DEFAULT_TOKEN)
        .header("x-request-timestamp", &timestamp)
        .header("x-request-sign-type", QIANDAO_SIGN_TYPE)
        .header("x-request-sign-version", QIANDAO_SIGN_VERSION)
        .header("x-request-package-id", QIANDAO_PACKAGE_ID)
        .header("origin", QIANDAO_ORIGIN)
        .header("referer", QIANDAO_REFERER)
        .header("user-agent", QIANDAO_USER_AGENT)
        .header("x-echo-region", QIANDAO_ECHO_REGION)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("HTTP response read failed: {}", e))?;

    info!(
        "火价API响应: status={}, body={}",
        status,
        safe_truncate(&text, 300)
    );

    if !status.is_success() {
        return Err(format!(
            "Qiandao HTTP status error: {} | body: {}",
            status,
            safe_truncate(&text, 200)
        ));
    }

    let data: QiandaoResponse = serde_json::from_str(&text).map_err(|e| {
        format!(
            "JSON parse error: {} | body: {}",
            e,
            safe_truncate(&text, 200)
        )
    })?;

    parse_qiandao_response(data, mode)
}

async fn scrape_via_node_script(mode: &str) -> Result<FirePriceSnapshot, String> {
    let mut possible_scripts: Vec<std::path::PathBuf> = vec![];

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            possible_scripts.push(parent.join("resources/qiandao_fire.cjs"));
            possible_scripts.push(parent.join("resources/qiandao_fire.mjs"));
        }
    }

    possible_scripts.push(std::path::PathBuf::from("resources/qiandao_fire.cjs"));
    possible_scripts.push(std::path::PathBuf::from("resources/qiandao_fire.mjs"));

    if let Ok(dir) = std::env::var("TL_RESOURCES_DIR") {
        possible_scripts.push(std::path::PathBuf::from(dir.clone()).join("qiandao_fire.cjs"));
        possible_scripts.push(std::path::PathBuf::from(dir).join("qiandao_fire.mjs"));
    }

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

    debug!("使用 Node 脚本抓取火价: {}", script_path.display());

    let mut cmd = tokio::process::Command::new("node");
    cmd.arg(&script_path)
        .arg(if mode == "专家" { "pro" } else { "normal" });

    debug!(
        "执行命令: node {} {}",
        script_path.display(),
        if mode == "专家" { "pro" } else { "normal" }
    );

    const NODE_SCRIPT_TIMEOUT_SECS: u64 = 30;
    let output = timeout(Duration::from_secs(NODE_SCRIPT_TIMEOUT_SECS), cmd.output())
        .await
        .map_err(|_| format!("Node.js script 执行超时 ({}秒)", NODE_SCRIPT_TIMEOUT_SECS))?
        .map_err(|e| format!("Node execution failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout_str = stdout.trim();
    let stderr_str = stderr.trim();

    debug!("Node stdout: {}", stdout_str);
    debug!("Node stderr: {}", stderr_str);
    debug!("Node exit code: {:?}", output.status.code());

    if !output.status.success() {
        return Err(format!(
            "Node.js script exited with code {:?}: {}",
            output.status.code(),
            stderr_str
        ));
    }

    let mut json_str = stdout_str.to_string();

    if (json_str.starts_with("{\"error\"") || json_str.is_empty() || json_str == "null")
        && stderr_str.contains("fire_per_rmb")
    {
        let lines: Vec<&str> = stderr_str.lines().collect();
        for line in lines.iter().rev() {
            if line.starts_with('{') && line.contains("fire_per_rmb") {
                json_str = line.to_string();
                break;
            }
        }
    }

    if !json_str.starts_with('{') || json_str.starts_with("{\"error\"") {
        return Err("No fire price data in Node output".to_string());
    }

    debug!("使用 JSON: {}", json_str);
    debug!("解析 Node 输出...");

    #[derive(Deserialize)]
    #[allow(dead_code)]
    struct NodeFireResult {
        error: Option<String>,
        fire_per_rmb: f64,
        #[serde(default)]
        #[allow(dead_code)]
        rmb_per_fire: f64,
        ten_k: f64,
        #[serde(default)]
        increase_ratio: f64,
        #[serde(default)]
        trading_volume: String,
        source: String,
        #[allow(dead_code)]
        ts: String,
    }

    let result: NodeFireResult = serde_json::from_str(&json_str)
        .map_err(|e| format!("JSON parse error: {} | input: {}", e, json_str))?;

    if let Some(error) = result.error {
        return Err(format!("Node error: {}", error));
    }

    let now = chrono::Utc::now();
    let now_timestamp = now.timestamp();

    // 时间字段约定（双时区统一规范）：
    // - scraped_at (DB INTEGER) = UTC milliseconds/seconds 抓取瞬间
    //   用于: 增量同步查询、ORDER BY 排序、时间范围过滤
    //   特点: 时区无关, 适合做算术运算
    // - source_time (DB TEXT) = RFC3339 带 +08:00 时区后缀的北京时间字符串
    //   用于: 用户展示、客户端"上次更新时间"显示
    //   特点: 人类可读, 跨时区用户能理解
    // 之前 source_time 不带时区, 跨时区用户看到错乱 1 小时
    // 现在统一约定"DB 内 UTC, 展示层 BJT", 避免混用导致的 bug
    //
    // source_time 显式标注 +08:00 时区后缀（RFC3339 风格）
    // 之前格式 "%Y/%m/%d %H:%M:%S" 没有时区信息，下游消费方会误以为是 UTC 或本地时间
    // 业务影响：客户端显示"游戏 16:00 更新"实际是抓取瞬间北京时间，
    // 跨时区用户看到时间错乱 1 小时
    let beijing_offset = chrono::FixedOffset::east_opt(8 * 3600)
        .expect("北京时区偏移 8h 一定是合法的");
    let source_time = now
        .with_timezone(&beijing_offset)
        .format("%Y-%m-%dT%H:%M:%S+08:00")
        .to_string();

    Ok(FirePriceSnapshot {
        rmb_per_10k_fire: result.ten_k,
        fire_per_rmb: result.fire_per_rmb,
        increase_ratio: result.increase_ratio,
        trading_volume: result.trading_volume,
        source: result.source,
        source_time,
        scraped_at: now_timestamp,
    })
}

fn parse_qiandao_response(data: QiandaoResponse, mode: &str) -> Result<FirePriceSnapshot, String> {
    if data.code != "0" {
        return Err(format!(
            "Qiandao API error: code={:?}, errCode={:?}, msg={:?}",
            data.code, data.err_code, data._msg
        ));
    }

    let item = data
        .data
        .and_then(|d| d.items)
        .and_then(|mut items| items.drain(..).next())
        .ok_or_else(|| "No fire price data in response".to_string())?;

    let ratio_price = item.ratio_price.unwrap_or(0.0);
    let rmb_per_10k_fire = if ratio_price > 0.0 {
        round_to_4(10000.0 / ratio_price)
    } else {
        0.0
    };

    let now = chrono::Utc::now();
    // 显式带 +08:00 时区后缀，与上面 fire_price 一致
    let beijing_offset = chrono::FixedOffset::east_opt(8 * 3600)
        .expect("北京时区偏移 8h 一定是合法的");
    let source_time = now
        .with_timezone(&beijing_offset)
        .format("%Y-%m-%dT%H:%M:%S+08:00")
        .to_string();

    Ok(FirePriceSnapshot {
        rmb_per_10k_fire,
        fire_per_rmb: ratio_price,
        increase_ratio: item.change_pct.unwrap_or(0.0),
        trading_volume: item.change_24h.unwrap_or_default(),
        source: format!(
            "千岛API-{}",
            if mode == "专家" {
                "赛季专家"
            } else {
                "赛季普通"
            }
        ),
        source_time,
        scraped_at: now.timestamp(),
    })
}

fn round_to_4(value: f64) -> f64 {
    (value * 10000.0).round() / 10000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_to_4_basic() {
        assert_eq!(round_to_4(1.23456), 1.2346);
        assert_eq!(round_to_4(1.23444), 1.2344);
        assert_eq!(round_to_4(0.0), 0.0);
        assert_eq!(round_to_4(100.0), 100.0);
    }

    #[test]
    fn round_to_4_negative() {
        assert_eq!(round_to_4(-1.23456), -1.2346);
        assert_eq!(round_to_4(-0.00001), 0.0);
    }

    #[test]
    fn round_to_4_huge() {
        // 确保大数无溢出
        let v = round_to_4(1.23456789012345e10);
        assert!((v - 1.23456789012345e10).abs() < 1.0);
    }

    #[test]
    fn round_to_4_ratio_price_calculation() {
        // 业务场景：10000 / 3.0 = 3333.3333...
        // 应该被 round_to_4 截到 4 位小数
        let ratio_price = 3.0_f64;
        let rmb_per_10k_fire = if ratio_price > 0.0 {
            round_to_4(10000.0 / ratio_price)
        } else {
            0.0
        };
        assert_eq!(rmb_per_10k_fire, 3333.3333);
    }

    #[test]
    fn round_to_4_zero_ratio_returns_zero() {
        // ratio_price=0 时按 0 处理
        let ratio_price = 0.0_f64;
        let rmb_per_10k_fire = if ratio_price > 0.0 {
            round_to_4(10000.0 / ratio_price)
        } else {
            0.0
        };
        assert_eq!(rmb_per_10k_fire, 0.0);
    }
}

#[derive(Debug, Deserialize)]
struct QiandaoResponse {
    #[serde(rename = "code")]
    code: String,
    #[serde(rename = "message")]
    #[serde(alias = "msg")]
    #[serde(default)]
    _msg: Option<String>,
    #[serde(rename = "errCode")]
    #[serde(default)]
    err_code: Option<String>,
    #[serde(rename = "data")]
    data: Option<QiandaoData>,
}

#[derive(Debug, Deserialize)]
struct QiandaoData {
    #[serde(rename = "items")]
    items: Option<Vec<QiandaoItem>>,
}

#[derive(Debug, Deserialize)]
struct QiandaoItem {
    #[serde(rename = "ratioPrice")]
    #[serde(default)]
    ratio_price: Option<f64>,
    #[serde(rename = "changePct")]
    #[serde(default)]
    change_pct: Option<f64>,
    #[serde(rename = "change24h")]
    #[serde(default)]
    change_24h: Option<String>,
}

fn mask_url_for_log(url: &str) -> String {
    url.replace("api.qiandao.com", "***")
        .replace("115.231.176.101", "***")
}
