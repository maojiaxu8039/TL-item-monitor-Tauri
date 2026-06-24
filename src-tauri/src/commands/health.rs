use crate::core::paths;
use crate::core::state::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Instant;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub status: String,
    pub version: String,
    pub database: ComponentHealth,
    pub data_dir: ComponentHealth,
    pub uptime_seconds: u64,
    pub checked_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentHealth {
    pub status: String,
    pub message: Option<String>,
    pub latency_ms: Option<f64>,
}

static START_TIME: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();

fn get_start_time() -> Instant {
    *START_TIME.get_or_init(Instant::now)
}

#[tauri::command]
pub async fn health_check(state: State<'_, Arc<AppState>>) -> Result<HealthStatus, String> {
    let database = check_database(&state).await;
    let data_dir = check_data_dir().await;
    let overall_status = if database.status == "healthy" && data_dir.status == "healthy" {
        "healthy"
    } else {
        "degraded"
    };

    Ok(HealthStatus {
        status: overall_status.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        database,
        data_dir,
        uptime_seconds: get_start_time().elapsed().as_secs(),
        checked_at: chrono::Utc::now().timestamp(),
    })
}

async fn check_database(state: &State<'_, Arc<AppState>>) -> ComponentHealth {
    let start = Instant::now();
    match sqlx::query("SELECT 1").fetch_one(&state.db).await {
        Ok(_) => ComponentHealth {
            status: "healthy".to_string(),
            message: None,
            latency_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
        },
        Err(e) => ComponentHealth {
            status: "unhealthy".to_string(),
            message: Some(e.to_string()),
            latency_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
        },
    }
}

async fn check_data_dir() -> ComponentHealth {
    let start = Instant::now();
    let dir = paths::app_dir();
    let status = if dir.exists() {
        "healthy"
    } else {
        match std::fs::create_dir_all(&dir) {
            Ok(_) => "healthy",
            Err(e) => {
                return ComponentHealth {
                    status: "unhealthy".to_string(),
                    message: Some(format!("无法创建数据目录: {}", e)),
                    latency_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
                };
            }
        }
    };
    ComponentHealth {
        status: status.to_string(),
        message: None,
        latency_ms: Some(start.elapsed().as_secs_f64() * 1000.0),
    }
}
