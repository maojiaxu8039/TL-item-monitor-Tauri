//! TL 物品火价监控 — Tauri 2.0 Desktop App

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::{Manager, WindowEvent};
use tracing::{error, info};

use tl_monitor::app::{init_app, start_background_tasks};
use tl_monitor::tray::setup_tray;
use tl_monitor::commands::*;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    info!("TL Monitor v1.0.0 starting...");
    
    // Start Tokio runtime first
    let rt = tokio::runtime::Runtime::new()?;
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
            // Fire commands
            get_dashboard_summary,
            set_active_market_context,
            refresh_fire_price,
            refresh_items,
            get_fire_history,
            export_fire_history_csv,
            get_season_summary,
            get_season_trends,
            sync_fire_record,
            get_fire_price_compare,
            get_fire_price_insight,
            get_item_price_insights,
            // Items commands
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
            get_items_price_compare,
            // Sections commands
            get_sections,
            create_section,
            update_section,
            delete_section,
            reorder_sections,
            get_section_items,
            add_section_item,
            update_section_item,
            remove_section_item,
            // Alerts commands
            get_alert_rules,
            create_alert_rule,
            update_alert_rule,
            toggle_alert_rule,
            delete_alert_rule,
            get_alert_events,
            // Strategies commands
            get_strategies,
            create_strategy,
            update_strategy,
            delete_strategy,
            // Config commands
            get_config,
            save_config,
            evaluate_worth_cmd,
            test_notification,
            open_log_dir,
            select_local_items_file,
            // Import/Export commands
            import_watchlist_csv,
            export_watchlist_csv,
            get_backup_info,
            backup_database,
            restore_database,
            // Diagnostics commands
            get_source_diagnostics,
            test_source_connection,
            // Deals commands
            get_deal_alerts,
            // Season commands
            archive_season,
            init_new_season,
            list_seasons,
            get_season_api_config_cmd,
            set_season_api_config_cmd,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            
            // Initialize app state and database
            let state = rt_handle.block_on(async {
                match init_app(&handle).await {
                    Ok(state) => Arc::new(state),
                    Err(e) => {
                        error!("App initialization failed: {}", e);
                        panic!("Failed to initialize app: {}", e);
                    }
                }
            });
            
            // Register state with Tauri so commands can access it via State
            app.manage(state.clone());
            
            // Start background tasks
            let app_handle = handle.clone();
            let rt_handle_clone = rt.handle().clone();
            std::thread::spawn(move || {
                start_background_tasks(rt_handle_clone, app_handle, state);
            });
            
            // Setup system tray
            setup_tray(app)?;
            
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Hide window instead of closing
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
