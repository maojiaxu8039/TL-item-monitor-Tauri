use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{error, info, warn};

use crate::core::state::{AppState, NotificationSettings};
use crate::db::models::SectionItem;
use crate::db::repo_alerts;
use crate::db::repo_items;
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
    info!("Price alert task started - checking for worth items and custom alert rules");

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
                check_custom_alert_rules(&app, &state).await;
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

    let all_section_items: Vec<SectionItem> =
        match crate::db::repo_sections::get_section_items(&state.db, &ctx.season_id).await {
            Ok(items) => items,
            Err(e) => {
                error!("Failed to get section items: {}", e);
                return;
            }
        };

    let worth_items: Vec<WorthItem> = all_section_items
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

    if let Err(e) = send_notification(app, "🔥 发现值得购买的物品！", &message) {
        warn!("Failed to send notification: {}", e);
    }
}

async fn check_custom_alert_rules(app: &tauri::AppHandle, state: &Arc<AppState>) {
    let ctx = state.active_context.read().clone();
    let season_id = ctx.season_id.clone();

    let rules = match repo_alerts::get_alert_rules(&state.db).await {
        Ok(rules) => rules,
        Err(e) => {
            error!("Failed to get alert rules: {}", e);
            return;
        }
    };

    let enabled_rules: Vec<_> = rules.into_iter().filter(|r| r.enabled == 1).collect();

    if enabled_rules.is_empty() {
        return;
    }

    let now = chrono::Utc::now().timestamp();

    for rule in enabled_rules {
        if let Some(last_triggered) = rule.last_triggered_at {
            if now - last_triggered < rule.cooldown_seconds as i64 {
                continue;
            }
        }

        let triggered = evaluate_rule(&state.db, &season_id, &rule).await;

        if triggered {
            let message = format_rule_notification(&rule);
            if let Err(e) = send_notification(app, "⚠️ 预警规则触发", &message) {
                warn!("Failed to send notification: {}", e);
            }

            if let Err(e) = repo_alerts::update_rule_last_triggered(&state.db, &rule.id, now).await {
                error!("Failed to update rule last_triggered_at: {}", e);
            }

            if let Err(e) = repo_alerts::create_alert_event(&state.db, &rule.id, rule.item_id.as_deref(), &message).await {
                error!("Failed to create alert event: {}", e);
            }

            if let Err(e) = emit_alert_triggered(app, &rule, &message) {
                warn!("Failed to emit alert triggered event: {}", e);
            }
        }
    }
}

async fn evaluate_rule(db: &sqlx::SqlitePool, season_id: &str, rule: &crate::db::models::AlertRule) -> bool {
    match rule.rule_type.as_str() {
        "price_below" | "price_above" => {
            if let Some(item_id) = &rule.item_id {
                evaluate_item_rule(db, season_id, &rule.rule_type, item_id, rule.threshold).await
            } else {
                false
            }
        }
        "profit_ratio_above" => {
            false
        }
        "price_drop_percent" => false,
        _ => {
            warn!("Unknown rule type: {}", rule.rule_type);
            false
        }
    }
}

async fn evaluate_item_rule(
    db: &sqlx::SqlitePool,
    season_id: &str,
    rule_type: &str,
    item_id: &str,
    threshold: f64,
) -> bool {
    let market_mode = "season_normal";

    let latest_price = match repo_items::get_all_items(db, season_id, market_mode).await {
        Ok(items) => {
            items.into_iter()
                .find(|i| i.item_id == item_id)
                .map(|i| i.price)
        }
        Err(e) => {
            warn!("Failed to get items: {}", e);
            None
        }
    };

    let latest_price = match latest_price {
        Some(p) => p,
        None => {
            info!("No price data for item {}", item_id);
            return false;
        }
    };

    match rule_type {
        "price_below" => latest_price < threshold,
        "price_above" => latest_price > threshold,
        _ => false,
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

fn format_rule_notification(rule: &crate::db::models::AlertRule) -> String {
    let rule_type_label = match rule.rule_type.as_str() {
        "price_below" => "价格低于",
        "price_above" => "价格高于",
        "profit_ratio_above" => "收益率高于",
        "price_drop_percent" => "价格跌幅超过",
        _ => &rule.rule_type,
    };

    if let Some(item_id) = &rule.item_id {
        format!(
            "{} {} {}火",
            item_id,
            rule_type_label,
            rule.threshold
        )
    } else if let Some(strategy_id) = &rule.strategy_id {
        format!(
            "策略 {} {} {}",
            strategy_id,
            rule_type_label,
            rule.threshold
        )
    } else {
        format!("{} {} (阈值: {})", rule.id, rule_type_label, rule.threshold)
    }
}

fn emit_alert_triggered(
    app: &tauri::AppHandle,
    rule: &crate::db::models::AlertRule,
    message: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::Emitter;
    let payload = serde_json::json!({
        "rule_id": rule.id,
        "rule_type": rule.rule_type,
        "threshold": rule.threshold,
        "message": message,
        "triggered_at": chrono::Utc::now().timestamp(),
    });
    app.emit("alert-triggered", payload)?;
    Ok(())
}
