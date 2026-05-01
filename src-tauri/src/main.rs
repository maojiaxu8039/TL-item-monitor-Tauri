//! TL 物品火价监控 — Tauri 2.0 Desktop App

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::{Manager, WindowEvent};
use tracing::{error, info};

use tl_monitor::app::{init_app, start_background_tasks};
use tl_monitor::tray::setup_tray;

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
