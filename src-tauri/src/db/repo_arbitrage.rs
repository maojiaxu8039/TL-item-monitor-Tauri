use crate::core::errors::AppError;
use crate::db::models_arbitrage::{
    ArbitrageCalculationResult, ArbitrageIngredient, ArbitrageOutput, ArbitrageRecipe,
    ArbitrageRecipeWithDetails, CreateIngredientRequest, CreateOutputRequest, IngredientCostDetail,
    OutputRevenueDetail,
};
use crate::db::table_resolver::TableResolver;
use sqlx::SqlitePool;
use std::collections::{HashMap, HashSet};

async fn ensure_arbitrage_schema(pool: &SqlitePool) -> Result<(), AppError> {
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS arbitrage_recipes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            recipe_type TEXT NOT NULL DEFAULT 'decompose',
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            season_id TEXT NOT NULL DEFAULT '',
            market_mode TEXT NOT NULL DEFAULT 'season_normal'
        )"#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS arbitrage_ingredients (
            id TEXT PRIMARY KEY,
            recipe_id TEXT NOT NULL,
            item_name TEXT NOT NULL,
            count REAL NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (recipe_id) REFERENCES arbitrage_recipes(id) ON DELETE CASCADE
        )"#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS arbitrage_outputs (
            id TEXT PRIMARY KEY,
            recipe_id TEXT NOT NULL,
            item_name TEXT NOT NULL,
            count REAL NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (recipe_id) REFERENCES arbitrage_recipes(id) ON DELETE CASCADE
        )"#,
    )
    .execute(pool)
    .await?;

    add_column_if_missing(
        pool,
        "arbitrage_recipes",
        "season_id",
        "TEXT NOT NULL DEFAULT ''",
    )
    .await?;
    add_column_if_missing(
        pool,
        "arbitrage_recipes",
        "market_mode",
        "TEXT NOT NULL DEFAULT 'season_normal'",
    )
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_arbitrage_recipes_season_mode ON arbitrage_recipes(season_id, market_mode)",
    )
    .execute(pool)
    .await?;

    Ok(())
}

async fn add_column_if_missing(
    pool: &SqlitePool,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), AppError> {
    let exists: i64 = sqlx::query_scalar(&format!(
        "SELECT COUNT(*) FROM pragma_table_info('{}') WHERE name = ?",
        table
    ))
    .bind(column)
    .fetch_one(pool)
    .await?;

    if exists == 0 {
        sqlx::query(&format!(
            "ALTER TABLE {} ADD COLUMN {} {}",
            table, column, definition
        ))
        .execute(pool)
        .await?;
    }

    Ok(())
}

pub async fn get_all_recipes(pool: &SqlitePool) -> Result<Vec<ArbitrageRecipe>, AppError> {
    ensure_arbitrage_schema(pool).await?;

    let recipes: Vec<ArbitrageRecipe> = sqlx::query_as(
        "SELECT id, name, recipe_type, season_id, market_mode, enabled, created_at, updated_at
         FROM arbitrage_recipes
         ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(recipes)
}

pub async fn get_recipes_by_season(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<ArbitrageRecipe>, AppError> {
    ensure_arbitrage_schema(pool).await?;

    let recipes: Vec<ArbitrageRecipe> = sqlx::query_as(
        "SELECT id, name, recipe_type, season_id, market_mode, enabled, created_at, updated_at
         FROM arbitrage_recipes
         WHERE season_id = ? AND market_mode = ?
         ORDER BY created_at DESC",
    )
    .bind(season_id)
    .bind(market_mode)
    .fetch_all(pool)
    .await?;
    Ok(recipes)
}

pub async fn get_recipe_by_id(
    pool: &SqlitePool,
    recipe_id: &str,
) -> Result<Option<ArbitrageRecipe>, AppError> {
    ensure_arbitrage_schema(pool).await?;

    let recipe: Option<ArbitrageRecipe> = sqlx::query_as(
        "SELECT id, name, recipe_type, season_id, market_mode, enabled, created_at, updated_at
         FROM arbitrage_recipes
         WHERE id = ?",
    )
    .bind(recipe_id)
    .fetch_optional(pool)
    .await?;
    Ok(recipe)
}

pub async fn get_recipe_with_details(
    pool: &SqlitePool,
    recipe_id: &str,
) -> Result<Option<ArbitrageRecipeWithDetails>, AppError> {
    let Some(recipe) = get_recipe_by_id(pool, recipe_id).await? else {
        return Ok(None);
    };

    let ingredients: Vec<ArbitrageIngredient> = sqlx::query_as(
        "SELECT id, recipe_id, item_name, count, created_at, updated_at 
         FROM arbitrage_ingredients 
         WHERE recipe_id = ?",
    )
    .bind(recipe_id)
    .fetch_all(pool)
    .await?;

    let outputs: Vec<ArbitrageOutput> = sqlx::query_as(
        "SELECT id, recipe_id, item_name, count, created_at, updated_at 
         FROM arbitrage_outputs 
         WHERE recipe_id = ?",
    )
    .bind(recipe_id)
    .fetch_all(pool)
    .await?;

    Ok(Some(ArbitrageRecipeWithDetails {
        recipe,
        ingredients,
        outputs,
    }))
}

/// Batch fetch all recipe details in a single query to avoid N+1
pub async fn get_all_recipes_with_details(
    pool: &SqlitePool,
) -> Result<HashMap<String, (Vec<ArbitrageIngredient>, Vec<ArbitrageOutput>)>, AppError> {
    ensure_arbitrage_schema(pool).await?;

    let ingredients: Vec<ArbitrageIngredient> = sqlx::query_as(
        "SELECT id, recipe_id, item_name, count, created_at, updated_at 
         FROM arbitrage_ingredients",
    )
    .fetch_all(pool)
    .await?;

    let outputs: Vec<ArbitrageOutput> = sqlx::query_as(
        "SELECT id, recipe_id, item_name, count, created_at, updated_at 
         FROM arbitrage_outputs",
    )
    .fetch_all(pool)
    .await?;

    let mut result: HashMap<String, (Vec<ArbitrageIngredient>, Vec<ArbitrageOutput>)> =
        HashMap::new();

    for ing in ingredients {
        result
            .entry(ing.recipe_id.clone())
            .or_insert_with(|| (Vec::new(), Vec::new()))
            .0
            .push(ing);
    }

    for out in outputs {
        result
            .entry(out.recipe_id.clone())
            .or_insert_with(|| (Vec::new(), Vec::new()))
            .1
            .push(out);
    }

    Ok(result)
}

pub async fn create_recipe(
    pool: &SqlitePool,
    name: &str,
    recipe_type: &str,
    season_id: &str,
    market_mode: &str,
    enabled: bool,
    ingredients: &[CreateIngredientRequest],
    outputs: &[CreateOutputRequest],
) -> Result<String, AppError> {
    ensure_arbitrage_schema(pool).await?;

    let recipe_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO arbitrage_recipes (id, name, recipe_type, season_id, market_mode, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&recipe_id)
    .bind(name)
    .bind(recipe_type)
    .bind(season_id)
    .bind(market_mode)
    .bind(if enabled { 1 } else { 0 })
    .bind(now)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    for ingredient in ingredients {
        let ingredient_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO arbitrage_ingredients (id, recipe_id, item_name, count, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&ingredient_id)
        .bind(&recipe_id)
        .bind(&ingredient.item_name)
        .bind(ingredient.count)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await?;
    }

    for output in outputs {
        let output_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO arbitrage_outputs (id, recipe_id, item_name, count, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&output_id)
        .bind(&recipe_id)
        .bind(&output.item_name)
        .bind(output.count)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(recipe_id)
}

pub async fn update_recipe(
    pool: &SqlitePool,
    recipe_id: &str,
    name: Option<&str>,
    recipe_type: Option<&str>,
    enabled: Option<bool>,
) -> Result<(), AppError> {
    ensure_arbitrage_schema(pool).await?;

    let now = chrono::Utc::now().timestamp();
    let mut updates = vec!["updated_at = ?".to_string()];

    if name.is_some() {
        updates.push("name = ?".to_string());
    }
    if recipe_type.is_some() {
        updates.push("recipe_type = ?".to_string());
    }
    if enabled.is_some() {
        updates.push("enabled = ?".to_string());
    }

    let sql = format!(
        "UPDATE arbitrage_recipes SET {} WHERE id = ?",
        updates.join(", ")
    );

    let mut query = sqlx::query(&sql).bind(now);

    if let Some(n) = name {
        query = query.bind(n);
    }
    if let Some(rt) = recipe_type {
        query = query.bind(rt);
    }
    if let Some(e) = enabled {
        query = query.bind(if e { 1 } else { 0 });
    }

    query = query.bind(recipe_id);
    query.execute(pool).await?;

    Ok(())
}

pub async fn update_ingredients(
    pool: &SqlitePool,
    recipe_id: &str,
    ingredients: &[CreateIngredientRequest],
) -> Result<(), AppError> {
    ensure_arbitrage_schema(pool).await?;

    let now = chrono::Utc::now().timestamp();

    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM arbitrage_ingredients WHERE recipe_id = ?")
        .bind(recipe_id)
        .execute(&mut *tx)
        .await?;

    for ingredient in ingredients {
        let ingredient_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO arbitrage_ingredients (id, recipe_id, item_name, count, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&ingredient_id)
        .bind(recipe_id)
        .bind(&ingredient.item_name)
        .bind(ingredient.count)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn update_outputs(
    pool: &SqlitePool,
    recipe_id: &str,
    outputs: &[CreateOutputRequest],
) -> Result<(), AppError> {
    ensure_arbitrage_schema(pool).await?;

    let now = chrono::Utc::now().timestamp();

    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM arbitrage_outputs WHERE recipe_id = ?")
        .bind(recipe_id)
        .execute(&mut *tx)
        .await?;

    for output in outputs {
        let output_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO arbitrage_outputs (id, recipe_id, item_name, count, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&output_id)
        .bind(recipe_id)
        .bind(&output.item_name)
        .bind(output.count)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn delete_recipe(pool: &SqlitePool, recipe_id: &str) -> Result<(), AppError> {
    ensure_arbitrage_schema(pool).await?;

    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM arbitrage_ingredients WHERE recipe_id = ?")
        .bind(recipe_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM arbitrage_outputs WHERE recipe_id = ?")
        .bind(recipe_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM arbitrage_recipes WHERE id = ?")
        .bind(recipe_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

/// Optimized batch price lookup using IN clause instead of N+1 queries
pub async fn get_item_prices_by_name(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    item_names: &[String],
) -> Result<HashMap<String, f64>, AppError> {
    if item_names.is_empty() {
        return Ok(HashMap::new());
    }

    TableResolver::validate(season_id, market_mode)?;

    let items_table = TableResolver::items_table(season_id, market_mode);
    let mut prices = HashMap::new();

    // Process in batches of 100 to avoid SQL parameter limits
    for chunk in item_names.chunks(100) {
        let placeholders: Vec<String> = chunk.iter().map(|_| "?".to_string()).collect();
        let sql = format!(
            "SELECT name, price FROM {} WHERE name IN ({}) GROUP BY name HAVING MAX(updated_at)",
            items_table,
            placeholders.join(", ")
        );

        let mut query = sqlx::query_as(&sql);
        for name in chunk {
            query = query.bind(name);
        }

        let rows: Vec<(String, f64)> = query.fetch_all(pool).await?;
        for (name, price) in rows {
            prices.insert(name, price);
        }
    }

    Ok(prices)
}

/// Optimized batch lowest price lookup using IN clause
pub async fn get_item_lowest_prices_by_name(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    item_names: &[String],
) -> Result<HashMap<String, f64>, AppError> {
    if item_names.is_empty() {
        return Ok(HashMap::new());
    }

    TableResolver::validate(season_id, market_mode)?;

    let items_table = TableResolver::items_table(season_id, market_mode);
    let mut prices = HashMap::new();

    for chunk in item_names.chunks(100) {
        let placeholders: Vec<String> = chunk.iter().map(|_| "?".to_string()).collect();
        let sql = format!(
            "SELECT name, MIN(price) as lowest_price FROM {} WHERE name IN ({}) GROUP BY name",
            items_table,
            placeholders.join(", ")
        );

        let mut query = sqlx::query_as(&sql);
        for name in chunk {
            query = query.bind(name);
        }

        let rows: Vec<(String, f64)> = query.fetch_all(pool).await?;
        for (name, price) in rows {
            prices.insert(name, price);
        }
    }

    Ok(prices)
}

pub async fn calculate_arbitrage_for_all_recipes(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<ArbitrageCalculationResult>, AppError> {
    let recipes = get_all_recipes(pool).await?;
    tracing::info!("[Arbitrage] Found {} recipes in database", recipes.len());
    let mut results = Vec::new();

    // Batch fetch all recipe details in 2 queries instead of N+1
    let all_details = get_all_recipes_with_details(pool).await?;
    tracing::info!(
        "[Arbitrage] Batch loaded details for {} recipes",
        all_details.len()
    );

    let (all_ingredient_names, all_output_names): (Vec<String>, Vec<String>) = {
        let mut ingredients = Vec::new();
        let mut outputs = Vec::new();
        for recipe in &recipes {
            if let Some((recipe_ingredients, recipe_outputs)) = all_details.get(&recipe.id) {
                for ing in recipe_ingredients {
                    ingredients.push(ing.item_name.clone());
                }
                for out in recipe_outputs {
                    outputs.push(out.item_name.clone());
                }
            }
        }
        (ingredients, outputs)
    };

    let unique_ingredient_names: Vec<String> = {
        let mut set = HashSet::new();
        all_ingredient_names
            .into_iter()
            .filter(|s| set.insert(s.clone()))
            .collect()
    };
    let unique_output_names: Vec<String> = {
        let mut set = HashSet::new();
        all_output_names
            .into_iter()
            .filter(|s| set.insert(s.clone()))
            .collect()
    };

    tracing::info!(
        "[Arbitrage] Unique ingredients: {}, outputs: {}",
        unique_ingredient_names.len(),
        unique_output_names.len()
    );

    let ingredient_prices =
        get_item_lowest_prices_by_name(pool, season_id, market_mode, &unique_ingredient_names)
            .await?;
    let output_prices =
        get_item_prices_by_name(pool, season_id, market_mode, &unique_output_names).await?;

    tracing::info!(
        "[Arbitrage] Found prices for {} ingredients, {} outputs",
        ingredient_prices.len(),
        output_prices.len()
    );

    for recipe in recipes {
        let (ingredients, outputs) = match all_details.get(&recipe.id) {
            Some(details) => details,
            None => {
                tracing::debug!("[Arbitrage] Skipping recipe {} - no details", recipe.id);
                continue;
            }
        };

        let ingredients_detail: Vec<IngredientCostDetail> = ingredients
            .iter()
            .map(|ing| {
                let unit_price = ingredient_prices
                    .get(&ing.item_name)
                    .copied()
                    .unwrap_or(0.0);
                let total_cost = unit_price * ing.count;
                IngredientCostDetail {
                    item_name: ing.item_name.clone(),
                    count: ing.count,
                    unit_price,
                    total_cost,
                }
            })
            .collect();

        // 分解类型：从多种可分解物品中选择最低火价的作为成本（而非全部相加）
        // 合成/兑换类型：所有原料都需要购买，成本为全部相加
        let total_cost: f64 = if recipe.recipe_type == "decompose" {
            let min_cost = ingredients_detail
                .iter()
                .map(|i| i.total_cost)
                .filter(|&c| c > 0.0)
                .fold(f64::INFINITY, f64::min);
            if min_cost.is_infinite() {
                0.0
            } else {
                min_cost
            }
        } else {
            ingredients_detail.iter().map(|i| i.total_cost).sum()
        };

        let outputs_detail: Vec<OutputRevenueDetail> = outputs
            .iter()
            .map(|out| {
                let unit_price = output_prices.get(&out.item_name).copied().unwrap_or(0.0);
                let total_value = unit_price * out.count;
                let after_tax_value = total_value * 0.875;
                OutputRevenueDetail {
                    item_name: out.item_name.clone(),
                    count: out.count,
                    unit_price,
                    total_value,
                    after_tax_value,
                }
            })
            .collect();

        let total_output_value: f64 = outputs_detail.iter().map(|o| o.after_tax_value).sum();

        let profit = total_output_value - total_cost;
        let profit_margin = if total_cost > 0.0 {
            (profit / total_cost) * 100.0
        } else {
            0.0
        };

        let is_profitable = profit > 0.0;
        let used_lowest_price = recipe.recipe_type == "decompose";

        tracing::debug!(
            "[Arbitrage] Recipe '{}' profit: {} (margin: {:.1}%)",
            recipe.name,
            profit,
            profit_margin
        );

        results.push(ArbitrageCalculationResult {
            recipe_id: recipe.id,
            recipe_name: recipe.name,
            recipe_type: recipe.recipe_type.clone(),
            total_cost,
            total_output_value,
            profit,
            profit_margin,
            ingredients_detail,
            outputs_detail,
            is_profitable,
            used_lowest_price,
        });
    }

    results.sort_by(|a, b| {
        b.profit
            .partial_cmp(&a.profit)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(results)
}

pub async fn count_profitable_arbitrage(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<i64, AppError> {
    let results =
        calculate_arbitrage_for_all_recipes(pool, season_id, market_mode).await?;
    Ok(results.iter().filter(|r| r.is_profitable && r.profit > 0.0).count() as i64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn legacy_arbitrage_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("test sqlite pool should connect");

        for sql in [
            r#"
            CREATE TABLE arbitrage_recipes (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                recipe_type TEXT NOT NULL DEFAULT 'decompose',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            "#,
            r#"
            CREATE TABLE arbitrage_ingredients (
                id TEXT PRIMARY KEY,
                recipe_id TEXT NOT NULL,
                item_name TEXT NOT NULL,
                count REAL NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            "#,
            r#"
            CREATE TABLE arbitrage_outputs (
                id TEXT PRIMARY KEY,
                recipe_id TEXT NOT NULL,
                item_name TEXT NOT NULL,
                count REAL NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            "#,
        ] {
            sqlx::query(sql)
                .execute(&pool)
                .await
                .expect("legacy arbitrage table should be created");
        }

        pool
    }

    #[tokio::test]
    async fn create_recipe_repairs_legacy_context_columns() {
        let pool = legacy_arbitrage_pool().await;

        let recipe_id = create_recipe(
            &pool,
            "测试配方",
            "decompose",
            "ss12",
            "season_normal",
            true,
            &[],
            &[],
        )
        .await
        .expect("legacy arbitrage table should be repaired before insert");

        let recipe = get_recipe_by_id(&pool, &recipe_id)
            .await
            .expect("recipe query should work after repair")
            .expect("recipe should exist");

        assert_eq!(recipe.season_id, "ss12");
        assert_eq!(recipe.market_mode, "season_normal");
    }
}
