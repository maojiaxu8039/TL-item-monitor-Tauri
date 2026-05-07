use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ServerInfo {
    pub version: String,
    pub uptime_seconds: i64,
    pub season_id: String,
    pub last_collection: CollectionSummary,
    pub next_collection: Option<i64>,
    pub config: ConfigSummary,
}

#[derive(Debug, Clone, Serialize)]
pub struct CollectionSummary {
    pub normal: Option<ModeSummary>,
    pub expert: Option<ModeSummary>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModeSummary {
    pub timestamp: i64,
    pub success: bool,
    pub fire_price: Option<f64>,
    pub items_count: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConfigSummary {
    pub scrape_modes: Vec<ScrapeModeSummary>,
    pub api_config_preview: ApiConfigPreview,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScrapeModeSummary {
    pub mode: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApiConfigPreview {
    pub luosi_season_id_normal: i32,
    pub luosi_season_id_expert: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExportRequest {
    pub mode: String,
    pub data_type: String,
    pub limit: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExportResponse {
    pub success: bool,
    pub data: Vec<serde_json::Value>,
    pub count: usize,
    pub exported_at: i64,
}
