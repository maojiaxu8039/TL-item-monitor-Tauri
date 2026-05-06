use axum::{
    extract::{Query, State},
    response::Json,
    routing::{get, post},
    Router,
};
use tower_http::services::ServeDir;
use chrono::Utc;
use rand::{Rng, SeedableRng};
use rand::rngs::StdRng;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tracing::info;

// ============================================================================
// Data Models
// ============================================================================

#[derive(Clone, Serialize)]
struct FirePriceRecord {
    rmb_per_10k_fire: f64,
    fire_per_rmb: f64,
    increase_ratio: f64,
    scraped_at: i64,
    season_day: i32,
}

#[derive(Clone, Serialize)]
struct ItemRecord {
    item_id: String,
    name: String,
    item_type: String,
    price: f64,
    updated_at: i64,
}

#[derive(Clone, Serialize)]
struct DashboardData {
    season_id: String,
    market_mode: String,
    current_fire_price: f64,
    fire_increase_ratio: f64,
    item_count: usize,
    last_update: i64,
}

#[derive(Serialize)]
struct RefreshResponse {
    success: bool,
    message: String,
}

// ============================================================================
// App State
// ============================================================================

#[derive(Clone)]
struct AppState {
    fire_prices_normal: Arc<RwLock<Vec<FirePriceRecord>>>,
    fire_prices_expert: Arc<RwLock<Vec<FirePriceRecord>>>,
    items_normal: Arc<RwLock<Vec<ItemRecord>>>,
    items_expert: Arc<RwLock<Vec<ItemRecord>>>,
}

// ============================================================================
// Generate Test Data
// ============================================================================

fn generate_fire_price_data(mode: &str) -> Vec<FirePriceRecord> {
    let mut rng = StdRng::seed_from_u64(if mode == "expert" { 456 } else { 123 });
    let base_price = if mode == "expert" { 38.0 } else { 35.0 };
    let season_start = chrono::DateTime::parse_from_rfc3339("2026-04-17T00:00:00Z")
        .unwrap()
        .timestamp();
    
    let days_count = 17;
    let mut records = Vec::new();
    
    for day in 0..days_count {
        for hour in 0..24 {
            let scraped_at = season_start + (day as i64 * 24 * 3600) + (hour as i64 * 3600);
            let season_day = day + 1;
            
            let day_factor = if day < 7 {
                1.0 - (day as f64 * 0.01)
            } else if day < 14 {
                0.93 + ((day - 7) as f64 * 0.005)
            } else {
                0.965 + ((day - 14) as f64 * 0.008)
            };
            
            let hour_volatility = (hour as f64 - 12.0) / 80.0;
            let random_noise = rng.gen_range(-0.025..0.025);
            
            let rmb_per_10k = base_price * day_factor * (1.0 + hour_volatility + random_noise);
            let fire_per_rmb = 10000.0 / rmb_per_10k;
            let increase_ratio = random_noise * 100.0;
            
            records.push(FirePriceRecord {
                rmb_per_10k_fire: rmb_per_10k,
                fire_per_rmb,
                increase_ratio,
                scraped_at,
                season_day,
            });
        }
    }
    
    records
}

fn generate_items_data(mode: &str) -> Vec<ItemRecord> {
    let mut rng = StdRng::seed_from_u64(if mode == "expert" { 789 } else { 321 });
    let now = Utc::now().timestamp();
    
    let items = vec![
        ("item_001", "传奇武器", "武器", 180.0),
        ("item_002", "史诗护甲", "护甲", 95.0),
        ("item_003", "稀有戒指", "饰品", 55.0),
        ("item_004", "传送卷轴", "消耗品", 6.0),
        ("item_005", "强化石", "材料", 30.0),
        ("item_006", "生命药水", "消耗品", 4.0),
        ("item_007", "魔法剑", "武器", 240.0),
        ("item_008", "守护盾牌", "护甲", 140.0),
        ("item_009", "火焰宝石", "材料", 75.0),
        ("item_010", "冰霜法杖", "武器", 320.0),
    ];
    
    items.into_iter()
        .map(|(id, name, item_type, base_price)| {
            let price_factor = rng.gen_range(0.95..1.05);
            ItemRecord {
                item_id: id.to_string(),
                name: name.to_string(),
                item_type: item_type.to_string(),
                price: base_price * price_factor,
                updated_at: now,
            }
        })
        .collect()
}

// ============================================================================
// API Handlers
// ============================================================================

async fn get_dashboard(State(state): State<AppState>) -> Json<DashboardData> {
    let fire_prices = state.fire_prices_normal.read().await;
    let items = state.items_normal.read().await;
    
    let latest_fire = fire_prices.last().cloned();
    
    Json(DashboardData {
        season_id: "ss12".to_string(),
        market_mode: "season_normal".to_string(),
        current_fire_price: latest_fire.as_ref().map(|f| f.rmb_per_10k_fire).unwrap_or(35.0),
        fire_increase_ratio: latest_fire.as_ref().map(|f| f.increase_ratio).unwrap_or(0.0),
        item_count: items.len(),
        last_update: Utc::now().timestamp(),
    })
}

#[derive(Deserialize)]
struct FireHistoryQuery {
    mode: Option<String>,
    hours: Option<i64>,
}

async fn get_fire_history(
    State(state): State<AppState>,
    Query(params): Query<FireHistoryQuery>,
) -> Json<Vec<FirePriceRecord>> {
    let mode = params.mode.as_deref().unwrap_or("normal");
    let hours = params.hours.unwrap_or(24);
    
    let fire_prices = if mode == "expert" {
        state.fire_prices_expert.read().await
    } else {
        state.fire_prices_normal.read().await
    };
    
    let cutoff = Utc::now().timestamp() - (hours * 3600);
    let filtered: Vec<FirePriceRecord> = fire_prices
        .iter()
        .filter(|r| r.scraped_at >= cutoff)
        .cloned()
        .collect();
    
    Json(filtered)
}

async fn get_fire_history_all(
    State(state): State<AppState>,
    Query(params): Query<FireHistoryQuery>,
) -> Json<Vec<FirePriceRecord>> {
    let mode = params.mode.as_deref().unwrap_or("normal");
    
    let fire_prices = if mode == "expert" {
        state.fire_prices_expert.read().await
    } else {
        state.fire_prices_normal.read().await
    };
    
    Json(fire_prices.clone())
}

#[derive(Deserialize)]
struct ItemsQuery {
    mode: Option<String>,
    keyword: Option<String>,
}

async fn get_items(
    State(state): State<AppState>,
    Query(params): Query<ItemsQuery>,
) -> Json<Vec<ItemRecord>> {
    let mode = params.mode.as_deref().unwrap_or("normal");
    let keyword = params.keyword.unwrap_or_default().to_lowercase();
    
    let items = if mode == "expert" {
        state.items_expert.read().await
    } else {
        state.items_normal.read().await
    };
    
    let filtered: Vec<ItemRecord> = if keyword.is_empty() {
        items.clone()
    } else {
        items
            .iter()
            .filter(|item| {
                item.name.to_lowercase().contains(&keyword) ||
                item.item_type.to_lowercase().contains(&keyword)
            })
            .cloned()
            .collect()
    };
    
    Json(filtered)
}

async fn refresh_fire_price_handler(State(state): State<AppState>) -> Json<RefreshResponse> {
    info!("Refreshing fire price data...");
    
    let now = Utc::now().timestamp();
    let season_day = ((now - chrono::DateTime::parse_from_rfc3339("2026-04-17T00:00:00Z").unwrap().timestamp()) / 86400) as i32 + 1;
    
    let base_price = 35.0;
    let random_noise = rand::random::<f64>() * 0.04 - 0.02;
    let rmb_per_10k = base_price * (1.0 + random_noise);
    
    let new_record = FirePriceRecord {
        rmb_per_10k_fire: rmb_per_10k,
        fire_per_rmb: 10000.0 / rmb_per_10k,
        increase_ratio: random_noise * 100.0,
        scraped_at: now,
        season_day,
    };
    
    {
        let mut fire_prices = state.fire_prices_normal.write().await;
        fire_prices.push(new_record);
    }
    
    Json(RefreshResponse {
        success: true,
        message: "Fire price refreshed".to_string(),
    })
}

async fn refresh_items_handler(State(state): State<AppState>) -> Json<RefreshResponse> {
    info!("Refreshing items data...");
    
    let new_items = generate_items_data("normal");
    
    {
        let mut items = state.items_normal.write().await;
        *items = new_items;
    }
    
    Json(RefreshResponse {
        success: true,
        message: "Items refreshed".to_string(),
    })
}

// ============================================================================
// Main
// ============================================================================

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    
    info!("Starting TL Monitor Web Server...");
    
    let state = AppState {
        fire_prices_normal: Arc::new(RwLock::new(generate_fire_price_data("normal"))),
        fire_prices_expert: Arc::new(RwLock::new(generate_fire_price_data("expert"))),
        items_normal: Arc::new(RwLock::new(generate_items_data("normal"))),
        items_expert: Arc::new(RwLock::new(generate_items_data("expert"))),
    };
    
    let app = Router::new()
        .route("/api/dashboard", get(get_dashboard))
        .route("/api/fire/history", get(get_fire_history))
        .route("/api/fire/history/all", get(get_fire_history_all))
        .route("/api/items", get(get_items))
        .route("/api/refresh/fire", post(refresh_fire_price_handler))
        .route("/api/refresh/items", post(refresh_items_handler))
        .route("/api/health", get(|| async { Json(serde_json::json!({"status": "ok"})) }))
        .nest_service("/", ServeDir::new("static"))
        .layer(CorsLayer::permissive())
        .with_state(state);
    
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    info!("Server running on http://0.0.0.0:8080");
    info!("API endpoints:");
    info!("  GET  /api/dashboard       - Dashboard summary");
    info!("  GET  /api/fire/history    - Fire price history (query: mode, hours)");
    info!("  GET  /api/fire/history/all - All fire price history (query: mode)");
    info!("  GET  /api/items           - Items list (query: mode, keyword)");
    info!("  POST /api/refresh/fire    - Refresh fire price");
    info!("  POST /api/refresh/items   - Refresh items");
    info!("  GET  /api/health          - Health check");
    
    axum::serve(listener, app).await.unwrap();
}
