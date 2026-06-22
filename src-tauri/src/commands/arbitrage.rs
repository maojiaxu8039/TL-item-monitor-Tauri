use crate::commands::types::{OkResponse, ImportResp};
use crate::core::state::AppState;
use crate::db::models_arbitrage::{
    ArbitrageRecipe, ArbitrageRecipeWithDetails, ArbitrageResponse, CreateRecipeRequest,
    UpdateIngredientsRequest, UpdateOutputsRequest, UpdateRecipeRequest,
};
use crate::db::repo_arbitrage;
use crate::db::repo_items::{self, ItemSearchResult};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_arbitrage_recipes(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ArbitrageRecipe>, String> {
    repo_arbitrage::get_all_recipes(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_arbitrage_recipe_detail(
    state: State<'_, Arc<AppState>>,
    recipe_id: String,
) -> Result<Option<ArbitrageRecipeWithDetails>, String> {
    repo_arbitrage::get_recipe_with_details(&state.db, &recipe_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_arbitrage_recipe(
    state: State<'_, Arc<AppState>>,
    request: CreateRecipeRequest,
) -> Result<String, String> {
    repo_arbitrage::create_recipe(
        &state.db,
        &request.name,
        &request.recipe_type,
        request.enabled,
        &request.ingredients,
        &request.outputs,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_arbitrage_recipe(
    state: State<'_, Arc<AppState>>,
    recipe_id: String,
    request: UpdateRecipeRequest,
) -> Result<OkResponse, String> {
    repo_arbitrage::update_recipe(
        &state.db,
        &recipe_id,
        request.name.as_deref(),
        request.recipe_type.as_deref(),
        request.enabled,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(OkResponse::success("Recipe updated"))
}

#[tauri::command]
pub async fn update_arbitrage_ingredients(
    state: State<'_, Arc<AppState>>,
    recipe_id: String,
    request: UpdateIngredientsRequest,
) -> Result<OkResponse, String> {
    repo_arbitrage::update_ingredients(&state.db, &recipe_id, &request.ingredients)
        .await
        .map_err(|e| e.to_string())?;

    Ok(OkResponse::success("Ingredients updated"))
}

#[tauri::command]
pub async fn update_arbitrage_outputs(
    state: State<'_, Arc<AppState>>,
    recipe_id: String,
    request: UpdateOutputsRequest,
) -> Result<OkResponse, String> {
    repo_arbitrage::update_outputs(&state.db, &recipe_id, &request.outputs)
        .await
        .map_err(|e| e.to_string())?;

    Ok(OkResponse::success("Outputs updated"))
}

#[tauri::command]
pub async fn delete_arbitrage_recipe(
    state: State<'_, Arc<AppState>>,
    recipe_id: String,
) -> Result<OkResponse, String> {
    repo_arbitrage::delete_recipe(&state.db, &recipe_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(OkResponse::success("Recipe deleted"))
}

#[tauri::command]
pub async fn calculate_arbitrage(
    state: State<'_, Arc<AppState>>,
    season_id: Option<String>,
    market_mode: Option<String>,
    show_all: Option<bool>,
) -> Result<ArbitrageResponse, String> {
    let ctx = state.active_context.read().clone();
    let effective_season_id = season_id.clone().unwrap_or(ctx.season_id.clone());
    let effective_market_mode = market_mode
        .clone()
        .unwrap_or_else(|| ctx.market_mode.as_str().to_string());

    if let Err(e) = crate::db::table_resolver::TableResolver::validate(
        &effective_season_id,
        &effective_market_mode,
    ) {
        return Err(e.to_string());
    }

    tracing::info!(
        "[calculate_arbitrage] season_id={:?}, market_mode={:?}, effective={}/{}",
        season_id,
        market_mode,
        effective_season_id,
        effective_market_mode
    );

    let mut results = repo_arbitrage::calculate_arbitrage_for_all_recipes(
        &state.db,
        &effective_season_id,
        effective_market_mode.as_str(),
    )
    .await
    .map_err(|e| e.to_string())?;

    let show_all = show_all.unwrap_or(false);
    if !show_all {
        results.retain(|r| r.is_profitable);
    }

    let total_profitable = results.iter().filter(|r| r.is_profitable).count() as i32;
    let total_loss = results.iter().filter(|r| !r.is_profitable).count() as i32;

    Ok(ArbitrageResponse {
        recipes: results,
        calculated_at: chrono::Utc::now().timestamp(),
        total_profitable,
        total_loss,
    })
}

#[tauri::command]
pub async fn search_items_for_arbitrage(
    state: State<'_, Arc<AppState>>,
    keyword: String,
) -> Result<Vec<ItemSearchResult>, String> {
    let ctx = state.active_context.read().clone();
    repo_items::search_items_simple(
        &state.db,
        &ctx.season_id,
        ctx.market_mode.as_str(),
        &keyword,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_arbitrage_item_price(
    state: State<'_, Arc<AppState>>,
    item_id: String,
) -> Result<Option<f64>, String> {
    let ctx = state.active_context.read().clone();
    let items_table = crate::db::table_resolver::TableResolver::items_table(
        &ctx.season_id,
        ctx.market_mode.as_str(),
    );

    let result: Option<(f64,)> = sqlx::query_as(&format!(
        "SELECT price FROM {} WHERE item_id = ? LIMIT 1",
        items_table
    ))
    .bind(&item_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.map(|(price,)| price))
}

#[tauri::command]
pub async fn toggle_arbitrage_recipe_enabled(
    state: State<'_, Arc<AppState>>,
    recipe_id: String,
    enabled: bool,
) -> Result<OkResponse, String> {
    repo_arbitrage::update_recipe(&state.db, &recipe_id, None, None, Some(enabled))
        .await
        .map_err(|e| e.to_string())?;

    Ok(OkResponse::success(if enabled {
        "Recipe enabled"
    } else {
        "Recipe disabled"
    }))
}

#[tauri::command]
pub async fn export_arbitrage_recipes_csv(
    state: State<'_, Arc<AppState>>,
    _season_id: String,
    _market_mode: String,
) -> Result<String, String> {
    let recipes = repo_arbitrage::get_all_recipes(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record(["name", "recipe_type", "season_id", "market_mode", "enabled"])
        .map_err(|e| e.to_string())?;

    for recipe in recipes {
        wtr.write_record([
            recipe.name.as_str(),
            recipe.recipe_type.as_str(),
            recipe.season_id.as_str(),
            recipe.market_mode.as_str(),
            if recipe.enabled != 0 { "1" } else { "0" },
        ])
        .map_err(|e| e.to_string())?;
    }

    let data = wtr.into_inner().map_err(|e| e.to_string())?;
    String::from_utf8(data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_arbitrage_recipes_csv(
    state: State<'_, Arc<AppState>>,
    content: String,
) -> Result<ImportResp, String> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(content.as_bytes());

    let mut imported_count = 0;
    let mut error_list = Vec::new();

    for (idx, result) in reader.records().enumerate() {
        if let Ok(record) = result {
            if record.len() >= 4 {
                let name = record.get(0).unwrap_or("").to_string();
                let recipe_type = record.get(1).unwrap_or("normal").to_string();
                let _season_id = record.get(2).unwrap_or("").to_string();
                let _market_mode = record.get(3).unwrap_or("season_normal").to_string();
                let enabled = record.get(4).and_then(|s| s.parse().ok()).unwrap_or(true);

                if name.is_empty() {
                    error_list.push(format!("行 {}: 配方名称不能为空", idx + 2));
                    continue;
                }

                match repo_arbitrage::create_recipe(&state.db, &name, &recipe_type, enabled, &[], &[]).await {
                    Ok(_) => imported_count += 1,
                    Err(e) => error_list.push(format!("行 {}: {}", idx + 2, e)),
                }
            } else {
                error_list.push(format!("行 {}: 列数不足", idx + 2));
            }
        } else {
            error_list.push(format!("行 {}: CSV 记录格式错误", idx + 2));
        }
    }

    Ok(ImportResp {
        imported: imported_count,
        errors: error_list,
    })
}
