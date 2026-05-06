// core/paths.rs
use std::path::PathBuf;

fn app_dir() -> PathBuf {
    // Use project directory for development to allow easy DB reset
    let project_dir = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("..");

    // Check if we're in development mode (project directory exists with src-tauri)
    let dev_path = project_dir.join("dev_data");
    if dev_path.exists() || std::env::var("TL_MONITOR_DEV").is_ok() {
        return dev_path;
    }

    // Production: use system data directory
    let base = dirs::data_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("AppData").join("Roaming")))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    base.join("com.tlmonitor.app")
}

pub fn db_path() -> PathBuf {
    app_dir().join("tl_monitor.db")
}

pub fn logs_dir() -> PathBuf {
    app_dir().join("logs")
}

pub fn config_path() -> PathBuf {
    app_dir().join("config.yaml")
}
