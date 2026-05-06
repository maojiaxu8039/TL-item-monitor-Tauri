use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct StrategyDetail {
    pub id: String,
    pub name: String,
    pub label: String,
    pub difficulty: String,
    pub output_value: f64,
    pub defense_value: f64,
    pub remark: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct StrategyCost {
    pub id: String,
    pub strategy_id: String,
    pub cost_type: String,
    pub item_id: String,
    pub item_name: Option<String>,
    pub count: f64,
    pub fire_price: f64,
    pub total_fire: f64,
    pub is_realtime: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct StrategyOutput {
    pub id: String,
    pub strategy_id: String,
    pub item_name: String,
    pub item_type: String,
    pub count: f64,
    pub estimated_value: f64,
    pub realtime_value: f64,
    pub remark: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyWithCosts {
    #[serde(flatten)]
    pub strategy: StrategyDetail,
    pub costs: Vec<StrategyCost>,
    pub outputs: Vec<StrategyOutput>,
    pub total_cost_fire: f64,
    pub total_output_value: f64,
    pub profit_ratio: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateStrategyRequest {
    pub name: String,
    pub label: String,
    pub difficulty: String,
    pub output_value: f64,
    pub defense_value: f64,
    pub remark: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateStrategyRequest {
    pub id: String,
    pub name: String,
    pub label: String,
    pub difficulty: String,
    pub output_value: f64,
    pub defense_value: f64,
    pub remark: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddCostRequest {
    pub strategy_id: String,
    pub cost_type: String,
    pub item_id: String,
    pub item_name: Option<String>,
    pub count: f64,
    pub is_realtime: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddOutputRequest {
    pub strategy_id: String,
    pub item_name: String,
    pub item_type: String,
    pub count: f64,
    pub estimated_value: f64,
    pub remark: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCostRequest {
    pub id: String,
    pub count: f64,
    pub is_realtime: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateOutputRequest {
    pub id: String,
    pub count: f64,
    pub estimated_value: f64,
    pub remark: Option<String>,
}
