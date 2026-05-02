use crate::core::state::AppState;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DealAlert {
    pub item_id: String,
    pub item_name: String,
    pub item_type: Option<String>,
    pub previous_price: f64,
    pub current_price: f64,
    pub change_percent: f64,
    pub change_amount: f64,
    pub direction: String,
    pub detected_at: i64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DealAlertsResponse {
    pub bargains: Vec<DealAlert>,
    pub sells: Vec<DealAlert>,
}

#[tauri::command]
pub async fn get_deal_alerts(state: State<'_, Arc<AppState>>) -> Result<DealAlertsResponse, String> {
    let ctx = state.active_context.read().clone();
    let season_id = ctx.season_id;
    let market_mode = ctx.market_mode.as_str().to_string();
    
    // Calculate alerts based on real price snapshots
    match calculate_real_alerts(&state.db, &season_id, &market_mode).await {
        Ok(alerts) => Ok(alerts),
        Err(e) => {
            tracing::warn!("Failed to calculate real deal alerts: {}, falling back to empty", e);
            Ok(DealAlertsResponse {
                bargains: vec![],
                sells: vec![],
            })
        }
    }
}

async fn calculate_real_alerts(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<DealAlertsResponse, crate::core::errors::AppError> {
    let now = chrono::Utc::now().timestamp();
    let window_seconds = 24 * 3600; // 24h window for comparison
    let cutoff = now - window_seconds;
    
    // Get current items with their latest prices
    let current_items: Vec<(String, String, String, f64)> = sqlx::query_as(
        "SELECT item_id, name, item_type, price FROM items WHERE season_id = ? AND market_mode = ?"
    )
    .bind(season_id)
    .bind(market_mode)
    .fetch_all(pool)
    .await?;
    
    if current_items.is_empty() {
        return Ok(DealAlertsResponse {
            bargains: vec![],
            sells: vec![],
        });
    }
    
    // Get previous snapshot prices (closest to 24h ago)
    let previous_snapshots: Vec<(String, f64)> = sqlx::query_as(
        "SELECT item_id, fire_price FROM item_price_snapshots s1 \
         WHERE season_id = ? AND market_mode = ? AND scraped_at >= ? \
         AND scraped_at = (SELECT MAX(scraped_at) FROM item_price_snapshots s2 \
                           WHERE s2.item_id = s1.item_id AND s2.season_id = s1.season_id \
                           AND s2.market_mode = s1.market_mode AND s2.scraped_at >= ?)"
    )
    .bind(season_id)
    .bind(market_mode)
    .bind(cutoff)
    .bind(cutoff)
    .fetch_all(pool)
    .await?;
    
    let prev_map: std::collections::HashMap<String, f64> = previous_snapshots.into_iter().collect();
    
    // Also get 1h ago snapshots for short-term changes
    let hour_ago = now - 3600;
    let recent_snapshots: Vec<(String, f64)> = sqlx::query_as(
        "SELECT item_id, fire_price FROM item_price_snapshots s1 \
         WHERE season_id = ? AND market_mode = ? AND scraped_at >= ? \
         AND scraped_at = (SELECT MAX(scraped_at) FROM item_price_snapshots s2 \
                           WHERE s2.item_id = s1.item_id AND s2.season_id = s1.season_id \
                           AND s2.market_mode = s1.market_mode AND s2.scraped_at >= ?)"
    )
    .bind(season_id)
    .bind(market_mode)
    .bind(hour_ago)
    .bind(hour_ago)
    .fetch_all(pool)
    .await?;
    
    let recent_map: std::collections::HashMap<String, f64> = recent_snapshots.into_iter().collect();
    
    let mut bargains = Vec::new();
    let mut sells = Vec::new();
    
    for (item_id, name, item_type, current_price) in current_items {
        if current_price <= 0.0 {
            continue;
        }
        
        // Try 1h comparison first, fallback to 24h
        let (baseline_price, _window_desc, sample_count) = if let Some(recent) = recent_map.get(&item_id) {
            (*recent, "1h", 1)
        } else if let Some(prev) = prev_map.get(&item_id) {
            (*prev, "24h", 1)
        } else {
            // No baseline - skip this item
            continue;
        };
        
        if baseline_price <= 0.0 {
            continue;
        }
        
        let change_amount = current_price - baseline_price;
        let change_percent = (change_amount / baseline_price) * 100.0;
        
        // Skip if change is too small
        if change_percent.abs() < 5.0 {
            continue;
        }
        
        // Calculate confidence based on sample size and price stability
        let confidence = if sample_count >= 3 {
            85.0
        } else if sample_count >= 1 {
            70.0
        } else {
            50.0
        };
        
        let alert = DealAlert {
            item_id: item_id.clone(),
            item_name: name,
            item_type: if item_type.is_empty() { None } else { Some(item_type) },
            previous_price: baseline_price,
            current_price,
            change_percent: change_percent.round(),
            change_amount: (change_amount * 100.0).round() / 100.0,
            direction: if change_percent < 0.0 { "down".to_string() } else { "up".to_string() },
            detected_at: now,
            confidence,
        };
        
        if change_percent < -10.0 {
            bargains.push(alert);
        } else if change_percent > 15.0 {
            sells.push(alert);
        }
    }
    
    // Sort by change magnitude
    bargains.sort_by(|a, b| a.change_percent.partial_cmp(&b.change_percent).unwrap_or(std::cmp::Ordering::Equal));
    sells.sort_by(|a, b| b.change_percent.partial_cmp(&a.change_percent).unwrap_or(std::cmp::Ordering::Equal));
    
    // Limit to top 20 each
    bargains.truncate(20);
    sells.truncate(20);
    
    Ok(DealAlertsResponse { bargains, sells })
}
