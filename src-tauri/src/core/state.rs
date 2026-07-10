// core/state.rs — Application state using sqlx
use parking_lot::RwLock;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

pub struct AppState {
    pub db: SqlitePool,
    pub config: RwLock<AppConfig>,
    pub fire_prices: RwLock<HashMap<MarketMode, FirePriceSnapshot>>,
    pub items_cache: RwLock<Arc<Vec<crate::db::models::Item>>>,
    pub active_context: RwLock<MarketContext>,
    pub task_status: RwLock<TaskStatus>,
    pub scheduler_handle: RwLock<Option<crate::scheduler::SchedulerHandle>>,
    pub items_refresh_running: AtomicBool,
    pub snapshot_running: AtomicBool,
    pub is_quitting: AtomicBool,
}

use std::sync::atomic::Ordering;

pub struct ItemsRefreshGuard<'a> {
    running: &'a AtomicBool,
}

impl Drop for ItemsRefreshGuard<'_> {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            db: self.db.clone(),
            config: RwLock::new(self.config.read().clone()),
            fire_prices: RwLock::new(self.fire_prices.read().clone()),
            items_cache: RwLock::new(self.items_cache.read().clone()),
            active_context: RwLock::new(self.active_context.read().clone()),
            task_status: RwLock::new(self.task_status.read().clone()),
            scheduler_handle: RwLock::new(self.scheduler_handle.read().clone()),
            items_refresh_running: AtomicBool::new(
                self.items_refresh_running.load(Ordering::SeqCst),
            ),
            snapshot_running: AtomicBool::new(self.snapshot_running.load(Ordering::SeqCst)),
            is_quitting: AtomicBool::new(self.is_quitting.load(Ordering::SeqCst)),
        }
    }
}

impl AppState {
    /// Create a lightweight clone for use in spawned tasks.
    /// This avoids cloning large data structures when only the Arc reference is needed.
    pub fn clone_for_task(&self) -> Self {
        Self {
            db: self.db.clone(),
            config: RwLock::new(self.config.read().clone()),
            fire_prices: RwLock::new(self.fire_prices.read().clone()),
            items_cache: RwLock::new(self.items_cache.read().clone()),
            active_context: RwLock::new(self.active_context.read().clone()),
            task_status: RwLock::new(self.task_status.read().clone()),
            scheduler_handle: RwLock::new(self.scheduler_handle.read().clone()),
            items_refresh_running: AtomicBool::new(
                self.items_refresh_running.load(Ordering::SeqCst),
            ),
            snapshot_running: AtomicBool::new(self.snapshot_running.load(Ordering::SeqCst)),
            is_quitting: AtomicBool::new(self.is_quitting.load(Ordering::SeqCst)),
        }
    }

    pub fn try_begin_items_refresh(&self) -> Option<ItemsRefreshGuard<'_>> {
        if self.items_refresh_running.swap(true, Ordering::SeqCst) {
            None
        } else {
            Some(ItemsRefreshGuard {
                running: &self.items_refresh_running,
            })
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct AppConfig {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub scrape: ScrapeSettings,
    pub desktop: DesktopSettings,
    pub notification: NotificationSettings,
    pub deal: DealSettings,
    pub data: DataSettings,
    pub app: AppSettings,
}

fn default_schema_version() -> u32 {
    1
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct ScrapeSettings {
    pub fire_price_mode: String,
    pub fire_price_scrape_interval: u64,
    pub fire_price_scrape_enabled: bool,
    pub fire_scrape_normal_enabled: bool,
    pub fire_scrape_expert_enabled: bool,
    pub items_source: String,
    pub items_json_path: String,
    pub items_reload_interval: u64,
    pub auto_reload: bool,
    pub items_scrape_normal_enabled: bool,
    pub items_scrape_expert_enabled: bool,
}

impl Default for ScrapeSettings {
    fn default() -> Self {
        Self {
            fire_price_mode: "season_normal".to_string(),
            fire_price_scrape_interval: 300,
            fire_price_scrape_enabled: true,
            fire_scrape_normal_enabled: true,
            fire_scrape_expert_enabled: false,
            items_source: "dual".to_string(),
            items_json_path: String::new(),
            items_reload_interval: 300,
            auto_reload: true,
            items_scrape_normal_enabled: true,
            items_scrape_expert_enabled: false,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct DesktopSettings {
    pub auto_start: bool,
    pub tray_on_close: bool,
    pub mini_mode: bool,
    pub free_layout: bool,
    pub mini_opacity: f64,
    pub mini_always_on_top: bool,
    pub mini_width: i32,
    pub mini_height: i32,
    pub mini_x: Option<i32>,
    pub mini_y: Option<i32>,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            auto_start: false,
            tray_on_close: true,
            mini_mode: false,
            free_layout: false,
            mini_opacity: 0.92,
            mini_always_on_top: true,
            mini_width: 360,
            mini_height: 540,
            mini_x: None,
            mini_y: None,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct NotificationSettings {
    pub system_notifications: bool,
    pub mac_desktop_notifications: bool,
    pub win_desktop_notifications: bool,
    pub voice_alert_enabled: bool,
    pub voice_alert_path: String,
    pub price_alert_enabled: bool,
    pub price_alert_cooldown_seconds: i32,
    pub buy_alert_enabled: bool,
    pub buy_alert_cooldown_seconds: i32,
    pub sell_alert_enabled: bool,
    pub sell_alert_cooldown_seconds: i32,
    pub quiet_start: Option<String>,
    pub quiet_end: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct DealSettings {
    pub bargain_enabled: bool,
    pub bargain_threshold_percent: u32,
    pub sell_enabled: bool,
    pub sell_threshold_percent: u32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct DataSettings {
    pub history_retention: String,
    pub compress_history: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct AppSettings {
    pub season_id: String,
    pub language: String,
    pub auto_update: bool,
}

/// Per-season API configuration for data sources.
/// Each season may have different API parameters from Qiandao, Luosi and Etor.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct SeasonApiConfig {
    /// Qiandao API tagId for normal mode (赛季普通)
    pub qiandao_tag_id_normal: String,
    /// Qiandao API specId for normal mode
    pub qiandao_spec_id_normal: String,
    /// Qiandao API tagId for expert mode (赛季专家)
    pub qiandao_tag_id_expert: String,
    /// Qiandao API specId for expert mode
    pub qiandao_spec_id_expert: String,
    /// Luosi API season_id for normal mode (e.g. 1401 for ss12)
    pub luosi_season_id_normal: i32,
    /// Luosi API season_id for expert mode (e.g. 1431 for ss12)
    pub luosi_season_id_expert: i32,
    /// Etor (易火) API season_id for normal mode
    pub etor_season_id_normal: i32,
    /// Etor (易火) API season_id for expert mode
    pub etor_season_id_expert: i32,
}

impl Default for SeasonApiConfig {
    fn default() -> Self {
        // SS12 defaults
        Self {
            qiandao_tag_id_normal: "1560053".to_string(),
            qiandao_spec_id_normal: "267416".to_string(),
            qiandao_tag_id_expert: "1560053".to_string(),
            qiandao_spec_id_expert: "267417".to_string(),
            luosi_season_id_normal: 1401,
            luosi_season_id_expert: 1431,
            // 易火与刷图小助手使用相同的赛季ID
            etor_season_id_normal: 1401,
            etor_season_id_expert: 1431,
        }
    }
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            system_notifications: true,
            mac_desktop_notifications: true,
            win_desktop_notifications: true,
            voice_alert_enabled: true,
            voice_alert_path: String::new(),
            price_alert_enabled: true,
            price_alert_cooldown_seconds: 600,
            buy_alert_enabled: true,
            buy_alert_cooldown_seconds: 600,
            sell_alert_enabled: true,
            sell_alert_cooldown_seconds: 600,
            quiet_start: None,
            quiet_end: None,
        }
    }
}

impl Default for DealSettings {
    fn default() -> Self {
        Self {
            bargain_enabled: true,
            bargain_threshold_percent: 30,
            sell_enabled: true,
            sell_threshold_percent: 30,
        }
    }
}

impl Default for DataSettings {
    fn default() -> Self {
        Self {
            history_retention: "permanent".to_string(),
            compress_history: false,
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            season_id: "ss12".to_string(),
            language: "zh-CN".to_string(),
            auto_update: false,
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            schema_version: 1,
            scrape: ScrapeSettings::default(),
            desktop: DesktopSettings::default(),
            notification: NotificationSettings::default(),
            deal: DealSettings::default(),
            data: DataSettings::default(),
            app: AppSettings::default(),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FirePriceSnapshot {
    pub price_per_wan: f64,
    pub rmb_per_10k_fire: f64,
    pub fire_per_rmb: f64,
    pub increase_ratio: Option<f64>,
    pub trading_volume: Option<String>,
    pub source: String,
    pub source_time: Option<String>,
    pub scraped_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MarketContext {
    pub season_id: String,
    pub market_mode: MarketMode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MarketMode {
    SeasonNormal,
    SeasonExpert,
}

impl MarketMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            MarketMode::SeasonNormal => "season_normal",
            MarketMode::SeasonExpert => "season_expert",
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TaskStatus {
    pub fire_scrape_running: bool,
    pub items_reload_running: bool,
    pub last_fire_scrape: Option<i64>,
    pub last_items_reload: Option<i64>,
    pub db_size_kb: f64,
}
