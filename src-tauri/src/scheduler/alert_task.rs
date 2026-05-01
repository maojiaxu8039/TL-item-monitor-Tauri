use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{error, info, warn};

use crate::core::state::{AppState, NotificationSettings};
use crate::db::models::{AlertRule, Item};
use crate::db::repo_alerts;
use crate::db::repo_items;
use crate::services::send_notification;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum AlertRuleType {
    BelowThreshold,
    AboveThreshold,
    PriceDropPercent,
    PriceRisePercent,
}

impl AlertRuleType {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "below_threshold" => Some(Self::BelowThreshold),
            "above_threshold" => Some(Self::AboveThreshold),
            "price_drop_percent" => Some(Self::PriceDropPercent),
            "price_rise_percent" => Some(Self::PriceRisePercent),
            _ => None,
        }
    }
}

fn check_rule(
    rule: &AlertRule,
    current_price: f64,
    previous_price: Option<f64>,
) -> Option<String> {
    let rule_type = AlertRuleType::from_str(&rule.rule_type)?;

    match rule_type {
        AlertRuleType::BelowThreshold => {
            if current_price < rule.threshold {
                Some(format!(
                    "🔥 {} 价格跌破 {:.1}火 (当前: {:.1}火)",
                    rule.item_id.as_deref().unwrap_or("物品"),
                    rule.threshold,
                    current_price
                ))
            } else {
                None
            }
        }
        AlertRuleType::AboveThreshold => {
            if current_price > rule.threshold {
                Some(format!(
                    "📈 {} 价格突破 {:.1}火 (当前: {:.1}火)",
                    rule.item_id.as_deref().unwrap_or("物品"),
                    rule.threshold,
                    current_price
                ))
            } else {
                None
            }
        }
        AlertRuleType::PriceDropPercent => {
            if let Some(prev) = previous_price {
                if prev > 0.0 {
                    let drop_percent = ((prev - current_price) / prev) * 100.0;
                    if drop_percent > rule.threshold {
                        Some(format!(
                            "⬇️ {} 价格下跌 {:.1}% (从 {:.1}火 降至 {:.1}火)",
                            rule.item_id.as_deref().unwrap_or("物品"),
                            drop_percent,
                            prev,
                            current_price
                        ))
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            }
        }
        AlertRuleType::PriceRisePercent => {
            if let Some(prev) = previous_price {
                if prev > 0.0 {
                    let rise_percent = ((current_price - prev) / prev) * 100.0;
                    if rise_percent > rule.threshold {
                        Some(format!(
                            "⬆️ {} 价格上涨 {:.1}% (从 {:.1}火 升至 {:.1}火)",
                            rule.item_id.as_deref().unwrap_or("物品"),
                            rise_percent,
                            prev,
                            current_price
                        ))
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            }
        }
    }
}

pub async fn run_price_alert_task(
    app: tauri::AppHandle,
    state: Arc<AppState>,
    mut abort: broadcast::Receiver<()>,
) {
    info!("Price alert task started");
    
    loop {
        tokio::select! {
            _ = abort.recv() => {
                info!("Price alert task received abort");
                break;
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(60)) => {
                check_and_send_alerts(&app, &state).await;
            }
        }
    }
}

async fn check_and_send_alerts(app: &tauri::AppHandle, state: &Arc<AppState>) {
    let notification_config: NotificationSettings = {
        let config = state.config.read();
        config.notification.clone()
    };

    if !notification_config.price_alert_enabled {
        return;
    }

    let ctx = state.active_context.read().clone();
    let now = chrono::Utc::now().timestamp();

    let rules = match repo_alerts::get_alert_rules(&state.db).await {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to get alert rules: {}", e);
            return;
        }
    };

    let enabled_rules: Vec<&AlertRule> = rules
        .iter()
        .filter(|r| r.enabled == 1)
        .collect();

    if enabled_rules.is_empty() {
        return;
    }

    let all_items = repo_items::get_items_by_season(&state.db, &ctx.season_id, ctx.market_mode.as_str())
        .await
        .unwrap_or_default();

    let items_map: std::collections::HashMap<String, &Item> = all_items
        .iter()
        .map(|i| (i.item_id.clone(), i))
        .collect();

    let cooldown_seconds = notification_config.price_alert_cooldown_seconds;

    for rule in enabled_rules {
        let item_id = match &rule.item_id {
            Some(id) => id,
            None => continue,
        };

        let item = match items_map.get(item_id) {
            Some(i) => *i,
            None => continue,
        };

        if let Some(last_triggered) = rule.last_triggered_at {
            let elapsed = now - last_triggered;
            if elapsed < cooldown_seconds as i64 {
                continue;
            }
        }

        let previous_price = repo_items::get_item_previous_price(
            &state.db,
            item_id,
            &ctx.season_id,
            ctx.market_mode.as_str(),
            24 * 3600,
        )
        .await
        .ok()
        .flatten();

        if let Some(message) = check_rule(rule, item.price, previous_price) {
            info!("Triggering alert for item {}: {}", item_id, message);

            if let Err(e) = send_notification(app, "🔔 价格预警", &message) {
                warn!("Failed to send notification: {}", e);
            }

            if let Err(e) = repo_alerts::update_rule_last_triggered(
                &state.db,
                &rule.id,
                now,
            )
            .await
            {
                warn!("Failed to update rule last_triggered_at: {}", e);
            }
        }
    }
}