//! TorchScan — Tauri 2.0 Desktop App

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::{Manager, WindowEvent};
use tracing::{error, info};

use torchscan::app::{init_app, start_background_tasks};
use torchscan::commands::*;
use torchscan::tray::setup_tray;

fn main() {
    let exe_path = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    let panic_log_path = exe_path.clone();

    std::panic::set_hook(Box::new(move |panic_info| {
        let msg = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };

        let location = panic_info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());

        let error_msg = format!(
            "PANIC at {}: {}\nBacktrace:\n{:?}",
            location,
            msg,
            std::backtrace::Backtrace::capture()
        );

        eprintln!("{}", error_msg);

        let crash_log = panic_log_path.join("crash.log");
        let _ = std::fs::write(&crash_log, &error_msg);
    }));

    if let Err(e) = run_app() {
        eprintln!("Application failed to start: {}", e);

        let error_log = exe_path.join("startup_error.log");
        let _ = std::fs::write(&error_log, format!("{}", e));

        std::process::exit(1);
    }
}

fn run_app() -> Result<(), Box<dyn std::error::Error>> {
    info!(
        "TorchScan v{} starting...",
        torchscan::core::constants::APP_VERSION
    );

    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|e| format!("Failed to create Tokio runtime: {}", e))?;
    let rt_handle = rt.handle().clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
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
            sync_fire_batch,
            get_fire_price_compare,
            get_fire_price_insight,
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
            sync_items_batch,
            fast_sync_items,
            get_item_history_by_season,
            get_item_history_by_day,
            get_items_price_compare,
            get_realtime_fire_changes,
            get_sections,
            create_section,
            update_section,
            delete_section,
            reorder_sections,
            get_section_items,
            get_section_items_for_context,
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
            health_check,
            select_local_items_file,
            get_app_data_dir,
            get_resource_path,
            import_watchlist_csv,
            export_watchlist_csv,
            export_inventory_csv,
            export_buy_watches_csv,
            export_arbitrage_recipes_csv,
            import_arbitrage_recipes_csv,
            import_inventory_csv,
            import_buy_watches_csv,
            export_alert_rules_csv,
            import_alert_rules_csv,
            export_strategies_csv,
            import_strategies_csv,
            export_seasons_csv,
            import_seasons_csv,
            import_fire_history_csv,
            get_backup_info,
            backup_database,
            maintain_database,
            restore_database,
            get_source_diagnostics,
            test_source_connection,
            get_deal_alerts,
            list_seasons,
            get_season_api_config_cmd,
            set_season_api_config_cmd,
            probe_season_api_cmd,
            switch_current_season_cmd,
            update_item_mapping,
            get_item_mapping_count,
            fetch_server_json_cmd,
            post_server_json_cmd,
            get_installed_skills,
            openclaw_chat,
            get_strategy_details,
            get_strategy_with_costs,
            get_all_strategies_with_costs,
            create_strategy_detail,
            update_strategy_detail,
            delete_strategy_detail,
            get_strategy_costs,
            add_strategy_cost,
            update_strategy_cost,
            delete_strategy_cost,
            get_strategy_outputs,
            add_strategy_output,
            update_strategy_output,
            delete_strategy_output,
            refresh_strategy_fire_prices,
            get_arbitrage_recipes,
            get_arbitrage_recipe_detail,
            create_arbitrage_recipe,
            update_arbitrage_recipe,
            update_arbitrage_ingredients,
            update_arbitrage_outputs,
            delete_arbitrage_recipe,
            calculate_arbitrage,
            search_items_for_arbitrage,
            get_arbitrage_item_price,
            toggle_arbitrage_recipe_enabled,
            get_window_mode_state,
            set_mini_window_mode,
            set_window_opacity,
            save_window_layout,
            get_mini_window_feed,
            list_inventory_positions,
            create_inventory_position,
            update_inventory_position,
            delete_inventory_position,
            mark_inventory_sold,
            mark_inventory_ignored,
            get_inventory_summary,
            get_sell_ready_positions,
            list_inventory_buy_watches,
            create_inventory_buy_watch,
            update_inventory_buy_watch,
            delete_inventory_buy_watch,
            get_buy_ready_watches,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            let init_start = std::time::Instant::now();
            let state: Arc<torchscan::core::state::AppState> = rt_handle.block_on(async {
                match init_app(&handle).await {
                    Ok(state) => Ok(Arc::new(state)),
                    Err(e) => {
                        error!("App initialization failed: {}", e);
                        Err(format!("Failed to initialize app: {}", e))
                    }
                }
            })?;
            info!("App initialization completed in {:?}", init_start.elapsed());

            app.manage(state.clone());

            let app_handle = handle.clone();
            let rt_handle_clone = rt_handle.clone();
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
                let is_quitting = window
                    .app_handle()
                    .try_state::<Arc<torchscan::core::state::AppState>>()
                    .map(|state| state.is_quitting.load(std::sync::atomic::Ordering::SeqCst))
                    .unwrap_or(false);

                if is_quitting {
                    return;
                }

                if let Err(e) = window.hide() {
                    error!("Failed to hide window: {}", e);
                }
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .map_err(|e| format!("Tauri application error: {}", e))?;

    // Keep the background task runtime alive until the Tauri event loop exits.
    drop(rt);

    Ok(())
}
