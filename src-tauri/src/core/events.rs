#![allow(dead_code)]

use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub const EVENT_FIRE_PRICE_UPDATED: &str = "fire-price-updated";
pub const EVENT_ITEMS_UPDATED: &str = "items-updated";
pub const EVENT_MARKET_CONTEXT_CHANGED: &str = "market-context-changed";
pub const EVENT_TASK_STATUS_CHANGED: &str = "task-status-changed";
pub const EVENT_ALERT_TRIGGERED: &str = "alert-triggered";
pub const EVENT_CONFIG_CHANGED: &str = "config-changed";
pub const EVENT_DATABASE_STATS_UPDATED: &str = "database-stats-updated";

#[derive(Debug, Clone, Serialize)]
pub struct FirePricePayload {
    pub rmb_per_10k_fire: f64,
    pub fire_per_rmb: f64,
    pub increase_ratio: Option<f64>,
    pub trading_volume: Option<String>,
    pub source: String,
    pub source_time: Option<String>,
    pub scraped_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ItemsUpdatedPayload {
    pub count: i64,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MarketContextPayload {
    pub season_id: String,
    pub market_mode: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskStatusPayload {
    pub fire_scrape_running: bool,
    pub items_reload_running: bool,
    pub last_fire_scrape: Option<i64>,
    pub last_items_reload: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AlertTriggeredPayload {
    pub id: String,
    pub rule_id: String,
    pub message: String,
    pub triggered_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DbStatsPayload {
    pub item_count: i64,
    pub db_record_count: i64,
    pub db_size_kb: f64,
}

pub fn emit_fire_price_updated(app: &AppHandle, payload: FirePricePayload) {
    let _ = app.emit(EVENT_FIRE_PRICE_UPDATED, payload);
}

pub fn emit_items_updated(app: &AppHandle, payload: ItemsUpdatedPayload) {
    let _ = app.emit(EVENT_ITEMS_UPDATED, payload);
}

pub fn emit_market_context_changed(app: &AppHandle, payload: MarketContextPayload) {
    let _ = app.emit(EVENT_MARKET_CONTEXT_CHANGED, payload);
}

pub fn emit_task_status_changed(app: &AppHandle, payload: TaskStatusPayload) {
    let _ = app.emit(EVENT_TASK_STATUS_CHANGED, payload);
}

pub fn emit_alert_triggered(app: &AppHandle, payload: AlertTriggeredPayload) {
    let _ = app.emit(EVENT_ALERT_TRIGGERED, payload);
}

pub fn emit_config_changed(app: &AppHandle, config: impl Serialize + Clone) {
    let _ = app.emit(EVENT_CONFIG_CHANGED, config);
}

pub fn emit_database_stats_updated(app: &AppHandle, payload: DbStatsPayload) {
    let _ = app.emit(EVENT_DATABASE_STATS_UPDATED, payload);
}
