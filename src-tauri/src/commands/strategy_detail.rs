use crate::commands::types::OkResponse;
use crate::core::state::AppState;
use crate::db::models_strategy::*;
use crate::db::repo_fire;
use crate::db::repo_strategy_detail;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_strategy_details(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<StrategyDetail>, String> {
    repo_strategy_detail::get_strategy_details(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_strategy_with_costs(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Option<StrategyWithCosts>, String> {
    repo_strategy_detail::get_strategy_with_costs(&state.db, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_strategies_with_costs(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<StrategyWithCosts>, String> {
    repo_strategy_detail::get_all_strategies_with_costs(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_strategy_detail(
    state: State<'_, Arc<AppState>>,
    req: CreateStrategyRequest,
) -> Result<String, String> {
    repo_strategy_detail::create_strategy_detail(&state.db, &req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_strategy_detail(
    state: State<'_, Arc<AppState>>,
    req: UpdateStrategyRequest,
) -> Result<OkResponse, String> {
    repo_strategy_detail::update_strategy_detail(&state.db, &req)
        .await
        .map_err(|e| e.to_string())?;
    Ok(OkResponse::success("Strategy updated"))
}

#[tauri::command]
pub async fn delete_strategy_detail(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<OkResponse, String> {
    repo_strategy_detail::delete_strategy_detail(&state.db, &id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(OkResponse::success("Strategy deleted"))
}

#[tauri::command]
pub async fn get_strategy_costs(
    state: State<'_, Arc<AppState>>,
    strategy_id: String,
) -> Result<Vec<StrategyCost>, String> {
    repo_strategy_detail::get_strategy_costs(&state.db, &strategy_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_strategy_cost(
    state: State<'_, Arc<AppState>>,
    req: AddCostRequest,
) -> Result<String, String> {
    repo_strategy_detail::add_strategy_cost(&state.db, &req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_strategy_cost(
    state: State<'_, Arc<AppState>>,
    req: UpdateCostRequest,
) -> Result<OkResponse, String> {
    repo_strategy_detail::update_strategy_cost(&state.db, &req)
        .await
        .map_err(|e| e.to_string())?;
    Ok(OkResponse::success("Cost updated"))
}

#[tauri::command]
pub async fn delete_strategy_cost(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<OkResponse, String> {
    repo_strategy_detail::delete_strategy_cost(&state.db, &id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(OkResponse::success("Cost deleted"))
}

#[tauri::command]
pub async fn get_strategy_outputs(
    state: State<'_, Arc<AppState>>,
    strategy_id: String,
) -> Result<Vec<StrategyOutput>, String> {
    repo_strategy_detail::get_strategy_outputs(&state.db, &strategy_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_strategy_output(
    state: State<'_, Arc<AppState>>,
    req: AddOutputRequest,
) -> Result<String, String> {
    repo_strategy_detail::add_strategy_output(&state.db, &req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_strategy_output(
    state: State<'_, Arc<AppState>>,
    req: UpdateOutputRequest,
) -> Result<OkResponse, String> {
    repo_strategy_detail::update_strategy_output(&state.db, &req)
        .await
        .map_err(|e| e.to_string())?;
    Ok(OkResponse::success("Output updated"))
}

#[tauri::command]
pub async fn delete_strategy_output(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<OkResponse, String> {
    repo_strategy_detail::delete_strategy_output(&state.db, &id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(OkResponse::success("Output deleted"))
}

#[tauri::command]
pub async fn refresh_strategy_fire_prices(
    state: State<'_, Arc<AppState>>,
    strategy_id: String,
) -> Result<StrategyWithCosts, String> {
    let ctx = state.active_context.read().clone();
    let costs = repo_strategy_detail::get_strategy_costs(&state.db, &strategy_id)
        .await
        .map_err(|e| e.to_string())?;

    for cost in costs {
        if cost.is_realtime {
            let fire_price = match repo_fire::get_latest_fire(&state.db, &ctx.season_id, ctx.market_mode.as_str()).await {
                Ok(Some(record)) => record.fire_per_rmb,
                _ => cost.fire_price,
            };
            let total_fire = cost.count * fire_price;

            sqlx::query(
                "UPDATE strategy_detail_costs SET fire_price=?, total_fire=?, updated_at=? WHERE id=?",
            )
            .bind(fire_price)
            .bind(total_fire)
            .bind(chrono::Utc::now().timestamp())
            .bind(&cost.id)
            .execute(&state.db)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    repo_strategy_detail::get_strategy_with_costs(&state.db, &strategy_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Strategy not found".to_string())
}
