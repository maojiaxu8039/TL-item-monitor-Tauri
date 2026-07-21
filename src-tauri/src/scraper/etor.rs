use crate::core::errors::AppError;
use crate::db::models::Item;
use futures_util::stream::{self, StreamExt};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::sync::LazyLock;

const ETOR_BASE_URL: &str = "https://etor.710421059.xyz";
const ETOR_INVALID_PRICE_MARKER: f64 = 710421059.0;
const ETOR_CHART_CONCURRENCY: usize = 48;
const ETOR_CHART_TIMEOUT_SECS: u64 = 8;
const ETOR_CACHE_TTL_SECS: i64 = 15 * 60;
const ETOR_STALE_FALLBACK_SECS: i64 = 60 * 60;

static ETOR_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .connect_timeout(std::time::Duration::from_secs(5))
        .pool_max_idle_per_host(ETOR_CHART_CONCURRENCY)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
});

#[derive(Debug, Clone)]
struct CachedEtorItems {
    fetched_at: i64,
    items: Vec<Item>,
}

static ETOR_ITEMS_CACHE: LazyLock<RwLock<HashMap<String, CachedEtorItems>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

#[derive(Debug, Deserialize, Serialize, Clone)]
struct MappingEntry {
    #[serde(rename = "name")]
    name: String,
    #[serde(rename = "type", default)]
    item_type: String,
    #[serde(rename = "source", default)]
    source: String,
}

static ITEM_MAPPING: LazyLock<RwLock<HashMap<String, MappingEntry>>> = LazyLock::new(|| {
    let json = include_str!("../../resources/item_id_mapping.json");
    match serde_json::from_str::<HashMap<String, MappingEntry>>(json) {
        Ok(mut m) => {
            let original_count = m.len();
            let deduplicated = dedupe_mapping_by_name(&mut m);
            tracing::info!(
                "[ETOR] Loaded {} item mappings from built-in (deduplicated={}, final={})",
                original_count,
                deduplicated,
                m.len()
            );
            RwLock::new(m)
        }
        Err(e) => {
            tracing::error!("[ETOR] Failed to parse item mapping: {}", e);
            RwLock::new(HashMap::new())
        }
    }
});

#[derive(Debug, Deserialize)]
struct EtorChartResponse {
    #[serde(rename = "trend")]
    trend: Option<Vec<EtorTrendItem>>,
    #[serde(rename = "summary")]
    summary: Option<EtorSummary>,
}

#[derive(Debug, Deserialize)]
struct EtorTrendItem {
    #[serde(rename = "timestamp")]
    timestamp: i64,
    #[serde(rename = "price")]
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

pub async fn scrape_items(
    season_id: &str,
    market_mode: &str,
    api_season_id: i32,
) -> Result<Vec<Item>, AppError> {
    let now = chrono::Utc::now().timestamp();
    let cache_key = etor_cache_key(season_id, market_mode, api_season_id);

    if let Some(cached) = get_fresh_cached_items(&cache_key, now) {
        tracing::info!(
            "[ETOR] Using cached chart data: key={}, age={}s, items={}",
            cache_key,
            now.saturating_sub(cached.fetched_at),
            cached.items.len()
        );
        // 命中缓存时刷新 updated_at，避免数据库显示时间停留在首次抓取
        let mut items = cached.items;
        for item in items.iter_mut() {
            item.updated_at = now;
        }
        return Ok(items);
    }

    // 双源模式以本地 item_id_mapping 为全集。易火逐个按 itemId 查价格，
    // 成功返回的记录再与刷图小助手按 itemId + last_time 合并。
    let item_ids: Vec<String> = {
        let mapping = ITEM_MAPPING.read();
        mapping.keys().cloned().collect()
    };

    tracing::info!(
        "[ETOR] Fetching chart data for {} items from mapping",
        item_ids.len()
    );

    // 并发获取所有物品的 chart 数据
    let chart_results = fetch_chart_data_concurrent(api_season_id, &item_ids).await;

    // 获取名称和类型映射
    let mapping = {
        let m = ITEM_MAPPING.read();
        m.clone()
    };

    let mut items = Vec::new();
    let mut success_count = 0;
    let mut failed_count = 0;

    for (item_id, chart) in chart_results {
        match chart {
            Some(data) => {
                if let Some(price) = data.end_price {
                    if price > 0.0 && price < ETOR_INVALID_PRICE_MARKER {
                        let entry = mapping.get(&item_id);
                        let name = entry
                            .map(|e| e.name.clone())
                            .unwrap_or_else(|| format!("未知物品_{}", item_id));
                        let item_type = entry.map(|e| e.item_type.clone()).unwrap_or_default();
                        let last_time = data.last_timestamp.or(data.start_timestamp);

                        items.push(Item {
                            name,
                            item_type,
                            item_id: item_id.clone(),
                            season_id: season_id.to_string(),
                            market_mode: market_mode.to_string(),
                            source: "etor_api".to_string(),
                            price,
                            last_time,
                            updated_at: now,
                        });
                        success_count += 1;
                    } else {
                        failed_count += 1;
                    }
                } else {
                    failed_count += 1;
                }
            }
            None => {
                failed_count += 1;
            }
        }
    }

    tracing::info!(
        "[ETOR] Chart fetch complete: success={}, failed={}, total={} for {}/{}",
        success_count,
        failed_count,
        items.len(),
        season_id,
        market_mode
    );

    if items.is_empty() {
        if let Some(cached) = get_stale_cached_items(&cache_key, now) {
            tracing::warn!(
                "[ETOR] Fresh chart fetch returned no items, using stale cache: key={}, age={}s, items={}",
                cache_key,
                now.saturating_sub(cached.fetched_at),
                cached.items.len()
            );
            return Ok(cached.items);
        }
    } else {
        put_cached_items(cache_key, now, items.clone());
    }

    Ok(items)
}

fn etor_cache_key(season_id: &str, market_mode: &str, api_season_id: i32) -> String {
    format!("{}:{}:{}", season_id, market_mode, api_season_id)
}

fn get_fresh_cached_items(cache_key: &str, now: i64) -> Option<CachedEtorItems> {
    let cache = ETOR_ITEMS_CACHE.read();
    cache
        .get(cache_key)
        .filter(|cached| now.saturating_sub(cached.fetched_at) < ETOR_CACHE_TTL_SECS)
        .cloned()
}

fn get_stale_cached_items(cache_key: &str, now: i64) -> Option<CachedEtorItems> {
    let cache = ETOR_ITEMS_CACHE.read();
    cache
        .get(cache_key)
        .filter(|cached| now.saturating_sub(cached.fetched_at) < ETOR_STALE_FALLBACK_SECS)
        .cloned()
}

fn put_cached_items(cache_key: String, fetched_at: i64, items: Vec<Item>) {
    let mut cache = ETOR_ITEMS_CACHE.write();
    cache.insert(cache_key, CachedEtorItems { fetched_at, items });
}

fn decompress_brotli(bytes: &[u8]) -> Option<Vec<u8>> {
    use brotli::Decompressor;
    use std::io::Read;

    let mut decoder = Decompressor::new(std::io::Cursor::new(bytes), 4096);
    let mut out = Vec::new();
    match decoder.read_to_end(&mut out) {
        Ok(_) => Some(out),
        Err(_) => None,
    }
}

fn decompress_gzip(bytes: &[u8]) -> Result<Vec<u8>, String> {
    use flate2::read::GzDecoder;
    use std::io::Read;
    let mut decoder = GzDecoder::new(bytes);
    let mut out = Vec::new();
    decoder.read_to_end(&mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

pub async fn fetch_etor_history(
    season_id: i32,
    item_id: &str,
    interval: &str,
) -> Result<Vec<EtorChartItem>, AppError> {
    let url = format!(
        "{}/etor-api/api/chart/{}/{}?interval={}",
        ETOR_BASE_URL, season_id, item_id, interval
    );
    tracing::info!("[ETOR] Fetching history: {}", url);

    let resp = ETOR_CLIENT
        .get(&url)
        .header("accept", "application/json,text/plain,*/*")
        .header("accept-language", "zh-CN,zh;q=0.9")
        .header("accept-encoding", "gzip, deflate, br")
        .header("x-frontend-version", "10.5.50")
        .header("seasonid", season_id.to_string())
        .header("playroid", "20")
        .header("platform", "web")
        .header("user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
        .header("sec-fetch-dest", "empty")
        .header("sec-fetch-mode", "cors")
        .header("sec-fetch-site", "same-origin")
        .header("referer", format!("{}/prices", ETOR_BASE_URL))
        .header("origin", ETOR_BASE_URL)
        .send()
        .await
        .map_err(|e| AppError::Scrape(format!("etor history request failed: {}", e)))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(AppError::Scrape(format!(
            "etor history API status: {}",
            status
        )));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::Scrape(format!("etor history read failed: {}", e)))?;
    let text = decode_response_text(&bytes);

    let chart_resp: EtorChartResponse = serde_json::from_str(&text)
        .map_err(|e| AppError::Scrape(format!("etor history parse failed: {}", e)))?;

    let items = chart_resp.trend.unwrap_or_default();
    Ok(items
        .into_iter()
        .map(|t| EtorChartItem {
            time: t.timestamp / 1000,
            price: t.price,
            count: None,
        })
        .collect())
}

async fn fetch_chart_data_concurrent(
    api_season_id: i32,
    item_ids: &[String],
) -> Vec<(String, Option<EtorChartSummary>)> {
    let client = ETOR_CLIENT.clone();
    let total = item_ids.len();

    tracing::info!(
        "[ETOR] Fetching chart data for {} items (concurrency={}, per_request_timeout={}s)",
        total,
        ETOR_CHART_CONCURRENCY,
        ETOR_CHART_TIMEOUT_SECS
    );

    let results: Vec<(String, Option<EtorChartSummary>)> = stream::iter(item_ids.iter().cloned())
        .map(|item_id| {
            let client = client.clone();
            async move {
                let result = tokio::time::timeout(
                    std::time::Duration::from_secs(ETOR_CHART_TIMEOUT_SECS),
                    fetch_single_chart(&client, api_season_id, &item_id),
                )
                .await
                .unwrap_or_else(|_| {
                    tracing::debug!(
                        "[ETOR] Chart request timed out for {} after {}s",
                        item_id,
                        ETOR_CHART_TIMEOUT_SECS
                    );
                    None
                });
                (item_id, result)
            }
        })
        .buffer_unordered(ETOR_CHART_CONCURRENCY)
        .collect()
        .await;

    let success_count = results.iter().filter(|(_, r)| r.is_some()).count();
    tracing::info!("[ETOR] Completed: {}/{} successful", success_count, total);

    results
}

async fn fetch_single_chart(
    client: &reqwest::Client,
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
        .header("accept-encoding", "gzip, deflate, br")
        .header("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .header("x-frontend-version", "10.5.50")
        .header("seasonid", api_season_id.to_string())
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::debug!("[ETOR] Chart request failed for {}: {}", item_id, e);
            return None;
        }
    };

    if !resp.status().is_success() {
        tracing::debug!("[ETOR] Chart API status {} for {}", resp.status(), item_id);
        return None;
    }

    let bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            tracing::debug!("[ETOR] Chart read failed for {}: {}", item_id, e);
            return None;
        }
    };

    let text = decode_response_text(&bytes);

    if !text.starts_with('{') && !text.starts_with('[') {
        let preview = text.chars().take(50).collect::<String>();
        tracing::warn!("[ETOR] Non-JSON response for {}: {}...", item_id, preview);
        return None;
    }

    let chart_resp: EtorChartResponse = match serde_json::from_str(&text) {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!("[ETOR] Chart parse failed for {}: {}", item_id, e);
            return None;
        }
    };

    let summary = match chart_resp.summary {
        Some(s) => s,
        None => {
            tracing::warn!("[ETOR] Chart summary is None for {}", item_id);
            return None;
        }
    };

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

#[derive(Debug, Clone)]
pub struct EtorChartItem {
    pub time: i64,
    pub price: f64,
    pub count: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MappingUpdateResult {
    pub total: usize,
    pub new_from_luosi: usize,
    pub new_from_etor: usize,
    pub updated: usize,
    pub deduplicated: usize,
}

pub fn merge_and_update_mapping(
    luosi_items: &HashMap<String, crate::scraper::luosi::LuosiItem>,
    etor_ids: &[String],
) -> MappingUpdateResult {
    let mut mapping = ITEM_MAPPING.write();
    let mut new_from_luosi = 0usize;
    let mut new_from_etor = 0usize;
    let mut updated = 0usize;

    for (item_id, item) in luosi_items {
        let entry = mapping.get_mut(item_id);
        match entry {
            Some(e) => {
                let changed = e.name != item.name
                    || e.item_type != item.item_type.clone().unwrap_or_default();
                if changed {
                    e.name = item.name.clone();
                    e.item_type = item.item_type.clone().unwrap_or_default();
                    updated += 1;
                }
                let merged_source = merge_mapping_source(&e.source, "tl");
                if e.source != merged_source {
                    e.source = merged_source;
                    updated += 1;
                }
            }
            None => {
                mapping.insert(
                    item_id.clone(),
                    MappingEntry {
                        name: item.name.clone(),
                        item_type: item.item_type.clone().unwrap_or_default(),
                        source: "tl".to_string(),
                    },
                );
                new_from_luosi += 1;
            }
        }
    }

    for item_id in etor_ids {
        if !mapping.contains_key(item_id) {
            mapping.insert(
                item_id.clone(),
                MappingEntry {
                    name: format!("未知物品_{}", item_id),
                    item_type: String::new(),
                    source: "etor".to_string(),
                },
            );
            new_from_etor += 1;
        } else {
            if let Some(e) = mapping.get_mut(item_id) {
                let merged_source = merge_mapping_source(&e.source, "etor");
                if e.source != merged_source {
                    e.source = merged_source;
                    updated += 1;
                }
            }
        }
    }

    let deduplicated = dedupe_mapping_by_name(&mut mapping);
    let total = mapping.len();
    tracing::info!(
        "[ETOR] Mapping updated: total={}, new_luosi={}, new_etor={}, updated={}, deduplicated={}",
        total,
        new_from_luosi,
        new_from_etor,
        updated,
        deduplicated
    );
    clear_items_cache();

    MappingUpdateResult {
        total,
        new_from_luosi,
        new_from_etor,
        updated,
        deduplicated,
    }
}

pub fn export_mapping_json() -> String {
    let mapping = ITEM_MAPPING.read();
    let sorted: BTreeMap<String, MappingEntry> = mapping
        .iter()
        .map(|(item_id, entry)| (item_id.clone(), entry.clone()))
        .collect();
    serde_json::to_string_pretty(&sorted).unwrap_or_else(|e| {
        tracing::error!("[ETOR] Failed to serialize mapping: {}", e);
        "{}".to_string()
    })
}

pub fn load_mapping_from_json(json: &str) -> Result<usize, String> {
    let mut map: HashMap<String, MappingEntry> =
        serde_json::from_str(json).map_err(|e| format!("解析对照表JSON失败: {}", e))?;
    let original_count = map.len();
    let deduplicated = dedupe_mapping_by_name(&mut map);
    let count = map.len();
    let mut mapping = ITEM_MAPPING.write();
    *mapping = map;
    tracing::info!(
        "[ETOR] Loaded {} item mappings from external file (deduplicated={}, final={})",
        original_count,
        deduplicated,
        count
    );
    clear_items_cache();
    Ok(count)
}

pub fn clear_items_cache() {
    ETOR_ITEMS_CACHE.write().clear();
    tracing::info!("[ETOR] Cleared cached chart items");
}

pub fn get_mapping_count() -> usize {
    ITEM_MAPPING.read().len()
}

pub fn get_etor_item_ids() -> Vec<String> {
    let mapping = ITEM_MAPPING.read();
    mapping
        .iter()
        .filter(|(_, entry)| entry.source == "etor" || entry.source == "both")
        .map(|(id, _)| id.clone())
        .collect()
}

fn decode_response_text(bytes: &[u8]) -> String {
    if bytes.starts_with(b"{") || bytes.starts_with(b"[") {
        return String::from_utf8_lossy(bytes).into_owned();
    }

    if let Some(decoded) = decompress_brotli(bytes) {
        if decoded.starts_with(b"{") || decoded.starts_with(b"[") {
            return String::from_utf8_lossy(&decoded).into_owned();
        }
    }

    if let Ok(decoded) = decompress_gzip(bytes) {
        if decoded.starts_with(b"{") || decoded.starts_with(b"[") {
            return String::from_utf8_lossy(&decoded).into_owned();
        }
    }

    String::from_utf8_lossy(bytes).into_owned()
}

fn normalize_item_name(name: &str) -> String {
    name.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn merge_mapping_source(left: &str, right: &str) -> String {
    if left == right {
        return left.to_string();
    }

    if left == "both" || right == "both" {
        return "both".to_string();
    }

    if (left == "tl" && right == "etor") || (left == "etor" && right == "tl") {
        return "both".to_string();
    }

    if left.is_empty() {
        return right.to_string();
    }

    if right.is_empty() {
        return left.to_string();
    }

    if source_rank(right) > source_rank(left) {
        right.to_string()
    } else {
        left.to_string()
    }
}

fn source_rank(source: &str) -> u8 {
    match source {
        "both" => 4,
        "etor" => 3,
        "tl" => 2,
        _ => 1,
    }
}

fn numeric_item_id(item_id: &str) -> u64 {
    item_id.parse::<u64>().unwrap_or(u64::MAX)
}

fn is_unknown_mapping_name(name: &str) -> bool {
    name.trim().is_empty() || name.starts_with("未知物品_")
}

fn mapping_score(item_id: &str, entry: &MappingEntry) -> (u8, u8, u8, std::cmp::Reverse<u64>) {
    (
        source_rank(&entry.source),
        u8::from(!is_unknown_mapping_name(&entry.name)),
        u8::from(!entry.item_type.trim().is_empty()),
        std::cmp::Reverse(numeric_item_id(item_id)),
    )
}

fn merge_mapping_entry(winner: &mut MappingEntry, loser: &MappingEntry) {
    winner.name = normalize_item_name(&winner.name);
    if winner.item_type.trim().is_empty() && !loser.item_type.trim().is_empty() {
        winner.item_type = loser.item_type.clone();
    }
    winner.source = merge_mapping_source(&winner.source, &loser.source);
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
        if normalized_name.is_empty() || is_unknown_mapping_name(&normalized_name) {
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

                let candidate_wins = mapping_score(&item_id, &candidate_entry)
                    > mapping_score(&current_id, &current_entry);

                if candidate_wins {
                    let loser = mapping.remove(&current_id);
                    if let (Some(winner), Some(loser)) = (mapping.get_mut(&item_id), loser) {
                        merge_mapping_entry(winner, &loser);
                        winner.name = normalized_name.clone();
                    }
                    canonical_by_name.insert(normalized_name, item_id.clone());
                } else {
                    let loser = mapping.remove(&item_id);
                    if let (Some(winner), Some(loser)) = (mapping.get_mut(&current_id), loser) {
                        merge_mapping_entry(winner, &loser);
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

fn normalize_timestamp(ts: i64) -> i64 {
    if ts > 10_000_000_000 {
        ts / 1000
    } else {
        ts
    }
}
