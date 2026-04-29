use crate::commands::types::OkResponse;
use crate::core::state::AppState;
use crate::db::repo_alerts;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_alert_rules(state: State<'_, Arc<AppState>>) -> Result<Vec<crate::db::models::AlertRule>, String> {
    repo_alerts::get_alert_rules(&state.db).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_alert_rule(
    state: State<'_, Arc<AppState>>,
    strategy_id: Option<String>,
    section_id: Option<String>,
    item_id: Option<String>,
    rule_type: String,
    threshold: f64,
    cooldown_seconds: i32,
) -> Result<crate::db::models::AlertRule, String> {
    repo_alerts::create_alert_rule(&state.db, strategy_id.as_deref(), section_id.as_deref(), item_id.as_deref(), &rule_type, threshold, cooldown_seconds).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_alert_rule(
    state: State<'_, Arc<AppState>>,
    id: String,
    strategy_id: Option<String>,
    section_id: Option<String>,
    item_id: Option<String>,
    rule_type: String,
    threshold: f64,
    cooldown_seconds: i32,
    enabled: bool,
) -> Result<OkResponse, String> {
    repo_alerts::update_alert_rule(&state.db, &id, strategy_id.as_deref(), section_id.as_deref(), item_id.as_deref(), &rule_type, threshold, cooldown_seconds, enabled).await?;
    Ok(OkResponse::success("Alert rule updated"))
}

#[tauri::command]
pub async fn toggle_alert_rule(state: State<'_, Arc<AppState>>, id: String, enabled: bool) -> Result<OkResponse, String> {
    repo_alerts::toggle_alert_rule(&state.db, &id, enabled).await?;
    Ok(OkResponse::success("Alert rule toggled"))
}

#[tauri::command]
pub async fn delete_alert_rule(state: State<'_, Arc<AppState>>, id: String) -> Result<OkResponse, String> {
    repo_alerts::delete_alert_rule(&state.db, &id).await?;
    Ok(OkResponse::success("Alert rule deleted"))
}

#[tauri::command]
pub async fn get_alert_events(state: State<'_, Arc<AppState>>, limit: i32) -> Result<Vec<crate::db::models::AlertEvent>, String> {
    repo_alerts::get_alert_events(&state.db, limit as i64).await.map_err(|e| e.to_string())
}
