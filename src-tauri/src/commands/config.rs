use crate::commands::types::OkResponse;
use crate::core::state::AppState;
use crate::db::repo_sections;
use crate::scheduler::alert_task::play_configured_voice_alert;
use crate::services::worth_service::WorthResult;
use crate::services::{
    desktop_notifications_enabled, evaluate_worth, format_worth_alert_notification,
    send_notification, WorthAlertNotificationItem,
};
use std::sync::Arc;
use tauri::{Manager, State};

use crate::core::state::MarketMode;

#[tauri::command]
pub async fn get_config(
    state: State<'_, Arc<AppState>>,
) -> Result<crate::core::state::AppConfig, String> {
    let cfg = state.config.read().clone();
    Ok(cfg)
}

#[tauri::command]
pub async fn save_config(
    state: State<'_, Arc<AppState>>,
    config: crate::core::state::AppConfig,
) -> Result<OkResponse, String> {
    // Update memory first for immediate consistency
    {
        let mut cfg = state.config.write();
        *cfg = config.clone();
    }
    // Sync active context when season or mode changes
    {
        let mut ctx = state.active_context.write();
        ctx.season_id = config.app.season_id.clone();
        ctx.market_mode = match config.scrape.fire_price_mode.as_str() {
            "season_expert" => MarketMode::SeasonExpert,
            _ => MarketMode::SeasonNormal,
        };
    }
    // Then persist to disk
    crate::core::config::save_config(&config)?;
    Ok(OkResponse::success("Config saved"))
}

#[tauri::command]
pub async fn evaluate_worth_cmd(
    item_fire_price: f64,
    count: i32,
    purchase_fire_price: f64,
    consider_ratio: f64,
    fire_per_rmb: f64,
) -> WorthResult {
    evaluate_worth(
        item_fire_price,
        count,
        purchase_fire_price,
        consider_ratio,
        fire_per_rmb,
    )
}

#[tauri::command]
pub async fn test_notification(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<OkResponse, String> {
    let ctx = state.active_context.read().clone();
    let notification_config = {
        let config = state.config.read();
        config.notification.clone()
    };

    let worth_items: Vec<_> = repo_sections::get_section_items_for_context(
        &state.db,
        &ctx.season_id,
        ctx.market_mode.as_str(),
    )
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .filter(|item| {
        let purchase_price = item.purchase_fire_price;
        let current_price = item.current_price.unwrap_or(0.0);
        purchase_price > 0.0 && current_price > 0.0 && current_price < purchase_price
    })
    .collect();

    if worth_items.is_empty() {
        return Ok(OkResponse::success(
            "当前没有满足条件的物品，未发送预警通知",
        ));
    }

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
    let title = format!("🔥 发现 {} 件满足条件预警", worth_items.len());
    let message = format_worth_alert_notification(&notification_items);

    let desktop_enabled = desktop_notifications_enabled(&notification_config);
    if desktop_enabled {
        send_notification(&app, &title, &message)
            .map_err(|e| format!("Notification failed: {}", e))?;
    }

    if notification_config.voice_alert_enabled {
        play_configured_voice_alert(&app, &notification_config, 1)
            .await
            .map_err(|e| format!("Voice alert failed: {}", e))?;
        if desktop_enabled {
            Ok(OkResponse::success("满足条件预警通知和语音已触发"))
        } else {
            Ok(OkResponse::success(
                "系统通知已关闭，满足条件预警语音已触发",
            ))
        }
    } else if desktop_enabled {
        Ok(OkResponse::success("满足条件预警通知已触发"))
    } else {
        Ok(OkResponse::success("系统通知和语音均已关闭，未发送提醒"))
    }
}

#[tauri::command]
pub async fn open_log_dir() -> Result<OkResponse, String> {
    let logs_dir = crate::core::paths::logs_dir();
    if !tokio::fs::try_exists(&logs_dir).await.unwrap_or(false) {
        tokio::fs::create_dir_all(&logs_dir)
            .await
            .map_err(|e| format!("Failed to create logs directory: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        tokio::process::Command::new("explorer")
            .arg(&logs_dir)
            .spawn()
            .ok();
    }
    #[cfg(target_os = "macos")]
    {
        tokio::process::Command::new("open")
            .arg(&logs_dir)
            .spawn()
            .ok();
    }
    Ok(OkResponse::success("Opened log directory"))
}

#[tauri::command]
pub async fn select_local_items_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file();
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
pub fn get_app_data_dir() -> Result<String, String> {
    Ok(crate::core::paths::app_dir().to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_resource_path(app: tauri::AppHandle, resource_name: &str) -> Result<String, String> {
    app.path()
        .resource_dir()
        .map(|p: std::path::PathBuf| p.join(resource_name).to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get resource path: {}", e))
}
