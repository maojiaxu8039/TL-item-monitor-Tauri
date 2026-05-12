// core/paths.rs
use std::path::PathBuf;

fn app_dir() -> PathBuf {
    let dir = if cfg!(debug_assertions) {
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
    };

    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    dir
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
