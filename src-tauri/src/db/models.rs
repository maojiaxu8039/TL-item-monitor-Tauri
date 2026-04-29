// db/models.rs
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[allow(unused)]
pub struct Item {
    pub item_id: String,
    pub season_id: String,
    pub market_mode: String,
    pub name: String,
    pub item_type: String,
    pub source: String,
    pub price: f64,
    pub last_time: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct FirePriceRecord {
    pub id: i64,
    pub season_id: String,
    pub market_mode: String,
    pub rmb_per_10k_fire: f64,
    pub fire_per_rmb: f64,
    pub increase_ratio: Option<f64>,
    pub trading_volume: Option<String>,
    pub source: String,
    pub source_time: Option<String>,
    pub scraped_at: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Section {
    pub id: String,
    pub name: String,
    pub strategy_id: Option<String>,
    pub sort_order: i32,
    pub collapsed: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SectionItem {
    pub id: String,
    pub section_id: String,
    pub season_id: String,
    pub market_mode: String,
    pub item_id: String,
    pub item_name: Option<String>,
    pub item_type: Option<String>,
    pub current_price: Option<f64>,
    pub purchase_fire_price: f64,
    pub count: i32,
    pub more_value: f64,
    pub sort_order: i32,
    pub last_time: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AlertRule {
    pub id: String,
    pub strategy_id: Option<String>,
    pub section_id: Option<String>,
    pub item_id: Option<String>,
    pub rule_type: String,
    pub threshold: f64,
    pub enabled: i32,
    pub cooldown_seconds: i32,
    pub last_triggered_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AlertEvent {
    pub id: String,
    pub rule_id: String,
    pub section_item_id: Option<String>,
    pub triggered_at: i64,
    pub message: String,
    pub seen: i32,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Strategy {
    pub id: String,
    pub name: String,
    pub season_scope: String,
    pub enabled: i32,
    pub consider_ratio: f64,
    pub sort_rule: String,
    pub notification_enabled: i32,
    pub cooldown_seconds: i32,
    pub quiet_start: Option<String>,
    pub quiet_end: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SourceDiagnostic {
    pub source: String,
    pub source_type: String,
    pub enabled: i32,
    pub market_mode: Option<String>,
    pub local_path: Option<String>,
    pub last_success_at: Option<i64>,
    pub last_failure_at: Option<i64>,
    pub last_duration_ms: Option<i64>,
    pub last_item_count: Option<i64>,
    pub last_error: Option<String>,
    pub updated_at: i64,
}
