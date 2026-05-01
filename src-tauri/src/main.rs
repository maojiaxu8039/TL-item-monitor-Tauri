//! TL 物品火价监控 — Tauri 2.0 Desktop App

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::{Manager, WindowEvent};
use tracing::{error, info};

use crate::app::{init_app, start_background_tasks};
use crate::tray::setup_tray;

mod app;
mod commands;
mod core;
mod db;
mod scheduler;
mod scraper;
mod services;
mod tray;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    info!("TL Monitor v1.0.0 starting...");
    
    // Start Tokio runtime first
    let rt = tokio::runtime::Runtime::new()?;
    let rt_handle = rt.handle().clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let handle = rt_handle.clone();

            let state = match rt.block_on(async { init_app(&app_handle).await }) {
                Ok(state) => state,
                Err(e) => {
                    error!("init_app failed: {}", e);
                    let _ = tauri_plugin_notification::NotificationExt::notification(
                        &app_handle,
                    ).builder().title("启动失败").body(&format!("应用初始化失败: {}", e)).show();
                    return Err(e.into());
                }
            };
            let state = Arc::new(state);
            app.manage(state.clone());

            rt.spawn(async move {
                start_background_tasks(handle, app_handle, state);
            });

            if let Err(e) = setup_tray(app) {
                error!("Failed to setup tray: {}", e);
            }

            if let Some(main_window) = app.get_webview_window("main") {
                let window_clone = main_window.clone();
                main_window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
            }

            info!("App setup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_dashboard_summary,
            commands::set_active_market_context,
            commands::refresh_fire_price,
            commands::sync_fire_record,
            commands::refresh_items,
            commands::search_items,
            commands::get_sections,
            commands::create_section,
            commands::update_section,
            commands::delete_section,
            commands::reorder_sections,
            commands::get_section_items,
            commands::add_section_item,
            commands::update_section_item,
            commands::remove_section_item,
            commands::get_fire_history,
            commands::import_watchlist_csv,
            commands::export_watchlist_csv,
            commands::get_config,
            commands::save_config,
            commands::evaluate_worth_cmd,
            commands::test_notification,
            commands::open_log_dir,
            commands::get_db_stats,
            commands::get_items_stats,
            commands::reload_items,
            commands::validate_json_file,
            commands::get_alert_rules,
            commands::create_alert_rule,
            commands::update_alert_rule,
            commands::toggle_alert_rule,
            commands::delete_alert_rule,
            commands::get_alert_events,
            commands::get_backup_info,
            commands::backup_database,
            commands::restore_database,
            commands::export_fire_history_csv,
            commands::get_strategies,
            commands::create_strategy,
            commands::update_strategy,
            commands::delete_strategy,
            commands::get_source_diagnostics,
            commands::test_source_connection,
            commands::get_item_history,
            commands::get_item_types,
            commands::clear_items_database,
            commands::trigger_price_alert,
            commands::get_notification_permission_status,
            commands::request_notification_permission,
            commands::get_season_summary,
            commands::get_season_trends,
            commands::select_local_items_file,
            commands::write_file,
            commands::read_file,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri app failed to run");

    Ok(())
}
