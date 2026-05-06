//! TL 物品火价监控 — Tauri 2.0 Desktop App

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::{Manager, WindowEvent};
use tracing::{error, info};

use tl_monitor::app::{init_app, start_background_tasks};
use tl_monitor::commands::*;
use tl_monitor::tray::setup_tray;

fn main() {
    if let Err(e) = run_app() {
        eprintln!("Application failed to start: {}", e);
        std::process::exit(1);
    }
}

fn run_app() -> Result<(), Box<dyn std::error::Error>> {
    info!("TL Monitor v{} starting...", tl_monitor::core::constants::APP_VERSION);

    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create Tokio runtime: {}", e))?;
    let rt_handle = rt.handle().clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_dashboard_summary,
            set_active_market_context,
            refresh_fire_price,
            refresh_items,
            get_fire_history,
            get_fire_history_by_season,
            export_fire_history_csv,
            get_season_summary,
            get_season_trends,
            sync_fire_record,
            get_fire_price_compare,
            get_fire_price_insight,
            get_item_price_insights,
            search_items,
            get_items_stats,
            validate_json_file,
            reload_items,
            get_db_stats,
            get_item_history,
            clear_items_database,
            trigger_price_alert,
            get_item_types,
            get_notification_permission_status,
            request_notification_permission,
            sync_items_record,
            get_item_history_by_season,
            get_item_history_by_day,
            get_items_price_compare,
            get_realtime_fire_changes,
            seed_realtime_fire_data,
            get_sections,
            create_section,
            update_section,
            delete_section,
            reorder_sections,
            get_section_items,
            add_section_item,
            update_section_item,
            remove_section_item,
            get_alert_rules,
            create_alert_rule,
            update_alert_rule,
            toggle_alert_rule,
            delete_alert_rule,
            get_alert_events,
            get_strategies,
            create_strategy,
            update_strategy,
            delete_strategy,
            get_config,
            save_config,
            evaluate_worth_cmd,
            test_notification,
            open_log_dir,
            select_local_items_file,
            import_watchlist_csv,
            export_watchlist_csv,
            get_backup_info,
            backup_database,
            restore_database,
            get_source_diagnostics,
            test_source_connection,
            get_deal_alerts,
            archive_season,
            init_new_season,
            list_seasons,
            get_season_api_config_cmd,
            set_season_api_config_cmd,
            get_installed_skills,
            openclaw_chat,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            let state: Arc<tl_monitor::core::state::AppState> = rt_handle.block_on(async {
                match init_app(&handle).await {
                    Ok(state) => Ok(Arc::new(state)),
                    Err(e) => {
                        error!("App initialization failed: {}", e);
                        Err(format!("Failed to initialize app: {}", e))
                    }
                }
            })?;

            app.manage(state.clone());

            let app_handle = handle.clone();
            let rt_handle_clone = rt.handle().clone();
            let state_for_tasks = state.clone();
            std::thread::spawn(move || {
                let handle = start_background_tasks(rt_handle_clone, app_handle, state_for_tasks);
                state.scheduler_handle.write().replace(handle);
            });

            setup_tray(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if let Err(e) = window.hide() {
                    error!("Failed to hide window: {}", e);
                }
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .map_err(|e| format!("Tauri application error: {}", e))?;

    Ok(())
}
