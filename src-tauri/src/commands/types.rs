use crate::core::state::FirePriceSnapshot;
use crate::db::models::Item;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirePriceUI {
    pub price_per_wan: f64,
    pub rmb_per_10k_fire: f64,
    pub fire_per_rmb: f64,
    pub increase_ratio: Option<f64>,
    pub trading_volume: Option<String>,
    pub source: String,
    pub source_time: Option<String>,
    pub scraped_at: i64,
}

impl From<FirePriceSnapshot> for FirePriceUI {
    fn from(s: FirePriceSnapshot) -> Self {
        Self {
            price_per_wan: s.price_per_wan,
            rmb_per_10k_fire: s.rmb_per_10k_fire,
            fire_per_rmb: s.fire_per_rmb,
            increase_ratio: s.increase_ratio,
            trading_volume: s.trading_volume,
            source: s.source,
            source_time: s.source_time,
            scraped_at: s.scraped_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardSummary {
    pub fire: Option<FirePriceUI>,
    pub history_fire: Option<FirePriceUI>,
    pub total_fire: f64,
    pub total_rmb: f64,
    pub season_name: String,
    pub market_mode: String,
    pub item_count: i64,
    pub db_record_count: i64,
    pub last_fire_at: Option<String>,
    pub last_items_at: Option<String>,
    pub task_running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OkResponse {
    pub ok: bool,
    pub message: String,
}

impl OkResponse {
    pub fn success(msg: &str) -> Self {
        Self {
            ok: true,
            message: msg.to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub items: Vec<Item>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbStats {
    pub item_count: i64,
    pub db_record_count: i64,
    pub db_size_kb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResp {
    pub imported: i32,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub last_backup_at: Option<i64>,
    pub db_size_kb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseMaintenanceResult {
    pub db_size_kb_before: f64,
    pub db_size_kb_after: f64,
    pub wal_size_kb_before: f64,
    pub wal_size_kb_after: f64,
    pub total_size_kb_before: f64,
    pub total_size_kb_after: f64,
    pub freed_kb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemsStats {
    pub total_items: i64,
    pub last_reload: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionItemPatch {
    pub count: Option<i32>,
    pub more_value: Option<f64>,
    pub purchase_fire_price: Option<f64>,
    pub last_time: Option<String>,
}
