use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

/// Send a desktop notification via tauri-plugin-notification.
pub fn send_notification(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| format!("Notification failed: {e}"))
}
