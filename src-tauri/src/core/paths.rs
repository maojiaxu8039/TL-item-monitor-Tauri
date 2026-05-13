// core/paths.rs
use std::path::PathBuf;

fn app_dir() -> PathBuf {
    // In debug mode, use project directory's data folder
    let debug_data_path = if cfg!(debug_assertions) {
        let project_dir = std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("..");
        let data_path = project_dir.join("data");
        if data_path.exists() {
            tracing::info!("[PATHS] Using debug data path: {:?}", data_path);
            return data_path;
        }
        data_path
    } else {
        PathBuf::new()
    };

    // In production, use system data directory
    let prod_dir = dirs::data_dir()
        .unwrap_or_else(|| {
            tracing::warn!("[PATHS] dirs::data_dir() returned None, using current directory");
            std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
        })
        .join("com.tlmonitor.app");

    let final_dir = if cfg!(debug_assertions) { debug_data_path } else { prod_dir };

    if !final_dir.exists() {
        match std::fs::create_dir_all(&final_dir) {
            Ok(_) => {
                tracing::info!("[PATHS] Created app directory: {:?}", final_dir);
            }
            Err(e) => {
                tracing::error!("[PATHS] Failed to create app directory {:?}: {}", final_dir, e);
            }
        }
    }

    final_dir
}

pub fn db_path() -> PathBuf {
    app_dir().join("tl_monitor.db")
}

pub fn logs_dir() -> PathBuf {
    let dir = app_dir().join("logs");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    dir
}

pub fn config_path() -> PathBuf {
    app_dir().join("config.yaml")
}
