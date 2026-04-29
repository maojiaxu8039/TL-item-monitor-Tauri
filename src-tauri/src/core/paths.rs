// core/paths.rs
use std::path::PathBuf;

fn app_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.tlmonitor.app")
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
