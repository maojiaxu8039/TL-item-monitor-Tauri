use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{error, info, warn};

use crate::core::state::{AppState, NotificationSettings};
use crate::services::send_notification;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WorthItem {
    pub item_id: String,
    pub item_name: String,
    pub purchase_fire_price: f64,
    pub current_price: f64,
    pub count: i32,
}

pub async fn run_price_alert_task(
    app: tauri::AppHandle,
    state: Arc<AppState>,
    mut abort: broadcast::Receiver<()>,
) {
    info!("Price alert task started - checking for worth items");

    loop {
        tokio::select! {
            result = abort.recv() => {
                match result {
                    Ok(_) => {
                        info!("Price alert task received abort");
                        break;
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        info!("Price alert task abort channel closed, exiting");
                        break;
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        continue;
                    }
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(60)) => {
                check_worth_items(&app, &state).await;
            }
        }
    }
}

async fn check_worth_items(app: &tauri::AppHandle, state: &Arc<AppState>) {
    let notification_config: NotificationSettings = {
        let config = state.config.read();
        config.notification.clone()
    };

    if !notification_config.price_alert_enabled {
        return;
    }

    let ctx = state.active_context.read().clone();

    let all_section_items =
        crate::db::repo_sections::get_section_items(&state.db, &ctx.season_id).await;

    match all_section_items {
        Ok(items) => {
            let worth_items: Vec<WorthItem> = items
                .into_iter()
                .filter(|item| {
                    let purchase_price = item.purchase_fire_price;
                    let current_price = item.current_price.unwrap_or(0.0);

                    purchase_price > 0.0 && current_price > 0.0 && current_price < purchase_price
                })
                .map(|item| WorthItem {
                    item_id: item.item_id.clone(),
                    item_name: item.item_name.unwrap_or_else(|| item.item_id.clone()),
                    purchase_fire_price: item.purchase_fire_price,
                    current_price: item.current_price.unwrap_or(0.0),
                    count: item.count,
                })
                .collect();

            if worth_items.is_empty() {
                info!("No worth items found currently");
                return;
            }

            info!("Found {} worth items", worth_items.len());

            let message = format_worth_notification(&worth_items);

            if let Err(e) = send_notification(app, "🔥 发现值得购买的物品！", &message)
            {
                warn!("Failed to send notification: {}", e);
            }
        }
        Err(e) => {
            error!("Failed to get section items: {}", e);
        }
    }
}

fn format_worth_notification(items: &[WorthItem]) -> String {
    if items.len() == 1 {
        let item = &items[0];
        let savings = (item.purchase_fire_price - item.current_price) * item.count as f64;
        return format!(
            "{} 当前价格: {:.1}火\n购买价格: {:.1}火\n可节省约 {:.1}火",
            item.item_name, item.current_price, item.purchase_fire_price, savings
        );
    }

    let mut message = format!("共发现 {} 件值得购买的物品:\n\n", items.len());

    for (i, item) in items.iter().take(5).enumerate() {
        let savings = (item.purchase_fire_price - item.current_price) * item.count as f64;
        message.push_str(&format!(
            "{}. {} - 可节省 {:.1}火\n",
            i + 1,
            item.item_name,
            savings
        ));
    }

    if items.len() > 5 {
        message.push_str(&format!("\n...还有 {} 件", items.len() - 5));
    }

    message
}
