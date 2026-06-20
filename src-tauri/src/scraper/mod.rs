pub mod etor;
pub mod luosi;
pub mod qiandao;

pub use luosi::scrape_items;
pub use qiandao::scrape_fire_price;

use crate::core::state::SeasonApiConfig;
use crate::db::models::Item;
use tokio::time::{timeout, Duration};
use tracing::{info, warn};

const LUOSI_SCRAPE_TIMEOUT_SECS: u64 = 45;
const ETOR_SCRAPE_TIMEOUT_SECS: u64 = 120;

pub async fn scrape_items_by_source(
    season_id: &str,
    market_mode: &str,
    source: &str,
    json_path: &str,
    api_config: &SeasonApiConfig,
) -> Result<Vec<Item>, String> {
    match source {
        "api" => scrape_luosi_items(season_id, market_mode, api_config).await,
        "etor" => scrape_etor_items(season_id, market_mode, api_config).await,
        "dual" => scrape_dual_items(season_id, market_mode, api_config).await,
        _ => {
            info!(
                "[ITEM-SOURCE] Loading {} items from JSON for {}/{}",
                market_mode, season_id, market_mode
            );
            crate::app::load_items_from_json(season_id, market_mode, json_path)
                .await
                .map_err(|e| format!("JSON load failed for {}: {}", market_mode, e))
        }
    }
}

async fn scrape_luosi_items(
    season_id: &str,
    market_mode: &str,
    api_config: &SeasonApiConfig,
) -> Result<Vec<Item>, String> {
    let api_season_id = api_season_id_for_mode(
        market_mode,
        api_config.luosi_season_id_normal,
        api_config.luosi_season_id_expert,
    );
    info!(
        "[ITEM-SOURCE] Fetching {} items from Luosi API for {}/{} (api_season_id={})",
        market_mode, season_id, market_mode, api_season_id
    );
    timeout(
        Duration::from_secs(LUOSI_SCRAPE_TIMEOUT_SECS),
        luosi::scrape_items_with_api_id(season_id, market_mode, api_season_id),
    )
    .await
    .map_err(|_| {
        format!(
            "Luosi API scrape timed out for {} after {}s",
            market_mode, LUOSI_SCRAPE_TIMEOUT_SECS
        )
    })?
    .map_err(|e| format!("Luosi API scrape failed for {}: {}", market_mode, e))
}

async fn scrape_etor_items(
    season_id: &str,
    market_mode: &str,
    api_config: &SeasonApiConfig,
) -> Result<Vec<Item>, String> {
    let api_season_id = api_season_id_for_mode(
        market_mode,
        api_config.etor_season_id_normal,
        api_config.etor_season_id_expert,
    );
    info!(
        "[ITEM-SOURCE] Fetching {} items from Etor API for {}/{} (api_season_id={})",
        market_mode, season_id, market_mode, api_season_id
    );
    timeout(
        Duration::from_secs(ETOR_SCRAPE_TIMEOUT_SECS),
        etor::scrape_items(season_id, market_mode, api_season_id),
    )
    .await
    .map_err(|_| {
        format!(
            "Etor API scrape timed out for {} after {}s",
            market_mode, ETOR_SCRAPE_TIMEOUT_SECS
        )
    })?
    .map_err(|e| format!("Etor API scrape failed for {}: {}", market_mode, e))
}

async fn scrape_dual_items(
    season_id: &str,
    market_mode: &str,
    api_config: &SeasonApiConfig,
) -> Result<Vec<Item>, String> {
    info!(
        "[ITEM-SOURCE] Fetching {} items from DUAL sources for {}/{}",
        market_mode, season_id, market_mode
    );

    let (luosi_res, etor_res) = tokio::join!(
        scrape_luosi_items(season_id, market_mode, api_config),
        scrape_etor_items(season_id, market_mode, api_config),
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
            warn!(
                "[ITEM-SOURCE] DUAL: using luosi only for {} (etor failed)",
                market_mode
            );
            Ok(l)
        }
        (None, Some(e)) => {
            warn!(
                "[ITEM-SOURCE] DUAL: using etor only for {} (luosi failed)",
                market_mode
            );
            Ok(e)
        }
        (None, None) => Err(format!(
            "DUAL scrape failed for {}: both sources failed",
            market_mode
        )),
    }
}

pub fn merge_dual_items(luosi_items: Vec<Item>, etor_items: Vec<Item>) -> Vec<Item> {
    let mut map: std::collections::HashMap<String, Item> =
        std::collections::HashMap::with_capacity(luosi_items.len() + etor_items.len());
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
    let mut canonical_by_name: std::collections::HashMap<String, String> =
        std::collections::HashMap::with_capacity(map.len());
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
        item.last_time.unwrap_or(0),
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

fn api_season_id_for_mode(market_mode: &str, normal: i32, expert: i32) -> i32 {
    if market_mode == "season_expert" {
        expert
    } else {
        normal
    }
}
