use crate::commands::types::{OkResponse, SectionItemPatch};
use crate::core::state::AppState;
use crate::db::repo_sections;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_sections(state: State<'_, Arc<AppState>>) -> Result<Vec<crate::db::models::Section>, String> {
    repo_sections::get_sections(&state.db).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_section(state: State<'_, Arc<AppState>>, name: String) -> Result<crate::db::models::Section, String> {
    repo_sections::create_section(&state.db, &name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_section(state: State<'_, Arc<AppState>>, id: String, name: String) -> Result<OkResponse, String> {
    repo_sections::update_section(&state.db, &id, &name).await?;
    Ok(OkResponse::success("Section updated"))
}

#[tauri::command]
pub async fn delete_section(state: State<'_, Arc<AppState>>, id: String) -> Result<OkResponse, String> {
    repo_sections::delete_section(&state.db, &id).await?;
    Ok(OkResponse::success("Section deleted"))
}

#[tauri::command]
pub async fn reorder_sections(state: State<'_, Arc<AppState>>, ids: Vec<String>) -> Result<OkResponse, String> {
    repo_sections::reorder_sections(&state.db, &ids).await?;
    Ok(OkResponse::success("Sections reordered"))
}

#[tauri::command]
pub async fn get_section_items(state: State<'_, Arc<AppState>>, sectionId: String) -> Result<Vec<crate::db::models::SectionItem>, String> {
    repo_sections::get_section_items(&state.db, &sectionId).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn add_section_item(
    state: State<'_, Arc<AppState>>,
    sectionId: String,
    seasonId: String,
    marketMode: String,
    itemId: String,
    purchaseFirePrice: f64,
    count: i32,
    moreValue: f64,
) -> Result<crate::db::models::SectionItem, String> {
    repo_sections::add_section_item(&state.db, &sectionId, &seasonId, &marketMode, &itemId, purchaseFirePrice, count, moreValue).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn update_section_item(
    state: State<'_, Arc<AppState>>,
    sectionId: String,
    itemId: String,
    patch: SectionItemPatch,
) -> Result<OkResponse, String> {
    repo_sections::update_section_item(
        &state.db,
        &sectionId,
        &itemId,
        patch.count,
        patch.more_value,
        patch.purchase_fire_price,
        patch.last_time.as_deref(),
    ).await?;
    Ok(OkResponse::success("Item updated"))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn remove_section_item(
    state: State<'_, Arc<AppState>>,
    sectionId: String,
    itemId: String,
) -> Result<OkResponse, String> {
    repo_sections::remove_section_item(&state.db, &sectionId, &itemId).await?;
    Ok(OkResponse::success("Item removed"))
}
