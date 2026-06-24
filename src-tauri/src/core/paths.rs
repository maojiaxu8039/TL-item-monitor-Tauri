// core/paths.rs
use std::path::PathBuf;
use tauri::Manager;

pub const APP_DATA_DIR_NAME: &str = "com.torchscan.desktop";
pub const LEGACY_APP_DATA_DIR_NAME: &str = "com.tlmonitor.app";
pub const DEFAULT_VOICE_ALERT_RESOURCE: &str = "resources/audio/萝莉音.mp3";
const DEFAULT_VOICE_ALERT_FILE: &str = "萝莉音.mp3";
const DEFAULT_VOICE_ALERT_AUDIO_RESOURCE: &str = "audio/萝莉音.mp3";

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

    if cfg!(debug_assertions) {
        if !debug_data_path.exists() {
            let _ = std::fs::create_dir_all(&debug_data_path);
        }
        return debug_data_path;
    }

    // In production, use system data directory
    let base_dir = dirs::data_dir().unwrap_or_else(|| {
        tracing::warn!("[PATHS] dirs::data_dir() returned None, using current directory");
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    });

    let new_dir = base_dir.join(APP_DATA_DIR_NAME);
    let legacy_dir = base_dir.join(LEGACY_APP_DATA_DIR_NAME);

    // Migration: if new dir doesn't exist but legacy dir does, migrate data
    if !new_dir.exists() && legacy_dir.exists() {
        match migrate_legacy_data(&legacy_dir, &new_dir) {
            Ok(_) => {
                tracing::info!(
                    "[PATHS] Successfully migrated data from {:?} to {:?}",
                    legacy_dir,
                    new_dir
                );
            }
            Err(e) => {
                tracing::error!(
                    "[PATHS] Failed to migrate legacy data: {}. Falling back to legacy directory.",
                    e
                );
                return legacy_dir;
            }
        }
    }

    if !new_dir.exists() {
        match std::fs::create_dir_all(&new_dir) {
            Ok(_) => {
                tracing::info!("[PATHS] Created app directory: {:?}", new_dir);
            }
            Err(e) => {
                tracing::error!(
                    "[PATHS] Failed to create app directory {:?}: {}",
                    new_dir,
                    e
                );
            }
        }
    }

    new_dir
}

fn migrate_legacy_data(legacy_dir: &PathBuf, new_dir: &PathBuf) -> Result<(), std::io::Error> {
    tracing::info!(
        "[PATHS] Starting data migration from {:?} to {:?}",
        legacy_dir,
        new_dir
    );

    std::fs::create_dir_all(new_dir)?;

    let entries = std::fs::read_dir(legacy_dir)?;
    for entry in entries {
        let entry = entry?;
        let entry_path = entry.path();
        let file_name = entry.file_name();
        let dest_path = new_dir.join(&file_name);

        if dest_path.exists() {
            tracing::warn!(
                "[PATHS] Skipping migration of {:?} because target already exists",
                entry_path
            );
            continue;
        }

        match std::fs::rename(&entry_path, &dest_path) {
            Ok(_) => {
                tracing::info!("[PATHS] Migrated: {:?} -> {:?}", entry_path, dest_path);
            }
            Err(e) => {
                tracing::error!(
                    "[PATHS] Failed to migrate {:?}: {}. Trying copy.",
                    entry_path,
                    e
                );
                if entry_path.is_dir() {
                    copy_dir_recursive(&entry_path, &dest_path)?;
                } else {
                    std::fs::copy(&entry_path, &dest_path)?;
                }
            }
        }
    }

    Ok(())
}

fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> Result<(), std::io::Error> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let entry_path = entry.path();
        let file_name = entry.file_name();
        let dest_path = dst.join(&file_name);

        if entry_path.is_dir() {
            copy_dir_recursive(&entry_path, &dest_path)?;
        } else {
            std::fs::copy(&entry_path, &dest_path)?;
        }
    }
    Ok(())
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
            resource_dir.join(DEFAULT_VOICE_ALERT_AUDIO_RESOURCE),
        );
        push_unique_path(
            &mut candidates,
            resource_dir.join(DEFAULT_VOICE_ALERT_RESOURCE),
        );
        push_unique_path(&mut candidates, resource_dir.join(DEFAULT_VOICE_ALERT_FILE));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            push_unique_path(
                &mut candidates,
                exe_dir.join(DEFAULT_VOICE_ALERT_AUDIO_RESOURCE),
            );
            push_unique_path(&mut candidates, exe_dir.join(DEFAULT_VOICE_ALERT_RESOURCE));
            push_unique_path(&mut candidates, exe_dir.join(DEFAULT_VOICE_ALERT_FILE));
        }
    }

    if let Ok(current_dir) = std::env::current_dir() {
        push_unique_path(
            &mut candidates,
            current_dir.join(DEFAULT_VOICE_ALERT_AUDIO_RESOURCE),
        );
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
