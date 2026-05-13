// core/paths.rs
use std::path::PathBuf;
use tauri::Manager;

pub const APP_DATA_DIR_NAME: &str = "com.tlmonitor.app";
pub const DEFAULT_VOICE_ALERT_RESOURCE: &str = "resources/audio/萝莉音.mp3";

pub fn app_dir() -> PathBuf {
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
        .join(APP_DATA_DIR_NAME);

    let final_dir = if cfg!(debug_assertions) {
        debug_data_path
    } else {
        prod_dir
    };

    if !final_dir.exists() {
        match std::fs::create_dir_all(&final_dir) {
            Ok(_) => {
                tracing::info!("[PATHS] Created app directory: {:?}", final_dir);
            }
            Err(e) => {
                tracing::error!(
                    "[PATHS] Failed to create app directory {:?}: {}",
                    final_dir,
                    e
                );
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

pub fn archives_dir() -> PathBuf {
    app_dir().join("archives")
}

pub fn backups_dir() -> PathBuf {
    app_dir().join("backups")
}

pub fn data_dir() -> PathBuf {
    app_dir().join("data")
}

pub fn resolve_voice_alert_path(app: &tauri::AppHandle, configured_path: &str) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    let configured_path = configured_path.trim();

    if !configured_path.is_empty() {
        let configured = PathBuf::from(configured_path);
        push_unique_path(&mut candidates, configured.clone());

        if let Ok(resource_dir) = app.path().resource_dir() {
            push_unique_path(&mut candidates, resource_dir.join(&configured));
            push_unique_path(
                &mut candidates,
                resource_dir.join("resources").join(&configured),
            );
        }

        if let Ok(current_dir) = std::env::current_dir() {
            push_unique_path(&mut candidates, current_dir.join(&configured));
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        push_unique_path(
            &mut candidates,
            resource_dir.join(DEFAULT_VOICE_ALERT_RESOURCE),
        );
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            push_unique_path(&mut candidates, exe_dir.join(DEFAULT_VOICE_ALERT_RESOURCE));
        }
    }

    if let Ok(current_dir) = std::env::current_dir() {
        push_unique_path(
            &mut candidates,
            current_dir.join(DEFAULT_VOICE_ALERT_RESOURCE),
        );
        push_unique_path(
            &mut candidates,
            current_dir
                .join("src-tauri")
                .join(DEFAULT_VOICE_ALERT_RESOURCE),
        );
    }

    candidates.into_iter().find(|path| path.is_file())
}

fn push_unique_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !paths.iter().any(|existing| existing == &path) {
        paths.push(path);
    }
}
