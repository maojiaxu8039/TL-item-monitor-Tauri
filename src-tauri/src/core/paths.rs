// core/paths.rs
use std::path::PathBuf;

fn app_dir() -> PathBuf {
    if cfg!(debug_assertions) {
        let project_dir = std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("..");
        let data_path = project_dir.join("data");
        if data_path.exists() {
            return data_path;
        }
        data_path
    } else {
        dirs::data_dir()
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
            .join("com.tlmonitor.app")
    }
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
