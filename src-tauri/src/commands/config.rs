use crate::commands::types::OkResponse;
use crate::core::state::AppState;
use crate::services::worth_service::WorthResult;
use crate::services::{evaluate_worth, send_notification};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_config(state: State<'_, Arc<AppState>>) -> Result<crate::core::state::AppConfig, String> {
    let cfg = state.config.read().clone();
    Ok(cfg)
}

#[tauri::command]
pub async fn save_config(
    state: State<'_, Arc<AppState>>,
    config: crate::core::state::AppConfig,
) -> Result<OkResponse, String> {
    crate::core::config::save_config(&config)?;
    {
        let mut cfg = state.config.write();
        *cfg = config.clone();
    }
    // Sync active context when season or mode changes
    {
        let mut ctx = state.active_context.write();
        ctx.season_id = config.app.season_id.clone();
    }
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
    evaluate_worth(item_fire_price, count, purchase_fire_price, consider_ratio, fire_per_rmb)
}

#[tauri::command]
pub async fn test_notification(app: tauri::AppHandle) -> Result<OkResponse, String> {
    send_notification(&app, "🔔 通知测试", "TL监控通知功能正常！")
        .map_err(|e| format!("Notification failed: {}", e))?;
    Ok(OkResponse::success("Notification sent"))
}

#[tauri::command]
pub async fn open_log_dir() -> Result<OkResponse, String> {
    let logs_dir = crate::core::paths::logs_dir();
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(&logs_dir).spawn().ok();
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&logs_dir).spawn().ok();
    }
    Ok(OkResponse::success("Opened log directory"))
}

#[tauri::command]
pub async fn select_local_items_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app.dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file();
    Ok(path.map(|p| p.to_string()))
}
