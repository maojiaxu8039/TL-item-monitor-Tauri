use crate::commands::types::{DbStats, ItemsStats, OkResponse, SearchResult};
use crate::core::state::AppState;
use crate::db::repo_fire;
use crate::db::repo_history;
use crate::db::repo_item_realtime_prices;
use crate::db::repo_items;
use crate::scheduler::alert_task::play_configured_voice_alert;
use crate::scraper;
use crate::services::{
    desktop_notifications_enabled, format_worth_alert_notification, send_notification,
    WorthAlertNotificationItem,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, State};
use tauri_plugin_notification::{NotificationExt, PermissionState};

#[tauri::command]
#[allow(non_snake_case)]
pub async fn search_items(
    state: State<'_, Arc<AppState>>,
    keyword: String,
    page: i64,
    #[allow(non_snake_case)] pageSize: i64,
    #[allow(non_snake_case)] dayFilter: Option<i32>,
    #[allow(non_snake_case)] typeFilter: Option<String>,
) -> Result<SearchResult, String> {
    let ctx = state.active_context.read().clone();
    tracing::debug!(
        "search_items called: keyword={:?}, season_id={:?}, market_mode={:?}, day_filter={:?}, type_filter={:?}",
        keyword, ctx.season_id, ctx.market_mode, dayFilter, typeFilter
    );
    let (items, total) = repo_items::search_items(
        &state.db,
        &ctx.season_id,
        ctx.market_mode.as_str(),
        &keyword,
        page,
        pageSize,
        dayFilter,
        typeFilter.as_deref(),
    )
    .await?;
    tracing::debug!(
        "search_items result: {} items, total={}",
        items.len(),
        total
    );
    Ok(SearchResult {
        items,
        total,
        page,
        page_size: pageSize,
    })
}

#[tauri::command]
pub async fn get_items_stats(state: State<'_, Arc<AppState>>) -> Result<ItemsStats, String> {
    let ctx = state.active_context.read().clone();
    let total_items =
        repo_items::get_items_count(&state.db, &ctx.season_id, ctx.market_mode.as_str())
            .await
            .map_err(|e| {
                tracing::warn!("get_items_count failed: {}, returning 0", e);
                e
            })
            .unwrap_or(0);
    let status = state.task_status.read().clone();
    Ok(ItemsStats {
        total_items,
        last_reload: status.last_items_reload,
    })
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct JsonFileValidationResult {
    pub valid: bool,
    pub file_exists: bool,
    pub is_readable: bool,
    pub is_valid_json: bool,
    pub item_count: Option<i32>,
    pub error_message: Option<String>,
}

#[tauri::command]
pub async fn validate_json_file(json_path: String) -> Result<JsonFileValidationResult, String> {
    let path = std::path::Path::new(&json_path);

    if !path.exists() {
        return Ok(JsonFileValidationResult {
            valid: false,
            file_exists: false,
            is_readable: false,
            is_valid_json: false,
            item_count: None,
            error_message: Some("文件不存在".to_string()),
        });
    }

    if !path.is_file() {
        return Ok(JsonFileValidationResult {
            valid: false,
            file_exists: true,
            is_readable: false,
            is_valid_json: false,
            item_count: None,
            error_message: Some("路径不是文件".to_string()),
        });
    }

    let content = match tokio::fs::read_to_string(&json_path).await {
        Ok(c) => c,
        Err(e) => {
            return Ok(JsonFileValidationResult {
                valid: false,
                file_exists: true,
                is_readable: false,
                is_valid_json: false,
                item_count: None,
                error_message: Some(format!("无法读取文件: {}", e)),
            });
        }
    };

    let data: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            return Ok(JsonFileValidationResult {
                valid: false,
                file_exists: true,
                is_readable: true,
                is_valid_json: false,
                item_count: None,
                error_message: Some(format!("JSON 格式错误: {}", e)),
            });
        }
    };

    let item_count = match &data {
        serde_json::Value::Object(map) => Some(map.len() as i32),
        serde_json::Value::Array(arr) => Some(arr.len() as i32),
        _ => None,
    };

    Ok(JsonFileValidationResult {
        valid: true,
        file_exists: true,
        is_readable: true,
        is_valid_json: true,
        item_count,
        error_message: None,
    })
}

#[tauri::command]
pub async fn reload_items(state: State<'_, Arc<AppState>>) -> Result<ItemsStats, String> {
    let Some(_refresh_guard) = state.try_begin_items_refresh() else {
        let status = state.task_status.read().clone();
        return Ok(ItemsStats {
            total_items: state.items_cache.read().len() as i64,
            last_reload: status.last_items_reload,
        });
    };

    let fresh_config =
        crate::core::config::load_config().map_err(|e| format!("Failed to load config: {}", e))?;
    let season_id = fresh_config.app.season_id.clone();
    let items_source = fresh_config.scrape.items_source.clone();
    let json_path = fresh_config.scrape.items_json_path.clone();
    let market_mode = "season_normal";

    let api_config = crate::db::repo_season_api::get_season_api_config(&state.db, &season_id)
        .await
        .unwrap_or_default();

    let items = scraper::scrape_items_by_source(
        &season_id,
        market_mode,
        &items_source,
        &json_path,
        &api_config,
    )
    .await
    .map_err(|e| format!("Failed to reload items: {}", e))?;

    tracing::info!("reload_items: loaded {} items", items.len());
    let count = items.len() as i64;

    repo_items::bulk_insert_items(&state.db, &season_id, market_mode, &items)
        .await
        .map_err(|e| format!("Failed to bulk-insert items: {}", e))?;
    repo_item_realtime_prices::record_item_prices(&state.db, &items, &season_id, market_mode)
        .await
        .map_err(|e| format!("Failed to insert realtime prices: {}", e))?;
    if let Err(e) = repo_item_realtime_prices::cleanup_old_records(&state.db).await {
        tracing::warn!("reload_items: failed to cleanup old realtime prices: {}", e);
    }

    tracing::info!("reload_items: inserted {} items into database", count);

    {
        let mut cache = state.items_cache.write();
        *cache = Arc::new(items);
    }
    {
        let mut status = state.task_status.write();
        status.last_items_reload = Some(chrono::Utc::now().timestamp());
    }

    Ok(ItemsStats {
        total_items: count,
        last_reload: Some(chrono::Utc::now().timestamp()),
    })
}

#[tauri::command]
pub async fn get_db_stats(state: State<'_, Arc<AppState>>) -> Result<DbStats, String> {
    let ctx = state.active_context.read().clone();
    let item_count =
        repo_items::get_items_count(&state.db, &ctx.season_id, ctx.market_mode.as_str())
            .await
            .map_err(|e| {
                tracing::warn!("get_items_count failed: {}, returning 0", e);
                e
            })
            .unwrap_or(0);
    let db_record_count = repo_items::get_db_record_count(&state.db)
        .await
        .map_err(|e| {
            tracing::warn!("get_db_record_count failed: {}, returning 0", e);
            e
        })
        .unwrap_or(0);

    let db_path = crate::core::paths::db_path();
    let db_size_kb = tokio::fs::metadata(&db_path)
        .await
        .map(|m| m.len() as f64 / 1024.0)
        .map_err(|e| {
            tracing::warn!("Failed to get db metadata: {}, returning 0", e);
            e
        })
        .unwrap_or(0.0);

    Ok(DbStats {
        item_count,
        db_record_count,
        db_size_kb,
    })
}

#[tauri::command]
pub async fn get_item_history(
    state: State<'_, Arc<AppState>>,
    item_id: String,
    limit: Option<i64>,
) -> Result<Vec<repo_history::ItemHistoryRecord>, String> {
    let ctx = state.active_context.read().clone();
    repo_history::get_item_history(
        &state.db,
        &ctx.season_id,
        ctx.market_mode.as_str(),
        &item_id,
        limit.unwrap_or(100),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_items_database(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let ctx = state.active_context.read().clone();
    repo_items::clear_items(&state.db, &ctx.season_id, ctx.market_mode.as_str())
        .await
        .map_err(|e| format!("Failed to clear items: {}", e))?;

    {
        let mut cache = state.items_cache.write();
        *cache = Arc::new(Vec::new());
    }

    Ok("物品数据库已清空".to_string())
}

#[tauri::command]
pub async fn trigger_price_alert(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let ctx = state.active_context.read().clone();
    let config = state.config.read().clone();

    let all_section_items = crate::db::repo_sections::get_section_items_for_context(
        &state.db,
        &ctx.season_id,
        ctx.market_mode.as_str(),
    )
    .await
    .map_err(|e| e.to_string())?;

    let worth_items: Vec<_> = all_section_items
        .into_iter()
        .filter(|item| {
            let purchase_price = item.purchase_fire_price;
            let current_price = item.current_price.unwrap_or(0.0);
            purchase_price > 0.0 && current_price > 0.0 && current_price < purchase_price
        })
        .collect();

    if worth_items.is_empty() {
        return Ok("没有值得购买的物品".to_string());
    }

    let count = worth_items.len();
    let notification_items: Vec<_> = worth_items
        .iter()
        .map(|item| WorthAlertNotificationItem {
            section_name: item.section_name.as_str(),
            item_name: item.item_name.as_str(),
            current_price: item.current_price.unwrap_or(0.0),
            purchase_fire_price: item.purchase_fire_price,
            count: item.count,
        })
        .collect();
    let message = format_worth_alert_notification(&notification_items);
    let title = format!("🔥 发现 {} 件满足条件预警", count);

    if desktop_notifications_enabled(&config.notification) {
        send_notification(&app, &title, &message, Some("notification/buy.png"))
            .map_err(|e| e.to_string())?;
    }

    if config.notification.voice_alert_enabled {
        play_configured_voice_alert(&app, &config.notification, 1)
            .await
            .map_err(|e| format!("Voice alert failed: {}", e))?;
    }

    if desktop_notifications_enabled(&config.notification) {
        Ok(format!("发现 {} 件值得购买的物品，已发送通知", count))
    } else {
        Ok(format!("发现 {} 件值得购买的物品（通知已关闭）", count))
    }
}

#[tauri::command]
pub async fn get_item_types(state: State<'_, Arc<AppState>>) -> Result<Vec<String>, String> {
    let ctx = state.active_context.read().clone();
    repo_items::get_distinct_item_types(&state.db, &ctx.season_id, ctx.market_mode.as_str())
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct NotificationPermissionStatus {
    pub granted: bool,
    pub denied: bool,
    pub prompt: bool,
    pub unknown: bool,
}

#[tauri::command]
pub async fn get_notification_permission_status(
    app: AppHandle,
) -> Result<NotificationPermissionStatus, String> {
    let notification = app.notification();
    match notification.permission_state() {
        Ok(state) => Ok(NotificationPermissionStatus {
            granted: state == PermissionState::Granted,
            denied: state == PermissionState::Denied,
            prompt: state == PermissionState::Prompt,
            unknown: false,
        }),
        Err(e) => Err(format!("获取权限状态失败: {}", e)),
    }
}

#[tauri::command]
pub async fn request_notification_permission(app: AppHandle) -> Result<bool, String> {
    let notification = app.notification();
    match notification.request_permission() {
        Ok(state) => Ok(state == PermissionState::Granted),
        Err(e) => Err(format!("请求权限失败: {}", e)),
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct SyncItemsRecordParams {
    pub season_id: String,
    pub market_mode: String,
    pub item_id: String,
    pub name: String,
    pub item_type: Option<String>,
    pub price: f64,
    pub last_time: Option<i64>,
    pub recorded_at: i64,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct SyncItemsBatchParams {
    pub season_id: String,
    pub market_mode: String,
    pub items: Vec<SyncItemsRecordParams>,
}

#[tauri::command]
pub async fn sync_items_record(
    state: State<'_, Arc<AppState>>,
    params: SyncItemsRecordParams,
) -> Result<OkResponse, String> {
    if let Err(e) =
        crate::db::table_resolver::TableResolver::validate(&params.season_id, &params.market_mode)
    {
        return Err(e.to_string());
    }
    match repo_history::insert_item_snapshot(
        &state.db,
        &params.season_id,
        &params.market_mode,
        &params.item_id,
        &params.name,
        params.item_type.as_deref(),
        params.price,
        params.last_time,
        params.recorded_at,
    )
    .await
    {
        Ok(_) => Ok(OkResponse::success("Item record synced")),
        Err(e) => {
            let err_str = e.to_string();
            if err_str.contains("UNIQUE constraint failed") || err_str.contains("duplicate") {
                Ok(OkResponse::success("Item record already exists"))
            } else {
                Err(err_str)
            }
        }
    }
}

#[tauri::command]
pub async fn sync_items_batch(
    state: State<'_, Arc<AppState>>,
    params: SyncItemsBatchParams,
) -> Result<OkResponse, String> {
    let batch_items: Vec<repo_history::ItemSnapshotBatchItem> = params
        .items
        .iter()
        .map(|item| repo_history::ItemSnapshotBatchItem {
            item_id: item.item_id.clone(),
            name: item.name.clone(),
            item_type: item.item_type.clone(),
            fire_price: item.price,
            scraped_at: item.recorded_at,
            season_day: None,
        })
        .collect();

    match repo_history::insert_item_snapshots_batch(
        &state.db,
        &params.season_id,
        &params.market_mode,
        batch_items,
    )
    .await
    {
        Ok(inserted) => Ok(OkResponse::success(&format!(
            "Batch synced: {} records",
            inserted
        ))),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Debug, Serialize)]
pub struct FastSyncResult {
    pub total_items: usize,
    pub total_days: usize,
    pub total_records: usize,
    pub inserted: usize,
    pub elapsed_ms: u64,
}

#[derive(Debug, Deserialize)]
struct FastSyncResponseData {
    items: Vec<FastItemData>,
    total_items: usize,
    total_days: usize,
}

#[derive(Debug, Deserialize)]
struct FastItemData {
    item_id: String,
    name: String,
    daily_prices: Vec<DayPriceData>,
}

#[derive(Debug, Deserialize)]
struct DayPriceData {
    day: i32,
    close: f64,
    // 兼容尚未升级的独立服务器；新服务端会返回真实采集时间。
    scraped_at: Option<i64>,
}

#[tauri::command]
pub async fn fast_sync_items(
    state: State<'_, Arc<AppState>>,
    server_url: String,
    season_id: String,
    market_mode: String,
    range_days: i64,
) -> Result<FastSyncResult, String> {
    let start = std::time::Instant::now();
    let season_start = repo_fire::get_season_start_from_db(&state.db, &season_id)
        .await
        .map_err(|e| format!("读取赛季开始时间失败: {e}"))?;
    let legacy_max_day = crate::core::constants::calculate_season_day(
        chrono::Utc::now().timestamp(),
        season_start,
    ) as i64;
    let legacy_min_day = if range_days > 0 {
        (legacy_max_day - range_days + 1).max(1)
    } else {
        1
    };

    let mode = match market_mode.as_str() {
        "season_expert" => "expert",
        _ => "normal",
    };

    let url = format!(
        "{}/sync-fast?season={}&mode={}&compact=1&days={}&min_day={}&max_day={}",
        server_url.trim_end_matches('/'),
        season_id,
        mode,
        range_days.max(0),
        legacy_min_day,
        legacy_max_day
    );

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        // 整赛季响应仍可能较大；连接超时单独限制，避免把正常的数据传输误判为失败。
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {e}"))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("连接服务器失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("服务器返回 HTTP {}", response.status()));
    }

    #[derive(Deserialize)]
    struct ServerResponse {
        success: bool,
        data: Option<FastSyncResponseData>,
        error: Option<String>,
    }

    let server_resp: ServerResponse = response
        .json()
        .await
        .map_err(|e| format!("解析服务器响应失败: {e}"))?;

    if !server_resp.success {
        return Err(server_resp.error.unwrap_or_else(|| "服务器返回失败".to_string()));
    }

    let sync_data = server_resp.data.ok_or("服务器返回数据为空")?;

    let total_items = sync_data.total_items;
    let total_days = sync_data.total_days;
    let mut all_batch_items: Vec<repo_history::ItemSnapshotBatchItem> = Vec::new();

    for item in &sync_data.items {
        for dp in &item.daily_prices {
            if dp.day <= 0 || !dp.close.is_finite() {
                tracing::warn!(item_id = %item.item_id, day = dp.day, "忽略无效的快速同步记录");
                continue;
            }
            let raw_ts = dp.scraped_at.filter(|t| *t > 0).unwrap_or(0);
            let scraped_at = if raw_ts > 1_000_000_000_000 {
                raw_ts / 1000
            } else if raw_ts > 0 {
                raw_ts
            } else {
                season_start
                    + (dp.day as i64 - 1) * crate::core::constants::SECONDS_PER_DAY
            };
            all_batch_items.push(repo_history::ItemSnapshotBatchItem {
                item_id: item.item_id.clone(),
                name: item.name.clone(),
                item_type: None,
                fire_price: dp.close,
                // 旧实现把 day * 86400 当时间戳，记录会落到 1970 年。
                // 精简接口直接返回当天最后一次采集的真实时间戳和赛季日。
                scraped_at,
                season_day: Some(dp.day),
            });
        }
    }

    let total_records = all_batch_items.len();

    let inserted = repo_history::insert_item_snapshots_batch(
        &state.db,
        &season_id,
        &market_mode,
        all_batch_items,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(FastSyncResult {
        total_items,
        total_days,
        total_records,
        inserted,
        elapsed_ms: start.elapsed().as_millis() as u64,
    })
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_item_history_by_season(
    state: State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] itemId: String,
    #[allow(non_snake_case)] seasonId: String,
    limit: Option<i64>,
) -> Result<Vec<repo_history::ItemHistoryRecord>, String> {
    let ctx = state.active_context.read().clone();
    repo_history::get_item_history_by_season(
        &state.db,
        &seasonId,
        ctx.market_mode.as_str(),
        &itemId,
        limit.unwrap_or(100),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_item_history_by_day(
    state: State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] itemId: String,
    #[allow(non_snake_case)] seasonId: String,
    #[allow(non_snake_case)] seasonDay: i32,
) -> Result<Vec<repo_history::ItemHistoryRecord>, String> {
    let ctx = state.active_context.read().clone();
    repo_history::get_item_history_by_day(
        &state.db,
        &seasonId,
        ctx.market_mode.as_str(),
        &itemId,
        seasonDay,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_item_history_by_day_range(
    state: State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] itemId: String,
    #[allow(non_snake_case)] seasonId: String,
    #[allow(non_snake_case)] startDay: i32,
    #[allow(non_snake_case)] endDay: i32,
) -> Result<Vec<repo_history::ItemHistoryRecord>, String> {
    let ctx = state.active_context.read().clone();
    repo_history::get_item_history_by_day_range(
        &state.db,
        &seasonId,
        ctx.market_mode.as_str(),
        &itemId,
        startDay,
        endDay,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_items_price_compare(
    state: State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] historySeason: String,
    #[allow(non_snake_case)] dayFilter: Option<i32>,
) -> Result<Vec<repo_history::ItemPriceCompare>, String> {
    let ctx = state.active_context.read().clone();
    tracing::debug!(
        "get_items_price_compare called: current_season={}, history_season={}, market_mode={}, day_filter={:?}",
        ctx.season_id, historySeason, ctx.market_mode.as_str(), dayFilter
    );
    let result = repo_history::get_items_price_compare(
        &state.db,
        &ctx.season_id,
        &historySeason,
        ctx.market_mode.as_str(),
        dayFilter,
    )
    .await
    .map_err(|e| e.to_string())?;
    tracing::debug!("get_items_price_compare result: {} items", result.len());
    Ok(result)
}

#[tauri::command]
pub async fn get_realtime_fire_changes(
    state: State<'_, Arc<AppState>>,
    season_id: String,
    market_mode: String,
) -> Result<Vec<repo_item_realtime_prices::ItemPriceChange>, String> {
    tracing::info!(
        "get_realtime_fire_changes called for {}/{}",
        season_id,
        market_mode
    );
    let result = repo_item_realtime_prices::get_price_changes(&state.db, &season_id, &market_mode)
        .await
        .map_err(|e| e.to_string())?;

    tracing::info!(
        "get_realtime_fire_changes: returning {} items",
        result.len()
    );

    // Log a sample of the results
    if !result.is_empty() {
        let sample = &result[0..std::cmp::min(3, result.len())];
        for item in sample {
            tracing::info!(
                "Sample: {} - current={}, change_5m={:?}, trend={}",
                item.name,
                item.current_price,
                item.change_rate_5m,
                item.trend
            );
        }
    }

    Ok(result)
}
