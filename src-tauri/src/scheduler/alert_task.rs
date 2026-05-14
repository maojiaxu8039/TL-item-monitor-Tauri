use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::broadcast;
use tracing::{error, info, warn};

use crate::core::paths::resolve_voice_alert_path;
use crate::core::state::{AppState, NotificationSettings};
use crate::db::{repo_alerts, repo_sections};
use crate::services::send_notification;

static WORTH_ALERT_LAST_TRIGGERED: OnceLock<Mutex<Option<i64>>> = OnceLock::new();

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WorthItem {
    pub section_item_id: String,
    pub section_id: String,
    pub section_name: String,
    pub item_id: String,
    pub item_name: String,
    pub purchase_fire_price: f64,
    pub current_price: f64,
    pub count: i32,
}

#[derive(Debug, Clone)]
struct RuleTarget {
    section_item_id: Option<String>,
    section_id: Option<String>,
    section_name: Option<String>,
    item_id: String,
    item_name: String,
    current_price: f64,
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

    let all_section_items = match repo_sections::get_section_items_for_context(
        &state.db,
        &ctx.season_id,
        ctx.market_mode.as_str(),
    )
    .await
    {
        Ok(items) => items,
        Err(e) => {
            error!("Failed to get section items for alert context: {}", e);
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
            section_item_id: item.id.clone(),
            section_id: item.section_id.clone(),
            section_name: item.section_name.clone(),
            item_id: item.item_id.clone(),
            item_name: item.item_name.clone(),
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

    let now = chrono::Utc::now().timestamp();
    if !should_send_worth_alert(now, notification_config.price_alert_cooldown_seconds) {
        info!(
            "Worth item alert suppressed by cooldown ({} seconds)",
            notification_config.price_alert_cooldown_seconds
        );
        return;
    }

    let message = format_worth_notification(&worth_items);

    if notification_config.system_notifications {
        if let Err(e) = send_notification(app, "🔥 发现值得购买的物品！", &message) {
            warn!("Failed to send notification: {}", e);
        }
    }

    if notification_config.voice_alert_enabled {
        play_configured_voice_alert(app, &notification_config, 1);
    }

    if let Some(item) = worth_items.first() {
        if let Err(e) = emit_alert_triggered(
            serde_json::json!({
                "alert_kind": "worth_item",
                "rule_id": null,
                "rule_type": "worth_item",
                "threshold": item.purchase_fire_price,
                "message": message,
                "section_item_id": item.section_item_id.as_str(),
                "section_id": item.section_id.as_str(),
                "section_name": item.section_name.as_str(),
                "item_id": item.item_id.as_str(),
                "triggered_at": now,
            }),
            app,
        ) {
            warn!("Failed to emit worth item alert event: {}", e);
        }
    }
}

async fn check_custom_alert_rules(app: &tauri::AppHandle, state: &Arc<AppState>) {
    let notification_config: NotificationSettings = {
        let config = state.config.read();
        config.notification.clone()
    };

    let ctx = state.active_context.read().clone();
    let season_id = ctx.season_id.clone();
    let market_mode_str = ctx.market_mode.as_str();

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

    let mut any_rule_triggered = false;

    for rule in &enabled_rules {
        if let Some(last_triggered) = rule.last_triggered_at {
            if now - last_triggered < rule.cooldown_seconds as i64 {
                continue;
            }
        }

        let triggered_targets = evaluate_rule(&state.db, &season_id, market_mode_str, rule).await;

        if !triggered_targets.is_empty() {
            any_rule_triggered = true;
            let message = format_rule_notification(rule, &triggered_targets);
            if notification_config.system_notifications {
                if let Err(e) = send_notification(app, "⚠️ 预警规则触发", &message) {
                    warn!("Failed to send notification: {}", e);
                }
            }

            if let Err(e) = repo_alerts::update_rule_last_triggered(&state.db, &rule.id, now).await
            {
                error!("Failed to update rule last_triggered_at: {}", e);
            }

            if let Err(e) = repo_alerts::create_alert_event(
                &state.db,
                &rule.id,
                triggered_targets
                    .first()
                    .and_then(|target| target.section_item_id.as_deref()),
                &message,
            )
            .await
            {
                error!("Failed to create alert event: {}", e);
            }

            let first_target = triggered_targets.first();
            if let Err(e) = emit_alert_triggered(
                serde_json::json!({
                    "alert_kind": "custom_rule",
                    "rule_id": rule.id.as_str(),
                    "rule_type": rule.rule_type.as_str(),
                    "threshold": rule.threshold,
                    "message": message,
                    "section_item_id": first_target.and_then(|target| target.section_item_id.as_deref()),
                    "section_id": first_target.and_then(|target| target.section_id.as_deref()).or(rule.section_id.as_deref()),
                    "section_name": first_target.and_then(|target| target.section_name.as_deref()),
                    "item_id": first_target.map(|target| target.item_id.as_str()).or(rule.item_id.as_deref()),
                    "triggered_at": chrono::Utc::now().timestamp(),
                }),
                app,
            ) {
                warn!("Failed to emit alert triggered event: {}", e);
            }
        }
    }

    if notification_config.voice_alert_enabled && any_rule_triggered {
        play_configured_voice_alert(app, &notification_config, 1);
    }
}

async fn evaluate_rule(
    db: &sqlx::SqlitePool,
    season_id: &str,
    market_mode: &str,
    rule: &crate::db::models::AlertRule,
) -> Vec<RuleTarget> {
    match rule.rule_type.as_str() {
        "price_below" | "price_above" => {
            let targets = find_rule_targets(db, season_id, market_mode, rule).await;
            targets
                .into_iter()
                .filter(|target| {
                    price_matches_rule(target.current_price, &rule.rule_type, rule.threshold)
                })
                .collect()
        }
        "profit_ratio_above" => Vec::new(),
        "price_drop_percent" => Vec::new(),
        _ => {
            warn!("Unknown rule type: {}", rule.rule_type);
            Vec::new()
        }
    }
}

async fn find_rule_targets(
    db: &sqlx::SqlitePool,
    season_id: &str,
    market_mode: &str,
    rule: &crate::db::models::AlertRule,
) -> Vec<RuleTarget> {
    if let Some(section_id) = rule.section_id.as_deref() {
        let item_filter = rule.item_id.as_deref();
        let section_items =
            match repo_sections::get_section_items_for_context(db, season_id, market_mode).await {
                Ok(items) => items,
                Err(e) => {
                    warn!("Failed to load section alert targets: {}", e);
                    return Vec::new();
                }
            };

        return section_items
            .into_iter()
            .filter(|item| item.section_id == section_id)
            .filter(|item| {
                item_filter
                    .map(|filter| item.item_id == filter || item.item_name == filter)
                    .unwrap_or(true)
            })
            .filter_map(|item| {
                item.current_price.map(|current_price| RuleTarget {
                    section_item_id: Some(item.id),
                    section_id: Some(item.section_id),
                    section_name: Some(item.section_name),
                    item_id: item.item_id,
                    item_name: item.item_name,
                    current_price,
                })
            })
            .collect();
    }

    let item_id = match rule.item_id.as_deref() {
        Some(item_id) => item_id,
        None => return Vec::new(),
    };

    let items_table = crate::db::table_resolver::TableResolver::items_table(season_id, market_mode);
    let latest_item: Option<(String, String, f64)> = match sqlx::query_as(&format!(
        "SELECT item_id, name, price FROM {} WHERE item_id = ? OR name = ? LIMIT 1",
        items_table
    ))
    .bind(item_id)
    .bind(item_id)
    .fetch_optional(db)
    .await
    {
        Ok(item) => item,
        Err(e) => {
            warn!("Failed to get item price: {}", e);
            None
        }
    };

    match latest_item {
        Some((item_id, item_name, current_price)) => vec![RuleTarget {
            section_item_id: None,
            section_id: None,
            section_name: None,
            item_id,
            item_name,
            current_price,
        }],
        None => {
            info!("No price data for item {}", item_id);
            Vec::new()
        }
    }
}

fn price_matches_rule(current_price: f64, rule_type: &str, threshold: f64) -> bool {
    match rule_type {
        "price_below" => current_price < threshold,
        "price_above" => current_price > threshold,
        _ => false,
    }
}

fn format_worth_notification(items: &[WorthItem]) -> String {
    if items.len() == 1 {
        let item = &items[0];
        let savings = (item.purchase_fire_price - item.current_price) * item.count as f64;
        return format!(
            "{} / {} 当前价格: {:.1}火\n购买价格: {:.1}火\n可节省约 {:.1}火",
            item.section_name,
            item.item_name,
            item.current_price,
            item.purchase_fire_price,
            savings
        );
    }

    let mut message = format!("共发现 {} 件值得购买的物品:\n\n", items.len());

    for (i, item) in items.iter().take(5).enumerate() {
        let savings = (item.purchase_fire_price - item.current_price) * item.count as f64;
        message.push_str(&format!(
            "{}. {} / {} - 可节省 {:.1}火\n",
            i + 1,
            item.section_name,
            item.item_name,
            savings
        ));
    }

    if items.len() > 5 {
        message.push_str(&format!("\n...还有 {} 件", items.len() - 5));
    }

    message
}

fn format_rule_notification(rule: &crate::db::models::AlertRule, targets: &[RuleTarget]) -> String {
    let rule_type_label = match rule.rule_type.as_str() {
        "price_below" => "价格低于",
        "price_above" => "价格高于",
        "profit_ratio_above" => "收益率高于",
        "price_drop_percent" => "价格跌幅超过",
        _ => &rule.rule_type,
    };

    if targets.len() == 1 {
        let target = &targets[0];
        let scope = target
            .section_name
            .as_deref()
            .map(|section| format!("{} / ", section))
            .unwrap_or_default();
        format!(
            "{}{} 当前 {:.1}火，已触发：{} {:.1}火",
            scope, target.item_name, target.current_price, rule_type_label, rule.threshold
        )
    } else if !targets.is_empty() {
        let section_name = targets
            .iter()
            .find_map(|target| target.section_name.as_deref())
            .unwrap_or("未关联板块");
        let mut message = format!(
            "{} 中有 {} 个物品触发：{} {:.1}火\n\n",
            section_name,
            targets.len(),
            rule_type_label,
            rule.threshold
        );
        for (i, target) in targets.iter().take(5).enumerate() {
            message.push_str(&format!(
                "{}. {} 当前 {:.1}火\n",
                i + 1,
                target.item_name,
                target.current_price
            ));
        }
        if targets.len() > 5 {
            message.push_str(&format!("\n...还有 {} 个", targets.len() - 5));
        }
        message
    } else if let Some(strategy_id) = &rule.strategy_id {
        format!(
            "策略 {} {} {}",
            strategy_id, rule_type_label, rule.threshold
        )
    } else {
        format!("{} {} (阈值: {})", rule.id, rule_type_label, rule.threshold)
    }
}

fn emit_alert_triggered(
    payload: serde_json::Value,
    app: &tauri::AppHandle,
) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::Emitter;
    app.emit("alert-triggered", payload)?;
    Ok(())
}

fn should_send_worth_alert(now: i64, cooldown_seconds: i32) -> bool {
    let cooldown_seconds = cooldown_seconds.max(1) as i64;
    let last_triggered = WORTH_ALERT_LAST_TRIGGERED.get_or_init(|| Mutex::new(None));
    let mut last_triggered = match last_triggered.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };

    if let Some(last) = *last_triggered {
        if now - last < cooldown_seconds {
            return false;
        }
    }

    *last_triggered = Some(now);
    true
}

fn play_configured_voice_alert(
    app: &tauri::AppHandle,
    notification_config: &NotificationSettings,
    count: usize,
) {
    match resolve_voice_alert_path(app, &notification_config.voice_alert_path) {
        Some(path) => play_voice_alert(path, count),
        None => {
            warn!("Voice alert enabled, but no configured or bundled voice alert file was found")
        }
    }
}

fn play_voice_alert(voice_path: std::path::PathBuf, count: usize) {
    let voice_path = voice_path.to_string_lossy().to_string();
    tokio::spawn(async move {
        for _ in 0..count {
            #[cfg(target_os = "macos")]
            {
                let _ = tokio::process::Command::new("afplay")
                    .arg(&voice_path)
                    .spawn()
                    .map_err(|e| warn!("Failed to play voice on macOS: {}", e));
            }
            #[cfg(target_os = "windows")]
            {
                let voice_path = voice_path.replace('\'', "''");
                let script = format!(
                    "Add-Type -AssemblyName PresentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open([Uri]'{}'); $player.Play(); Start-Sleep -Milliseconds 2500; $player.Close()",
                    voice_path
                );
                let _ = tokio::process::Command::new("powershell")
                    .args(["-NoProfile", "-Command", &script])
                    .spawn()
                    .map_err(|e| warn!("Failed to play voice on Windows: {}", e));
            }
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }
        info!("Voice alert played {} time(s)", count);
    });
}
