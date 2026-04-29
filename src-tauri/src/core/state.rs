// core/state.rs — Application state using sqlx
use sqlx::SqlitePool;
use parking_lot::RwLock;

pub struct AppState {
    pub db: SqlitePool,
    pub config: RwLock<AppConfig>,
    pub fire_price: RwLock<Option<FirePriceSnapshot>>,
    pub items_cache: RwLock<Vec<crate::db::models::Item>>,
    pub active_context: RwLock<MarketContext>,
    pub task_status: RwLock<TaskStatus>,
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            db: self.db.clone(),
            config: RwLock::new(self.config.read().clone()),
            fire_price: RwLock::new(self.fire_price.read().clone()),
            items_cache: RwLock::new(self.items_cache.read().clone()),
            active_context: RwLock::new(self.active_context.read().clone()),
            task_status: RwLock::new(self.task_status.read().clone()),
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
    pub items_source: String,
    pub items_json_path: String,
    pub items_reload_interval: u64,
    pub auto_reload: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct DesktopSettings {
    pub auto_start: bool,
    pub tray_on_close: bool,
    pub mini_mode: bool,
    pub free_layout: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct NotificationSettings {
    pub system_notifications: bool,
    pub quiet_start: Option<String>,
    pub quiet_end: Option<String>,
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

impl Default for ScrapeSettings {
    fn default() -> Self {
        Self {
            fire_price_mode: "season_normal".to_string(),
            fire_price_scrape_interval: 300,
            fire_price_scrape_enabled: true,
            items_source: "api".to_string(),
            items_json_path: String::new(),
            items_reload_interval: 300,
            auto_reload: true,
        }
    }
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            auto_start: false,
            tray_on_close: false,
            mini_mode: false,
            free_layout: false,
        }
    }
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            system_notifications: true,
            quiet_start: None,
            quiet_end: None,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
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
