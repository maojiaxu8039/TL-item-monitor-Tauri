pub mod alert_task;
pub mod fire_task;
pub mod history_task;
pub mod items_task;

use tokio::sync::broadcast;
use tracing::info;

pub struct SchedulerHandle {
    pub fire_scrape_abort: broadcast::Sender<()>,
    pub items_reload_abort: broadcast::Sender<()>,
    pub hourly_snapshot_abort: broadcast::Sender<()>,
    pub alert_task_abort: broadcast::Sender<()>,
}

impl SchedulerHandle {
    pub fn shutdown(&self) {
        info!("Shutting down scheduler tasks...");
        let _ = self.fire_scrape_abort.send(());
        let _ = self.items_reload_abort.send(());
        let _ = self.hourly_snapshot_abort.send(());
        let _ = self.alert_task_abort.send(());
    }
}
