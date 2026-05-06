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
