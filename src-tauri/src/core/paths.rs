// core/paths.rs
use std::path::PathBuf;

fn app_dir() -> PathBuf {
    let base = dirs::data_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("AppData").join("Roaming")))
        .unwrap_or_else(|| {
            std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
        });
    base.join("com.tlmonitor.app")
}

pub fn db_path() -> PathBuf {
    app_dir().join("data").join("tl_monitor.db")
}

pub fn logs_dir() -> PathBuf {
    app_dir().join("logs")
}

pub fn config_path() -> PathBuf {
    app_dir().join("config.yaml")
}
