use crate::commands::types::{DbStats, ItemsStats, SearchResult};
use crate::core::state::AppState;
use crate::db::repo_items;
use crate::db::repo_history;
use crate::services::send_notification;
use std::sync::Arc;
use tauri::{State, AppHandle};
use tauri_plugin_notification::{PermissionState, NotificationExt};

#[tauri::command]
#[allow(non_snake_case)]
pub async fn search_items(
    state: State<'_, Arc<AppState>>,
    keyword: String,
    page: i64,
    #[allow(non_snake_case)] pageSize: i64,
) -> Result<SearchResult, String> {
    let ctx = state.active_context.read().clone();
    tracing::info!(
        "search_items called: keyword={:?}, season_id={:?}, market_mode={:?}",
        keyword, ctx.season_id, ctx.market_mode
    );
    let (items, total) = repo_items::search_items(
        &state.db,
        &ctx.season_id,
        ctx.market_mode.as_str(),
        &keyword,
        page,
        pageSize,
    ).await?;
    tracing::info!("search_items result: {} items, total={}", items.len(), total);
    Ok(SearchResult { items, total, page, page_size: pageSize })
}

#[tauri::command]
pub async fn get_items_stats(state: State<'_, Arc<AppState>>) -> Result<ItemsStats, String> {
    let total_items = repo_items::get_items_count(&state.db).await.unwrap_or(0);
    let status = state.task_status.read().clone();
    Ok(ItemsStats {
        total_items,
        last_reload: status.last_items_reload,
    })
}

#[tauri::command]
pub async fn reload_items(state: State<'_, Arc<AppState>>) -> Result<ItemsStats, String> {
    let fresh_config = crate::core::config::load_config()
        .map_err(|e| format!("Failed to load config: {}", e))?;
    let season_id = fresh_config.app.season_id.clone();

    tracing::info!("reload_items: loading items from JSON for season_id={}", season_id);
    
    let items = crate::app::load_items_from_json(&season_id, "season_normal")
        .map_err(|e| format!("Failed to load JSON: {}", e))?;
    
    tracing::info!("reload_items: loaded {} items from JSON", items.len());
    let count = items.len() as i64;

    repo_items::bulk_insert_items(&state.db, &items).await
        .map_err(|e| format!("Failed to bulk-insert items: {}", e))?;
    
    tracing::info!("reload_items: inserted {} items into database", count);

    {
        let mut cache = state.items_cache.write();
        *cache = items;
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
    let (item_count, db_record_count) = tokio::join!(
        repo_items::get_items_count(&state.db),
        repo_items::get_db_record_count(&state.db)
    );

    let db_path = crate::core::paths::db_path();
    let db_size_kb = std::fs::metadata(&db_path)
        .map(|m| m.len() as f64 / 1024.0)
        .unwrap_or(0.0);

    Ok(DbStats {
        item_count: item_count.unwrap_or(0),
        db_record_count: db_record_count.unwrap_or(0),
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
    repo_items::clear_all_items(&state.db).await
        .map_err(|e| format!("Failed to clear items: {}", e))?;
    
    {
        let mut cache = state.items_cache.write();
        cache.clear();
    }
    
    Ok("物品数据库已清空".to_string())
}

#[tauri::command]
pub async fn trigger_price_alert(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let ctx = state.active_context.read().clone();
    let config = state.config.read().clone();
    
    let all_section_items = repo_items::get_all_section_items(&state.db, &ctx.season_id, ctx.market_mode.as_str())
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
             serde_json::json!({
                 "item_name": item.item_name.unwrap_or_else(|| item.item_id.clone()),
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
        worth_items.iter()
            .map(|item| {
                let name = item.get("item_name").and_then(|v| v.as_str()).unwrap_or("未知");
                let current = item.get("current_price").and_then(|v| v.as_str()).unwrap_or("-");
                let savings = item.get("savings").and_then(|v| v.as_str()).unwrap_or("-");
                format!("• {} | 当前: {} | 节省: {}\n", name, current, savings)
            })
            .collect::<Vec<_>>()
            .join("")
    } else {
        let top_items: Vec<String> = worth_items.iter()
            .take(3)
            .map(|item| {
                let name = item.get("item_name").and_then(|v| v.as_str()).unwrap_or("未知");
                let savings = item.get("savings").and_then(|v| v.as_str()).unwrap_or("-");
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
        send_notification(&app, &title, &message)
            .map_err(|e| e.to_string())?;
        Ok(format!("发现 {} 件值得购买的物品，已发送通知", count))
    } else {
        Ok(format!("发现 {} 件值得购买的物品（通知已关闭）", count))
    }
}

#[tauri::command]
pub async fn get_item_types(state: State<'_, Arc<AppState>>) -> Result<Vec<String>, String> {
    repo_items::get_distinct_item_types(&state.db)
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
pub async fn get_notification_permission_status(app: AppHandle) -> Result<NotificationPermissionStatus, String> {
    let notification = app.notification();
    match notification.permission_state() {
        Ok(state) => {
            Ok(NotificationPermissionStatus {
                granted: state == PermissionState::Granted,
                denied: state == PermissionState::Denied,
                prompt: state == PermissionState::Prompt,
                unknown: false,
            })
        }
        Err(e) => Err(format!("获取权限状态失败: {}", e)),
    }
}

#[tauri::command]
pub async fn request_notification_permission(app: AppHandle) -> Result<bool, String> {
    let notification = app.notification();
    match notification.request_permission() {
        Ok(state) => {
            Ok(state == PermissionState::Granted)
        }
        Err(e) => Err(format!("请求权限失败: {}", e)),
    }
}
