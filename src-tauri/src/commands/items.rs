use crate::commands::types::{DbStats, ItemsStats, OkResponse, SearchResult};
use crate::core::state::AppState;
use crate::db::repo_history;
use crate::db::repo_items;
use crate::db::repo_item_realtime_prices;
use crate::scraper;
use crate::services::send_notification;
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

    let content = match std::fs::read_to_string(&json_path) {
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
    let fresh_config =
        crate::core::config::load_config().map_err(|e| format!("Failed to load config: {}", e))?;
    let season_id = fresh_config.app.season_id.clone();
    let items_source = fresh_config.scrape.items_source.clone();
    let json_path = fresh_config.scrape.items_json_path.clone();

    let items = if items_source == "api" {
        tracing::info!(
            "reload_items: fetching from API for season_id={}",
            season_id
        );
        scraper::scrape_items(&season_id, "season_normal")
            .await
            .map_err(|e| format!("Failed to scrape from API: {}", e))?
    } else {
        tracing::info!("reload_items: loading from JSON file: {}", json_path);
        crate::app::load_items_from_json(&season_id, "season_normal", &json_path)
            .map_err(|e| format!("Failed to load JSON: {}", e))?
    };

    tracing::info!("reload_items: loaded {} items", items.len());
    let count = items.len() as i64;

    repo_items::bulk_insert_items(&state.db, &season_id, "season_normal", &items)
        .await
        .map_err(|e| format!("Failed to bulk-insert items: {}", e))?;

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
    let db_size_kb = std::fs::metadata(&db_path)
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

    let all_section_items = crate::db::repo_sections::get_section_items(&state.db, &ctx.season_id)
        .await
        .map_err(|e| e.to_string())?;

    let worth_items: Vec<serde_json::Value> = all_section_items
        .into_iter()
        .filter(|item| {
            let purchase_price = item.purchase_fire_price;
            let current_price = item.current_price.unwrap_or(0.0);
            purchase_price > 0.0 && current_price > 0.0 && current_price < purchase_price
        })
        .map(|item| {
            let purchase_price = item.purchase_fire_price;
            let current_price = item.current_price.unwrap_or(0.0);
            let savings = purchase_price - current_price;
            let savings_pct = if purchase_price > 0.0 {
                (savings / purchase_price * 100.0).round() as i32
            } else {
                0
            };
            let item_name = item.item_name.unwrap_or_else(|| item.item_id.clone());
            serde_json::json!({
                "item_name": item_name,
                "current_price": format!("{:.2}", current_price),
                "purchase_price": format!("{:.2}", purchase_price),
                "savings": format!("-{:.0} ({:.0}%)", savings, savings_pct),
            })
        })
        .collect();

    if worth_items.is_empty() {
        return Ok("没有值得购买的物品".to_string());
    }

    let count = worth_items.len();

    let message = if count <= 3 {
        worth_items
            .iter()
            .map(|item| {
                let name = item["item_name"].as_str().unwrap_or("未知");
                let current = item["current_price"].as_str().unwrap_or("-");
                let savings = item["savings"].as_str().unwrap_or("-");
                format!("• {} | 当前: {} | 节省: {}\n", name, current, savings)
            })
            .collect::<Vec<_>>()
            .join("")
    } else {
        let top_items: Vec<String> = worth_items
            .iter()
            .take(3)
            .map(|item| {
                let name = item["item_name"].as_str().unwrap_or("未知");
                let savings = item["savings"].as_str().unwrap_or("-");
                format!("• {} ({})", name, savings)
            })
            .collect();
        format!(
            "🔥 共 {} 件值得购买\n\n{}\n📍 查看全部物品详情",
            count,
            top_items.join("\n")
        )
    };

    let title = format!("🔥 发现 {} 件值得购买的物品！", count);

    if config.notification.system_notifications {
        send_notification(&app, &title, &message).map_err(|e| e.to_string())?;
    }

    if config.notification.voice_alert_enabled && !config.notification.voice_alert_path.is_empty() {
        let voice_path = config.notification.voice_alert_path.clone();
        if std::path::Path::new(&voice_path).exists() {
            tokio::spawn(async move {
                #[cfg(target_os = "macos")]
                {
                    let _ = tokio::process::Command::new("afplay").arg(&voice_path).spawn();
                }
                #[cfg(target_os = "windows")]
                {
                    let _ = tokio::process::Command::new("powershell")
                        .args(["-c", "[System.Media.SystemSounds]::Hand.Play()"])
                        .spawn();
                }
            });
            tracing::info!("Voice alert played for {} items", count);
        } else {
            tracing::warn!("Voice file not found: {}", voice_path);
        }
    }

    if config.notification.system_notifications {
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
        Ok(inserted) => Ok(OkResponse::success(&format!("Batch synced: {} records", inserted))),
        Err(e) => Err(e.to_string()),
    }
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
) -> Result<Vec<repo_item_realtime_prices::ItemPriceChange>, String> {
    tracing::info!("get_realtime_fire_changes called");
    let result = repo_item_realtime_prices::get_price_changes(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    
    tracing::info!("get_realtime_fire_changes: returning {} items", result.len());
    
    // Log a sample of the results
    if !result.is_empty() {
        let sample = &result[0..std::cmp::min(3, result.len())];
        for item in sample {
            tracing::info!("Sample: {} - current={}, change_5m={:?}, trend={}", 
                item.name, item.current_price, item.change_rate_5m, item.trend);
        }
    }
    
    Ok(result)
}
