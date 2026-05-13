use crate::db::models_strategy::*;
use crate::db::repo_fire;
use chrono::Utc;
use sqlx::SqlitePool;
use std::collections::HashMap;

pub async fn get_strategy_details(
    pool: &SqlitePool,
) -> Result<Vec<StrategyDetail>, crate::core::errors::AppError> {
    let strategies = sqlx::query_as::<_, StrategyDetail>(
        "SELECT id, name, label, difficulty, output_value, defense_value, remark, COALESCE(image_url, '') as image_url, created_at, updated_at 
         FROM strategy_details ORDER BY created_at DESC"
    )
    .fetch_all(pool)
    .await?;
    Ok(strategies)
}

pub async fn get_strategy_detail(
    pool: &SqlitePool,
    id: &str,
) -> Result<Option<StrategyDetail>, crate::core::errors::AppError> {
    let strategy = sqlx::query_as::<_, StrategyDetail>(
        "SELECT id, name, label, difficulty, output_value, defense_value, remark, COALESCE(image_url, '') as image_url, created_at, updated_at 
         FROM strategy_details WHERE id = ?"
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(strategy)
}

pub async fn create_strategy_detail(
    pool: &SqlitePool,
    req: &CreateStrategyRequest,
) -> Result<String, crate::core::errors::AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    sqlx::query(
        "INSERT INTO strategy_details (id, name, label, difficulty, output_value, defense_value, remark, image_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&req.name)
    .bind(&req.label)
    .bind(&req.difficulty)
    .bind(req.output_value)
    .bind(req.defense_value)
    .bind(&req.remark)
    .bind(&req.image_url)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(id)
}

pub async fn update_strategy_detail(
    pool: &SqlitePool,
    req: &UpdateStrategyRequest,
) -> Result<(), crate::core::errors::AppError> {
    let now = Utc::now().timestamp();

    sqlx::query(
        "UPDATE strategy_details SET name=?, label=?, difficulty=?, output_value=?, defense_value=?, remark=?, image_url=?, updated_at=? WHERE id=?"
    )
    .bind(&req.name)
    .bind(&req.label)
    .bind(&req.difficulty)
    .bind(req.output_value)
    .bind(req.defense_value)
    .bind(&req.remark)
    .bind(&req.image_url)
    .bind(now)
    .bind(&req.id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn delete_strategy_detail(
    pool: &SqlitePool,
    id: &str,
) -> Result<(), crate::core::errors::AppError> {
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM strategy_detail_costs WHERE strategy_id=?")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM strategy_detail_outputs WHERE strategy_id=?")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM strategy_details WHERE id=?")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

pub async fn get_strategy_costs(
    pool: &SqlitePool,
    strategy_id: &str,
) -> Result<Vec<StrategyCost>, crate::core::errors::AppError> {
    let costs = sqlx::query_as::<_, StrategyCost>(
        "SELECT id, strategy_id, cost_type, item_id, item_name, count, fire_price, total_fire, is_realtime, created_at, updated_at 
         FROM strategy_detail_costs WHERE strategy_id = ? ORDER BY cost_type, created_at"
    )
    .bind(strategy_id)
    .fetch_all(pool)
    .await?;
    Ok(costs)
}

/// Batch fetch costs for multiple strategies in a single query
pub async fn get_strategy_costs_batch(
    pool: &SqlitePool,
    strategy_ids: &[String],
) -> Result<HashMap<String, Vec<StrategyCost>>, crate::core::errors::AppError> {
    if strategy_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let placeholders: Vec<String> = strategy_ids.iter().map(|_| "?".to_string()).collect();
    let sql = format!(
        "SELECT id, strategy_id, cost_type, item_id, item_name, count, fire_price, total_fire, is_realtime, created_at, updated_at 
         FROM strategy_detail_costs WHERE strategy_id IN ({}) ORDER BY cost_type, created_at",
        placeholders.join(", ")
    );

    let mut query = sqlx::query_as::<_, StrategyCost>(&sql);
    for id in strategy_ids {
        query = query.bind(id);
    }

    let costs = query.fetch_all(pool).await?;
    let mut result: HashMap<String, Vec<StrategyCost>> = HashMap::new();
    for cost in costs {
        result
            .entry(cost.strategy_id.clone())
            .or_default()
            .push(cost);
    }

    Ok(result)
}

pub async fn add_strategy_cost(
    pool: &SqlitePool,
    req: &AddCostRequest,
) -> Result<String, crate::core::errors::AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let fire_price = if req.is_realtime {
        match repo_fire::get_latest_fire(pool, "ss12", "season_normal").await {
            Ok(Some(record)) => record.fire_per_rmb,
            _ => 0.0,
        }
    } else {
        0.0
    };

    let total_fire = req.count * fire_price;

    sqlx::query(
        "INSERT INTO strategy_detail_costs (id, strategy_id, cost_type, item_id, item_name, count, fire_price, total_fire, is_realtime, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&req.strategy_id)
    .bind(&req.cost_type)
    .bind(&req.item_id)
    .bind(&req.item_name)
    .bind(req.count)
    .bind(fire_price)
    .bind(total_fire)
    .bind(req.is_realtime)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(id)
}

pub async fn update_strategy_cost(
    pool: &SqlitePool,
    req: &UpdateCostRequest,
) -> Result<(), crate::core::errors::AppError> {
    let now = Utc::now().timestamp();

    let cost =
        sqlx::query_as::<_, StrategyCost>("SELECT * FROM strategy_detail_costs WHERE id = ?")
            .bind(&req.id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| crate::core::errors::AppError::Db("Cost not found".to_string()))?;

    let fire_price = if req.is_realtime {
        match repo_fire::get_latest_fire(pool, "ss12", "season_normal").await {
            Ok(Some(record)) => record.fire_per_rmb,
            _ => cost.fire_price,
        }
    } else {
        cost.fire_price
    };

    let total_fire = req.count * fire_price;

    sqlx::query(
        "UPDATE strategy_detail_costs SET count=?, fire_price=?, total_fire=?, is_realtime=?, updated_at=? WHERE id=?"
    )
    .bind(req.count)
    .bind(fire_price)
    .bind(total_fire)
    .bind(req.is_realtime)
    .bind(now)
    .bind(&req.id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn delete_strategy_cost(
    pool: &SqlitePool,
    id: &str,
) -> Result<(), crate::core::errors::AppError> {
    sqlx::query("DELETE FROM strategy_detail_costs WHERE id=?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_strategy_outputs(
    pool: &SqlitePool,
    strategy_id: &str,
) -> Result<Vec<StrategyOutput>, crate::core::errors::AppError> {
    let outputs = sqlx::query_as::<_, StrategyOutput>(
        "SELECT id, strategy_id, item_name, item_type, count, estimated_value,
         COALESCE(realtime_value, 0) as realtime_value, remark, created_at, updated_at
         FROM strategy_detail_outputs WHERE strategy_id = ? ORDER BY created_at",
    )
    .bind(strategy_id)
    .fetch_all(pool)
    .await?;
    Ok(outputs)
}

/// Batch fetch outputs for multiple strategies in a single query
pub async fn get_strategy_outputs_batch(
    pool: &SqlitePool,
    strategy_ids: &[String],
) -> Result<HashMap<String, Vec<StrategyOutput>>, crate::core::errors::AppError> {
    if strategy_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let placeholders: Vec<String> = strategy_ids.iter().map(|_| "?".to_string()).collect();
    let sql = format!(
        "SELECT id, strategy_id, item_name, item_type, count, estimated_value,
         COALESCE(realtime_value, 0) as realtime_value, remark, created_at, updated_at
         FROM strategy_detail_outputs WHERE strategy_id IN ({}) ORDER BY created_at",
        placeholders.join(", ")
    );

    let mut query = sqlx::query_as::<_, StrategyOutput>(&sql);
    for id in strategy_ids {
        query = query.bind(id);
    }

    let outputs = query.fetch_all(pool).await?;
    let mut result: HashMap<String, Vec<StrategyOutput>> = HashMap::new();
    for output in outputs {
        result
            .entry(output.strategy_id.clone())
            .or_default()
            .push(output);
    }

    Ok(result)
}

pub async fn add_strategy_output(
    pool: &SqlitePool,
    req: &AddOutputRequest,
) -> Result<String, crate::core::errors::AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    sqlx::query(
        "INSERT INTO strategy_detail_outputs (id, strategy_id, item_name, item_type, count, estimated_value, realtime_value, remark, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&req.strategy_id)
    .bind(&req.item_name)
    .bind(&req.item_type)
    .bind(req.count)
    .bind(req.estimated_value)
    .bind(&req.remark)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(id)
}

pub async fn update_strategy_output(
    pool: &SqlitePool,
    req: &UpdateOutputRequest,
) -> Result<(), crate::core::errors::AppError> {
    let now = Utc::now().timestamp();

    sqlx::query(
        "UPDATE strategy_detail_outputs SET count=?, estimated_value=?, remark=?, updated_at=? WHERE id=?",
    )
    .bind(req.count)
    .bind(req.estimated_value)
    .bind(&req.remark)
    .bind(now)
    .bind(&req.id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn delete_strategy_output(
    pool: &SqlitePool,
    id: &str,
) -> Result<(), crate::core::errors::AppError> {
    sqlx::query("DELETE FROM strategy_detail_outputs WHERE id=?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Optimized: batch fetch all item prices in a single query per table
async fn get_all_item_prices(
    pool: &SqlitePool,
) -> Result<(HashMap<String, f64>, HashMap<String, f64>), crate::core::errors::AppError> {
    let normal_prices: Vec<(String, f64)> =
        sqlx::query_as("SELECT item_id, price FROM items_normal")
            .fetch_all(pool)
            .await?;
    let expert_prices: Vec<(String, f64)> =
        sqlx::query_as("SELECT item_id, price FROM items_expert")
            .fetch_all(pool)
            .await?;

    let mut normal_map = HashMap::new();
    for (id, price) in normal_prices {
        normal_map.insert(id, price);
    }

    let mut expert_map = HashMap::new();
    for (id, price) in expert_prices {
        expert_map.insert(id, price);
    }

    Ok((normal_map, expert_map))
}

async fn get_all_item_prices_by_name(
    pool: &SqlitePool,
) -> Result<(HashMap<String, f64>, HashMap<String, f64>), crate::core::errors::AppError> {
    let normal_prices: Vec<(String, f64)> = sqlx::query_as("SELECT name, price FROM items_normal")
        .fetch_all(pool)
        .await?;
    let expert_prices: Vec<(String, f64)> = sqlx::query_as("SELECT name, price FROM items_expert")
        .fetch_all(pool)
        .await?;

    let mut normal_map = HashMap::new();
    for (name, price) in normal_prices {
        normal_map.insert(name, price);
    }

    let mut expert_map = HashMap::new();
    for (name, price) in expert_prices {
        expert_map.insert(name, price);
    }

    Ok((normal_map, expert_map))
}

pub async fn get_strategy_with_costs(
    pool: &SqlitePool,
    strategy_id: &str,
) -> Result<Option<StrategyWithCosts>, crate::core::errors::AppError> {
    let strategy = get_strategy_detail(pool, strategy_id).await?;
    let strategy = match strategy {
        Some(s) => s,
        None => return Ok(None),
    };

    let mut costs = get_strategy_costs(pool, strategy_id).await?;
    let mut outputs = get_strategy_outputs(pool, strategy_id).await?;

    // Batch fetch all prices once instead of N+1 queries
    let (normal_prices, expert_prices) = get_all_item_prices(pool).await?;
    let (normal_name_prices, expert_name_prices) = get_all_item_prices_by_name(pool).await?;

    let mut total_cost_fire = 0.0;
    for cost in &mut costs {
        let current_price = normal_prices
            .get(&cost.item_id)
            .or_else(|| expert_prices.get(&cost.item_id))
            .copied()
            .unwrap_or(0.0);
        if cost.is_realtime {
            cost.fire_price = current_price;
            cost.total_fire = cost.count * current_price;
        }
        total_cost_fire += cost.total_fire;
    }

    let mut total_output_value = 0.0;
    for output in &mut outputs {
        let current_price = normal_name_prices
            .get(&output.item_name)
            .or_else(|| expert_name_prices.get(&output.item_name))
            .copied()
            .unwrap_or(0.0);
        output.realtime_value = current_price;
        total_output_value += current_price * output.count;
    }

    let profit_ratio = if total_cost_fire > 0.0 {
        (total_output_value - total_cost_fire) / total_cost_fire * 100.0
    } else {
        0.0
    };

    Ok(Some(StrategyWithCosts {
        strategy,
        costs,
        outputs,
        total_cost_fire,
        total_output_value,
        profit_ratio,
    }))
}

/// Highly optimized: batch fetch all strategies with costs in minimal queries
pub async fn get_all_strategies_with_costs(
    pool: &SqlitePool,
) -> Result<Vec<StrategyWithCosts>, crate::core::errors::AppError> {
    let strategies = get_strategy_details(pool).await?;
    let total_count = strategies.len();
    if total_count == 0 {
        return Ok(Vec::new());
    }

    let strategy_ids: Vec<String> = strategies.iter().map(|s| s.id.clone()).collect();

    // Batch fetch all costs and outputs in 2 queries instead of 2N
    let all_costs = get_strategy_costs_batch(pool, &strategy_ids).await?;
    let all_outputs = get_strategy_outputs_batch(pool, &strategy_ids).await?;

    // Batch fetch all prices in 2 queries instead of N
    let (normal_prices, expert_prices) = get_all_item_prices(pool).await?;
    let (normal_name_prices, expert_name_prices) = get_all_item_prices_by_name(pool).await?;

    let mut result = Vec::with_capacity(total_count);

    for strategy in strategies {
        let mut costs = all_costs.get(&strategy.id).cloned().unwrap_or_default();
        let mut outputs = all_outputs.get(&strategy.id).cloned().unwrap_or_default();

        let mut total_cost_fire = 0.0;
        for cost in &mut costs {
            let current_price = normal_prices
                .get(&cost.item_id)
                .or_else(|| expert_prices.get(&cost.item_id))
                .copied()
                .unwrap_or(0.0);
            if cost.is_realtime {
                cost.fire_price = current_price;
                cost.total_fire = cost.count * current_price;
            }
            total_cost_fire += cost.total_fire;
        }

        let mut total_output_value = 0.0;
        for output in &mut outputs {
            let current_price = normal_name_prices
                .get(&output.item_name)
                .or_else(|| expert_name_prices.get(&output.item_name))
                .copied()
                .unwrap_or(0.0);
            output.realtime_value = current_price;
            total_output_value += current_price * output.count;
        }

        let profit_ratio = if total_cost_fire > 0.0 {
            (total_output_value - total_cost_fire) / total_cost_fire * 100.0
        } else {
            0.0
        };

        result.push(StrategyWithCosts {
            strategy,
            costs,
            outputs,
            total_cost_fire,
            total_output_value,
            profit_ratio,
        });
    }

    if result.len() < total_count {
        tracing::warn!(
            "Partial load: {}/{} strategies loaded successfully",
            result.len(),
            total_count
        );
    }

    Ok(result)
}
