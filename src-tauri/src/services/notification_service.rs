use tauri::AppHandle;
use tauri_plugin_notification::{NotificationExt, PermissionState};
use tracing::{error, info, warn};

use crate::core::state::NotificationSettings;

pub struct WorthAlertNotificationItem<'a> {
    pub section_name: &'a str,
    pub item_name: &'a str,
    pub current_price: f64,
    pub purchase_fire_price: f64,
    pub count: i32,
}

pub fn desktop_notifications_enabled(settings: &NotificationSettings) -> bool {
    if !settings.system_notifications {
        return false;
    }

    #[cfg(target_os = "macos")]
    {
        return settings.mac_desktop_notifications;
    }

    #[cfg(target_os = "windows")]
    {
        return settings.win_desktop_notifications;
    }

    #[allow(unreachable_code)]
    true
}

pub fn format_worth_alert_notification(items: &[WorthAlertNotificationItem<'_>]) -> String {
    if items.is_empty() {
        return "当前没有满足条件的物品".to_string();
    }

    let mut lines = Vec::new();
    if items.len() > 1 {
        lines.push(format!("共 {} 件满足条件:", items.len()));
    }

    for (i, item) in items.iter().take(5).enumerate() {
        let savings = (item.purchase_fire_price - item.current_price) * item.count as f64;
        let prefix = if items.len() > 1 {
            format!("{}. ", i + 1)
        } else {
            String::new()
        };
        lines.push(format!(
            "{}{} / {} | 实际火价: {:.1}火 | 节省: {:.1}火",
            prefix,
            item.section_name,
            item.item_name,
            item.current_price,
            savings.max(0.0)
        ));
    }

    if items.len() > 5 {
        lines.push(format!("...还有 {} 件", items.len() - 5));
    }

    lines.join("\n")
}

/// Send a desktop notification via tauri-plugin-notification.
/// Supports both macOS and Windows.
/// Automatically requests permission if not already granted.
pub fn send_notification(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    info!(
        "Attempting to send notification: title='{}', body='{}'",
        title, body
    );

    #[cfg(target_os = "macos")]
    {
        match send_macos_notification(app, title, body) {
            Ok(()) => {
                info!("macOS notification sent successfully");
                return Ok(());
            }
            Err(e) => {
                warn!(
                    "macOS native notification failed, falling back to Tauri notification: {}",
                    e
                );
            }
        }
    }

    let notification = app.notification();

    // Check current permission state
    match notification.permission_state() {
        Ok(state) => {
            info!("Current notification permission state: {:?}", state);

            if state != PermissionState::Granted {
                info!("Permission not granted, requesting permission...");

                // Request permission
                match notification.request_permission() {
                    Ok(new_state) => {
                        info!("Permission request result: {:?}", new_state);

                        if new_state != PermissionState::Granted {
                            error!("Notification permission denied");
                            return Err("Notification permission denied by user".to_string());
                        }
                    }
                    Err(e) => {
                        error!("Failed to request notification permission: {}", e);
                        return Err(format!("Failed to request permission: {}", e));
                    }
                }
            }
        }
        Err(e) => {
            error!("Failed to check notification permission state: {}", e);
            return Err(format!("Failed to check permission: {}", e));
        }
    }

    // Send the notification
    notification
        .builder()
        .title(title)
        .body(body)
        .sound("Default")
        .show()
        .map_err(|e| {
            error!("Notification failed: {}", e);
            format!("Notification failed: {}", e)
        })?;

    info!("Notification sent successfully");
    Ok(())
}

#[cfg(target_os = "macos")]
fn send_macos_notification(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    let identifier = app.config().identifier.clone();

    match mac_notification_sys::set_application(&identifier) {
        Ok(()) => {
            info!("macOS notification application set to {}", identifier);
        }
        Err(mac_notification_sys::error::Error::Application(
            mac_notification_sys::error::ApplicationError::AlreadySet(_),
        )) => {}
        Err(e) => {
            return Err(format!("failed to set macOS notification app: {}", e));
        }
    }

    mac_notification_sys::Notification::new()
        .title(title)
        .message(body)
        .default_sound()
        .send()
        .map_err(|e| format!("macOS notification failed: {}", e))?;

    Ok(())
}

pub fn format_notification_message(
    item_name: &str,
    item_type: &str,
    current_price: f64,
    previous_price: f64,
    change_rate: f64,
    change_type: &str,
) -> String {
    let (change_symbol, change_word) = if change_rate > 0.0 {
        ("📈", "上涨")
    } else {
        ("📉", "下跌")
    };
    let change_pct = format!("{:.1}", change_rate.abs());

    let price_diff = (current_price - previous_price).abs();
    let diff_str = format!("{:.1}", price_diff);

    let type_emoji = match item_type {
        "武器" | "weapon" => "⚔️",
        "护甲" | "armor" => "🛡️",
        "饰品" | "accessory" => "💍",
        "消耗品" | "consumable" => "🧪",
        "材料" | "material" => "📦",
        _ => "📦",
    };

    let action = match change_type {
        "sharp_rise" => "🔥 暴涨提醒",
        "rise" => "📈 上涨提醒",
        "sharp_fall" => "⚡ 暴跌提醒",
        "fall" => "📉 下跌提醒",
        _ => "📊 价格变动",
    };

    format!(
        "{} {}\n{} {} | {}\n当前: {} | 之前: {}\n{}: {}% ({})",
        action,
        change_symbol,
        type_emoji,
        item_name,
        item_type,
        current_price,
        previous_price,
        change_word,
        change_pct,
        diff_str
    )
}
