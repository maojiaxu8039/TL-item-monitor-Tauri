use crate::commands::types::OkResponse;
use crate::core::state::AppState;
use crate::db::repo_strategies;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn get_strategies(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<crate::db::models::Strategy>, String> {
    repo_strategies::get_strategies(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_strategy(
    state: State<'_, Arc<AppState>>,
    name: String,
) -> Result<crate::db::models::Strategy, String> {
    let now = chrono::Utc::now().timestamp();
    let strategy = crate::db::models::Strategy {
        id: Uuid::new_v4().to_string(),
        name,
        season_scope: "all".to_string(),
        enabled: 1,
        consider_ratio: 1.15,
        sort_rule: "purchase_gap".to_string(),
        notification_enabled: 1,
        cooldown_seconds: 1800,
        quiet_start: None,
        quiet_end: None,
        created_at: now,
        updated_at: now,
    };
    repo_strategies::create_strategy(&state.db, &strategy).await?;
    Ok(strategy)
}

#[tauri::command]
pub async fn update_strategy(
    state: State<'_, Arc<AppState>>,
    strategy: crate::db::models::Strategy,
) -> Result<OkResponse, String> {
    repo_strategies::update_strategy(&state.db, &strategy).await?;
    Ok(OkResponse::success("Strategy updated"))
}

#[tauri::command]
pub async fn delete_strategy(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<OkResponse, String> {
    repo_strategies::delete_strategy(&state.db, &id).await?;
    Ok(OkResponse::success("Strategy deleted"))
}
