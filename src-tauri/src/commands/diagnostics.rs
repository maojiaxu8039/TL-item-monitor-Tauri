use crate::commands::types::OkResponse;
use crate::core::state::AppState;
use crate::db::repo_source_diagnostics;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_source_diagnostics(state: State<'_, Arc<AppState>>) -> Result<Vec<crate::db::models::SourceDiagnostic>, String> {
    repo_source_diagnostics::get_diagnostics(&state.db).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_source_connection(
    state: State<'_, Arc<AppState>>,
    source: String,
) -> Result<OkResponse, String> {
    let start = std::time::Instant::now();

    let result = match source.as_str() {
        "qiandao" => {
            crate::scraper::scrape_fire_price().await.map(|_| ()).map_err(|e| e.to_string())
        }
        "luosi" => {
            let ctx = state.active_context.read().clone();
            crate::scraper::scrape_items(&ctx.season_id, ctx.market_mode.as_str()).await.map(|_| ()).map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown source: {}", source)),
    };

    let duration_ms = start.elapsed().as_millis() as i64;
    let success = result.is_ok();
    let error = result.err();

    let source_type = match source.as_str() {
        "qiandao" | "luosi" => "api",
        _ => "unknown",
    };

    let ctx = state.active_context.read().clone();
    let _ = repo_source_diagnostics::upsert_diagnostic(
        &state.db,
        &source,
        source_type,
        true,
        Some(ctx.market_mode.as_str()),
        None,
        success,
        duration_ms,
        None,
        error.as_deref(),
    ).await;

    if success {
        Ok(OkResponse::success("Connection test succeeded"))
    } else {
        Err(error.unwrap_or_else(|| "Connection test failed".to_string()))
    }
}
