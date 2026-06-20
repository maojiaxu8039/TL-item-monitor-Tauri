use crate::commands::types::OkResponse;
use crate::core::state::AppState;
use crate::db::repo_inventory;
use crate::db::repo_inventory::{
    InventoryBuyWatch, InventoryBuyWatchView, InventoryPosition, InventoryPositionView,
    InventorySummary,
};
use serde::Deserialize;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreatePositionRequest {
    pub season_id: String,
    pub market_mode: String,
    pub item_id: String,
    pub item_name: String,
    pub item_type: Option<String>,
    pub buy_price: f64,
    pub quantity: i64,
    pub extra_cost: Option<f64>,
    pub fee_rate: Option<f64>,
    pub target_sell_price: Option<f64>,
    pub bought_at: Option<i64>,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePositionRequest {
    pub id: String,
    pub item_name: Option<String>,
    pub item_type: Option<String>,
    pub buy_price: Option<f64>,
    pub quantity: Option<i64>,
    pub extra_cost: Option<f64>,
    pub fee_rate: Option<f64>,
    pub target_sell_price: Option<f64>,
    pub bought_at: Option<i64>,
    pub note: Option<String>,
    pub alert_enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBuyWatchRequest {
    pub season_id: String,
    pub market_mode: String,
    pub item_id: String,
    pub item_name: String,
    pub item_type: Option<String>,
    pub target_buy_price: f64,
    pub max_quantity: Option<i64>,
    pub note: Option<String>,
    pub auto_create_position: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBuyWatchRequest {
    pub id: String,
    pub item_name: Option<String>,
    pub item_type: Option<String>,
    pub target_buy_price: Option<f64>,
    pub max_quantity: Option<i64>,
    pub note: Option<String>,
    pub alert_enabled: Option<bool>,
    pub auto_create_position: Option<bool>,
}

fn ensure_positive_price(label: &str, value: f64) -> Result<(), String> {
    if !value.is_finite() || value <= 0.0 {
        return Err(format!("{}必须是大于 0 的有效价格", label));
    }
    Ok(())
}

fn ensure_non_negative_amount(label: &str, value: f64) -> Result<(), String> {
    if !value.is_finite() || value < 0.0 {
        return Err(format!("{}不能为负数", label));
    }
    Ok(())
}

fn ensure_positive_quantity(label: &str, value: i64) -> Result<(), String> {
    if value <= 0 {
        return Err(format!("{}必须大于 0", label));
    }
    Ok(())
}

fn ensure_fee_rate(value: f64) -> Result<(), String> {
    if !value.is_finite() || !(0.0..1.0).contains(&value) {
        return Err("手续费比例必须在 0 到 1 之间".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn list_inventory_positions(
    state: State<'_, Arc<AppState>>,
    season_id: String,
    market_mode: String,
) -> Result<Vec<InventoryPositionView>, String> {
    repo_inventory::list_positions_with_current_price(&state.db, &season_id, &market_mode)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_inventory_position(
    state: State<'_, Arc<AppState>>,
    request: CreatePositionRequest,
) -> Result<OkResponse, String> {
    ensure_positive_price("买入价格", request.buy_price)?;
    ensure_positive_quantity("数量", request.quantity)?;
    ensure_non_negative_amount("额外成本", request.extra_cost.unwrap_or(0.0))?;
    ensure_fee_rate(request.fee_rate.unwrap_or(0.125))?;
    if let Some(target_sell_price) = request.target_sell_price {
        ensure_positive_price("目标出货价", target_sell_price)?;
    }

    let position = InventoryPosition {
        id: Uuid::new_v4().to_string(),
        season_id: request.season_id,
        market_mode: request.market_mode,
        item_id: request.item_id,
        item_name: request.item_name,
        item_type: request.item_type.unwrap_or_default(),
        buy_price: request.buy_price,
        quantity: request.quantity,
        extra_cost: request.extra_cost.unwrap_or(0.0),
        fee_rate: request.fee_rate.unwrap_or(0.125),
        target_sell_price: request.target_sell_price,
        bought_at: request
            .bought_at
            .unwrap_or_else(|| chrono::Utc::now().timestamp()),
        status: "holding".to_string(),
        sold_price: None,
        sold_at: None,
        note: request.note.unwrap_or_default(),
        alert_enabled: true,
        last_alert_at: None,
        created_at: chrono::Utc::now().timestamp(),
        updated_at: chrono::Utc::now().timestamp(),
    };

    repo_inventory::create_position(&state.db, &position)
        .await
        .map_err(|e| e.to_string())?;

    tracing::info!(
        "[INVENTORY] Created position: {} x{} @ {}",
        position.item_name,
        position.quantity,
        position.buy_price
    );

    Ok(OkResponse::success(&format!(
        "已添加 {} 的持仓记录",
        position.item_name
    )))
}

#[tauri::command]
pub async fn update_inventory_position(
    state: State<'_, Arc<AppState>>,
    request: UpdatePositionRequest,
) -> Result<OkResponse, String> {
    let existing = repo_inventory::get_position_by_id(&state.db, &request.id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "持仓记录不存在".to_string())?;

    if let Some(buy_price) = request.buy_price {
        ensure_positive_price("买入价格", buy_price)?;
    }
    if let Some(quantity) = request.quantity {
        ensure_positive_quantity("数量", quantity)?;
    }
    if let Some(extra_cost) = request.extra_cost {
        ensure_non_negative_amount("额外成本", extra_cost)?;
    }
    if let Some(fee_rate) = request.fee_rate {
        ensure_fee_rate(fee_rate)?;
    }
    if let Some(target_sell_price) = request.target_sell_price {
        ensure_positive_price("目标出货价", target_sell_price)?;
    }

    let updated = InventoryPosition {
        id: existing.id,
        season_id: existing.season_id,
        market_mode: existing.market_mode,
        item_id: existing.item_id,
        item_name: request.item_name.unwrap_or(existing.item_name),
        item_type: request.item_type.unwrap_or(existing.item_type),
        buy_price: request.buy_price.unwrap_or(existing.buy_price),
        quantity: request.quantity.unwrap_or(existing.quantity),
        extra_cost: request.extra_cost.unwrap_or(existing.extra_cost),
        fee_rate: request.fee_rate.unwrap_or(existing.fee_rate),
        target_sell_price: request.target_sell_price.or(existing.target_sell_price),
        bought_at: request.bought_at.unwrap_or(existing.bought_at),
        status: existing.status,
        sold_price: existing.sold_price,
        sold_at: existing.sold_at,
        note: request.note.unwrap_or(existing.note),
        alert_enabled: request.alert_enabled.unwrap_or(existing.alert_enabled),
        last_alert_at: existing.last_alert_at,
        created_at: existing.created_at,
        updated_at: chrono::Utc::now().timestamp(),
    };

    repo_inventory::update_position(&state.db, &updated)
        .await
        .map_err(|e| e.to_string())?;

    tracing::info!("[INVENTORY] Updated position: {}", updated.item_name);

    Ok(OkResponse::success("持仓记录已更新"))
}

#[tauri::command]
pub async fn delete_inventory_position(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<OkResponse, String> {
    repo_inventory::delete_position(&state.db, &id)
        .await
        .map_err(|e| e.to_string())?;

    tracing::info!("[INVENTORY] Deleted position: {}", id);

    Ok(OkResponse::success("持仓记录已删除"))
}

#[tauri::command]
pub async fn mark_inventory_sold(
    state: State<'_, Arc<AppState>>,
    id: String,
    sold_price: f64,
) -> Result<OkResponse, String> {
    ensure_positive_price("出货价格", sold_price)?;

    repo_inventory::mark_position_sold(&state.db, &id, sold_price)
        .await
        .map_err(|e| e.to_string())?;

    tracing::info!("[INVENTORY] Marked sold: {} @ {}", id, sold_price);

    Ok(OkResponse::success("已标记为已出货"))
}

#[tauri::command]
pub async fn mark_inventory_ignored(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<OkResponse, String> {
    repo_inventory::mark_position_ignored(&state.db, &id)
        .await
        .map_err(|e| e.to_string())?;

    tracing::info!("[INVENTORY] Marked ignored: {}", id);

    Ok(OkResponse::success("已标记为已忽略"))
}

#[tauri::command]
pub async fn get_inventory_summary(
    state: State<'_, Arc<AppState>>,
    season_id: String,
    market_mode: String,
) -> Result<InventorySummary, String> {
    repo_inventory::get_summary(&state.db, &season_id, &market_mode)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sell_ready_positions(
    state: State<'_, Arc<AppState>>,
    season_id: String,
    market_mode: String,
) -> Result<Vec<InventoryPositionView>, String> {
    repo_inventory::get_sell_ready_positions(&state.db, &season_id, &market_mode)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_inventory_buy_watches(
    state: State<'_, Arc<AppState>>,
    season_id: String,
    market_mode: String,
) -> Result<Vec<InventoryBuyWatchView>, String> {
    repo_inventory::list_buy_watches_with_current_price(&state.db, &season_id, &market_mode)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_inventory_buy_watch(
    state: State<'_, Arc<AppState>>,
    request: CreateBuyWatchRequest,
) -> Result<OkResponse, String> {
    ensure_positive_price("目标买入价", request.target_buy_price)?;
    if let Some(max_quantity) = request.max_quantity {
        ensure_positive_quantity("最大数量", max_quantity)?;
    }

    let watch = InventoryBuyWatch {
        id: Uuid::new_v4().to_string(),
        season_id: request.season_id,
        market_mode: request.market_mode,
        item_id: request.item_id,
        item_name: request.item_name,
        item_type: request.item_type.unwrap_or_default(),
        target_buy_price: request.target_buy_price,
        max_quantity: request.max_quantity,
        note: request.note.unwrap_or_default(),
        alert_enabled: true,
        auto_create_position: request.auto_create_position.unwrap_or(false),
        last_alert_at: None,
        created_at: chrono::Utc::now().timestamp(),
        updated_at: chrono::Utc::now().timestamp(),
    };

    repo_inventory::create_buy_watch(&state.db, &watch)
        .await
        .map_err(|e| e.to_string())?;

    tracing::info!(
        "[INVENTORY] Created buy watch: {} @ {}",
        watch.item_name,
        watch.target_buy_price
    );

    Ok(OkResponse::success(&format!(
        "已添加 {} 的买入监控（目标价 {}）",
        watch.item_name, watch.target_buy_price
    )))
}

#[tauri::command]
pub async fn update_inventory_buy_watch(
    state: State<'_, Arc<AppState>>,
    request: UpdateBuyWatchRequest,
) -> Result<OkResponse, String> {
    let existing = repo_inventory::get_buy_watch_by_id(&state.db, &request.id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "买入监控不存在".to_string())?;

    if let Some(target_buy_price) = request.target_buy_price {
        ensure_positive_price("目标买入价", target_buy_price)?;
    }
    if let Some(max_quantity) = request.max_quantity {
        ensure_positive_quantity("最大数量", max_quantity)?;
    }

    let updated = InventoryBuyWatch {
        id: existing.id,
        season_id: existing.season_id,
        market_mode: existing.market_mode,
        item_id: existing.item_id,
        item_name: request.item_name.unwrap_or(existing.item_name),
        item_type: request.item_type.unwrap_or(existing.item_type),
        target_buy_price: request
            .target_buy_price
            .unwrap_or(existing.target_buy_price),
        max_quantity: request.max_quantity.or(existing.max_quantity),
        note: request.note.unwrap_or(existing.note),
        alert_enabled: request.alert_enabled.unwrap_or(existing.alert_enabled),
        auto_create_position: request
            .auto_create_position
            .unwrap_or(existing.auto_create_position),
        last_alert_at: existing.last_alert_at,
        created_at: existing.created_at,
        updated_at: chrono::Utc::now().timestamp(),
    };

    repo_inventory::update_buy_watch(&state.db, &updated)
        .await
        .map_err(|e| e.to_string())?;

    tracing::info!("[INVENTORY] Updated buy watch: {}", updated.item_name);

    Ok(OkResponse::success("买入监控已更新"))
}

#[tauri::command]
pub async fn delete_inventory_buy_watch(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<OkResponse, String> {
    repo_inventory::delete_buy_watch(&state.db, &id)
        .await
        .map_err(|e| e.to_string())?;

    tracing::info!("[INVENTORY] Deleted buy watch: {}", id);

    Ok(OkResponse::success("买入监控已删除"))
}

#[tauri::command]
pub async fn get_buy_ready_watches(
    state: State<'_, Arc<AppState>>,
    season_id: String,
    market_mode: String,
) -> Result<Vec<InventoryBuyWatchView>, String> {
    repo_inventory::get_buy_ready_watches(&state.db, &season_id, &market_mode)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        ensure_fee_rate, ensure_non_negative_amount, ensure_positive_price,
        ensure_positive_quantity,
    };

    #[test]
    fn inventory_price_validation_rejects_invalid_values() {
        assert!(ensure_positive_price("买入价格", 1.0).is_ok());
        assert!(ensure_positive_price("买入价格", 0.0).is_err());
        assert!(ensure_positive_price("买入价格", -1.0).is_err());
        assert!(ensure_positive_price("买入价格", f64::NAN).is_err());
    }

    #[test]
    fn inventory_quantity_validation_requires_positive_values() {
        assert!(ensure_positive_quantity("数量", 1).is_ok());
        assert!(ensure_positive_quantity("数量", 0).is_err());
        assert!(ensure_positive_quantity("数量", -1).is_err());
    }

    #[test]
    fn inventory_fee_rate_validation_requires_fraction() {
        assert!(ensure_fee_rate(0.125).is_ok());
        assert!(ensure_fee_rate(0.0).is_ok());
        assert!(ensure_fee_rate(-0.01).is_err());
        assert!(ensure_fee_rate(1.0).is_err());
        assert!(ensure_fee_rate(f64::INFINITY).is_err());
    }

    #[test]
    fn inventory_extra_cost_allows_zero_but_not_negative() {
        assert!(ensure_non_negative_amount("额外成本", 0.0).is_ok());
        assert!(ensure_non_negative_amount("额外成本", 1.0).is_ok());
        assert!(ensure_non_negative_amount("额外成本", -0.01).is_err());
    }
}
