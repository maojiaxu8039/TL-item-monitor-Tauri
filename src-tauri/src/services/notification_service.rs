use tauri::AppHandle;
use tauri_plugin_notification::{NotificationExt, PermissionState};
use tracing::{error, info};

/// Send a desktop notification via tauri-plugin-notification.
/// Supports both macOS and Windows.
/// Automatically requests permission if not already granted.
pub fn send_notification(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    info!(
        "Attempting to send notification: title='{}', body='{}'",
        title, body
    );

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
        .show()
        .map_err(|e| {
            error!("Notification failed: {}", e);
            format!("Notification failed: {}", e)
        })?;

    info!("Notification sent successfully");
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
