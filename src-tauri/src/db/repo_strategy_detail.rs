use crate::db::models_strategy::*;
use crate::db::repo_realtime_fire;
use chrono::Utc;
use sqlx::SqlitePool;

pub async fn get_strategy_details(pool: &SqlitePool) -> Result<Vec<StrategyDetail>, crate::core::errors::AppError> {
    let strategies = sqlx::query_as::<_, StrategyDetail>(
        "SELECT id, name, label, difficulty, output_value, defense_value, remark, created_at, updated_at 
         FROM strategy_details ORDER BY created_at DESC"
    )
    .fetch_all(pool)
    .await?;
    Ok(strategies)
}

pub async fn get_strategy_detail(pool: &SqlitePool, id: &str) -> Result<Option<StrategyDetail>, crate::core::errors::AppError> {
    let strategy = sqlx::query_as::<_, StrategyDetail>(
        "SELECT id, name, label, difficulty, output_value, defense_value, remark, created_at, updated_at 
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
        "INSERT INTO strategy_details (id, name, label, difficulty, output_value, defense_value, remark, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&req.name)
    .bind(&req.label)
    .bind(&req.difficulty)
    .bind(req.output_value)
    .bind(req.defense_value)
    .bind(&req.remark)
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
        "UPDATE strategy_details SET name=?, label=?, difficulty=?, output_value=?, defense_value=?, remark=?, updated_at=? WHERE id=?"
    )
    .bind(&req.name)
    .bind(&req.label)
    .bind(&req.difficulty)
    .bind(req.output_value)
    .bind(req.defense_value)
    .bind(&req.remark)
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

    sqlx::query("DELETE FROM strategy_costs WHERE strategy_id=?")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM strategy_outputs WHERE strategy_id=?")
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
         FROM strategy_costs WHERE strategy_id = ? ORDER BY cost_type, created_at"
    )
    .bind(strategy_id)
    .fetch_all(pool)
    .await?;
    Ok(costs)
}

pub async fn add_strategy_cost(
    pool: &SqlitePool,
    req: &AddCostRequest,
) -> Result<String, crate::core::errors::AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let fire_price = if req.is_realtime {
        repo_realtime_fire::get_current_fire_price(pool)
            .await
            .unwrap_or(0.0)
    } else {
        0.0
    };

    let total_fire = req.count * fire_price;

    sqlx::query(
        "INSERT INTO strategy_costs (id, strategy_id, cost_type, item_id, item_name, count, fire_price, total_fire, is_realtime, created_at, updated_at)
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

    let cost = sqlx::query_as::<_, StrategyCost>(
        "SELECT * FROM strategy_costs WHERE id = ?"
    )
    .bind(&req.id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| crate::core::errors::AppError::Db("Cost not found".to_string()))?;

    let fire_price = if req.is_realtime {
        repo_realtime_fire::get_current_fire_price(pool)
            .await
            .unwrap_or(cost.fire_price)
    } else {
        cost.fire_price
    };

    let total_fire = req.count * fire_price;

    sqlx::query(
        "UPDATE strategy_costs SET count=?, fire_price=?, total_fire=?, is_realtime=?, updated_at=? WHERE id=?"
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
    sqlx::query("DELETE FROM strategy_costs WHERE id=?")
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
        "SELECT id, strategy_id, item_name, item_type, count, estimated_value, remark, created_at, updated_at 
         FROM strategy_outputs WHERE strategy_id = ? ORDER BY created_at"
    )
    .bind(strategy_id)
    .fetch_all(pool)
    .await?;
    Ok(outputs)
}

pub async fn add_strategy_output(
    pool: &SqlitePool,
    req: &AddOutputRequest,
) -> Result<String, crate::core::errors::AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    sqlx::query(
        "INSERT INTO strategy_outputs (id, strategy_id, item_name, item_type, count, estimated_value, remark, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
        "UPDATE strategy_outputs SET count=?, estimated_value=?, remark=?, updated_at=? WHERE id=?"
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
    sqlx::query("DELETE FROM strategy_outputs WHERE id=?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
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

    let costs = get_strategy_costs(pool, strategy_id).await?;
    let outputs = get_strategy_outputs(pool, strategy_id).await?;

    let total_cost_fire: f64 = costs.iter().map(|c| c.total_fire).sum();
    let total_output_value: f64 = outputs.iter().map(|o| o.estimated_value * o.count).sum();
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

pub async fn get_all_strategies_with_costs(
    pool: &SqlitePool,
) -> Result<Vec<StrategyWithCosts>, crate::core::errors::AppError> {
    let strategies = get_strategy_details(pool).await?;
    let mut result = Vec::new();

    for strategy in strategies {
        match get_strategy_with_costs(pool, &strategy.id).await {
            Ok(Some(s)) => result.push(s),
            Ok(None) => continue,
            Err(_) => continue,
        }
    }

    Ok(result)
}
