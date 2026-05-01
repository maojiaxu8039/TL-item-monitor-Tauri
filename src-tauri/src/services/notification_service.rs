use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use tracing::{info, error};

/// Send a desktop notification via tauri-plugin-notification.
/// Supports both macOS and Windows.
pub fn send_notification(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    info!("Attempting to send notification: title='{}', body='{}'", title, body);
    
    let notification = app.notification();
    
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
