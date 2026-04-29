use crate::commands::types::{FirePriceUI, OkResponse, DashboardSummary};
use crate::core::state::{AppState, MarketMode};
use crate::db::repo_fire;
use crate::db::repo_items;
use crate::db::repo_history;
use crate::scraper;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_dashboard_summary(state: State<'_, Arc<AppState>>) -> Result<DashboardSummary, String> {
    let ctx = state.active_context.read().clone();
    let fire = state.fire_price.read().clone();
    let status = state.task_status.read().clone();

    let (item_count, db_record_count) = tokio::join!(
        repo_items::get_items_count(&state.db),
        repo_items::get_db_record_count(&state.db)
    );

    let last_fire_at = status.last_fire_scrape
        .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0))
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());

    let last_items_at = status.last_items_reload
        .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0))
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());

    Ok(DashboardSummary {
        fire: fire.map(FirePriceUI::from),
        total_fire: 0.0,
        total_rmb: 0.0,
        season_name: ctx.season_id.clone(),
        market_mode: ctx.market_mode.as_str().to_string(),
        item_count: item_count.unwrap_or(0),
        db_record_count: db_record_count.unwrap_or(0),
        last_fire_at,
        last_items_at,
        task_running: status.fire_scrape_running || status.items_reload_running,
    })
}

#[tauri::command]
pub async fn set_active_market_context(
    state: State<'_, Arc<AppState>>,
    season_id: String,
    market_mode: String,
) -> Result<OkResponse, String> {
    let mode = match market_mode.as_str() {
        "season_expert" => MarketMode::SeasonExpert,
        _ => MarketMode::SeasonNormal,
    };
    {
        let mut ctx = state.active_context.write();
        ctx.season_id = season_id;
        ctx.market_mode = mode;
    }
    Ok(OkResponse::success("Market context updated"))
}

#[tauri::command]
pub async fn refresh_fire_price(state: State<'_, Arc<AppState>>) -> Result<FirePriceUI, String> {
    let snapshot = scraper::scrape_fire_price().await?;
    let ctx = state.active_context.read().clone();

    let _ = repo_fire::insert_fire_record(
        &state.db,
        &ctx.season_id,
        ctx.market_mode.as_str(),
        &snapshot,
    ).await;

    {
        let mut fire = state.fire_price.write();
        *fire = Some(snapshot.clone());
    }

    Ok(FirePriceUI::from(snapshot))
}

#[tauri::command]
pub async fn refresh_items(_state: State<'_, Arc<AppState>>) -> Result<OkResponse, String> {
    Ok(OkResponse::success("Items refreshed"))
}

#[tauri::command]
pub async fn get_fire_history(
    state: State<'_, Arc<AppState>>,
    hours: i64,
) -> Result<Vec<serde_json::Value>, String> {
    Ok(repo_fire::get_fire_history(&state.db, hours).await?)
}

#[tauri::command]
pub async fn export_fire_history_csv(state: State<'_, Arc<AppState>>, hours: i64) -> Result<String, String> {
    let records = repo_fire::get_fire_history(&state.db, hours).await?;
    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record(["rmb_per_10k_fire", "fire_per_rmb", "increase_ratio", "scraped_at"])
        .map_err(|e| e.to_string())?;
    for r in records {
        let rmb_per_10k_fire = r.get("rmb_per_10k_fire").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let fire_per_rmb = r.get("fire_per_rmb").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let increase_ratio = r.get("increase_ratio").and_then(|v| v.as_f64());
        let scraped_at = r.get("scraped_at").and_then(|v| v.as_i64()).unwrap_or(0);
        wtr.write_record([
            rmb_per_10k_fire.to_string(),
            fire_per_rmb.to_string(),
            increase_ratio.map(|v| v.to_string()).unwrap_or_default(),
            scraped_at.to_string(),
        ]).map_err(|e| e.to_string())?;
    }
    let data = wtr.into_inner().map_err(|e| e.to_string())?;
    String::from_utf8(data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_season_summary(
    state: State<'_, Arc<AppState>>,
) -> Result<repo_history::SeasonSummary, String> {
    let ctx = state.active_context.read().clone();
    repo_history::get_season_summary(&state.db, &ctx.season_id, ctx.market_mode.as_str())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_season_trends(
    state: State<'_, Arc<AppState>>,
    hours: Option<i64>,
) -> Result<Vec<repo_history::SeasonTrendHour>, String> {
    let ctx = state.active_context.read().clone();
    repo_history::get_season_trends(&state.db, &ctx.season_id, ctx.market_mode.as_str(), hours.unwrap_or(24))
        .await
        .map_err(|e| e.to_string())
}
