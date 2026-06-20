use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ArbitrageRecipe {
    pub id: String,
    pub name: String,
    pub recipe_type: String,
    pub season_id: String,
    pub market_mode: String,
    pub enabled: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ArbitrageIngredient {
    pub id: String,
    pub recipe_id: String,
    pub item_name: String,
    pub count: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ArbitrageOutput {
    pub id: String,
    pub recipe_id: String,
    pub item_name: String,
    pub count: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArbitrageRecipeWithDetails {
    pub recipe: ArbitrageRecipe,
    pub ingredients: Vec<ArbitrageIngredient>,
    pub outputs: Vec<ArbitrageOutput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArbitrageCalculationResult {
    pub recipe_id: String,
    pub recipe_name: String,
    pub recipe_type: String,
    pub total_cost: f64,
    pub total_output_value: f64,
    pub profit: f64,
    pub profit_margin: f64,
    pub ingredients_detail: Vec<IngredientCostDetail>,
    pub outputs_detail: Vec<OutputRevenueDetail>,
    pub is_profitable: bool,
    pub used_lowest_price: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngredientCostDetail {
    pub item_name: String,
    pub count: f64,
    pub unit_price: f64,
    pub total_cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputRevenueDetail {
    pub item_name: String,
    pub count: f64,
    pub unit_price: f64,
    pub total_value: f64,
    pub after_tax_value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRecipeRequest {
    pub name: String,
    pub recipe_type: String,
    pub enabled: bool,
    pub ingredients: Vec<CreateIngredientRequest>,
    pub outputs: Vec<CreateOutputRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateIngredientRequest {
    pub item_name: String,
    pub count: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateOutputRequest {
    pub item_name: String,
    pub count: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRecipeRequest {
    pub name: Option<String>,
    pub recipe_type: Option<String>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateIngredientsRequest {
    pub ingredients: Vec<CreateIngredientRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateOutputsRequest {
    pub outputs: Vec<CreateOutputRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArbitrageResponse {
    pub recipes: Vec<ArbitrageCalculationResult>,
    pub calculated_at: i64,
    pub total_profitable: i32,
    pub total_loss: i32,
}
