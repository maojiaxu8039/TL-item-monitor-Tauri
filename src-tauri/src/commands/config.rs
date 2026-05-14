use crate::commands::types::OkResponse;
use crate::core::state::AppState;
use crate::scheduler::alert_task::play_configured_voice_alert;
use crate::services::worth_service::WorthResult;
use crate::services::{evaluate_worth, send_notification};
use std::sync::Arc;
use tauri::{Manager, State};

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
    send_notification(&app, "🔔 通知测试", "TorchScan 通知功能正常！")
        .map_err(|e| format!("Notification failed: {}", e))?;

    let notification_config = {
        let config = state.config.read();
        config.notification.clone()
    };

    if notification_config.voice_alert_enabled {
        play_configured_voice_alert(&app, &notification_config, 1)
            .await
            .map_err(|e| format!("Voice alert failed: {}", e))?;
        Ok(OkResponse::success("Notification and voice sent"))
    } else {
        Ok(OkResponse::success("Notification sent"))
    }
}

#[tauri::command]
pub async fn open_log_dir() -> Result<OkResponse, String> {
    let logs_dir = crate::core::paths::logs_dir();
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&logs_dir)
            .spawn()
            .ok();
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
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
