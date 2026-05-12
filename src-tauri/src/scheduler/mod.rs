pub mod alert_task;
pub mod fire_task;
pub mod history_task;
pub mod items_task;

use tokio::sync::broadcast;

pub struct SchedulerHandle {
    #[allow(unused)]
    pub fire_scrape_abort: broadcast::Sender<()>,
    #[allow(unused)]
    pub items_reload_abort: broadcast::Sender<()>,
    #[allow(unused)]
    pub hourly_snapshot_abort: broadcast::Sender<()>,
    #[allow(unused)]
    pub alert_task_abort: broadcast::Sender<()>,
}
