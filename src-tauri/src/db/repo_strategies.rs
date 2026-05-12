use crate::db::models::Strategy;
use chrono::Utc;
use sqlx::SqlitePool;

pub async fn get_strategies(
    pool: &SqlitePool,
) -> Result<Vec<Strategy>, crate::core::errors::AppError> {
    let strategies: Vec<Strategy> = sqlx::query_as(
        "SELECT id, name, season_scope, enabled, consider_ratio, sort_rule, notification_enabled, cooldown_seconds, quiet_start, quiet_end, created_at, updated_at FROM strategies ORDER BY created_at DESC"
    )
    .fetch_all(pool)
    .await
    ?;

    Ok(strategies)
}

pub async fn create_strategy(
    pool: &SqlitePool,
    s: &Strategy,
) -> Result<(), crate::core::errors::AppError> {
    sqlx::query(
        "INSERT INTO strategies (id, name, season_scope, enabled, consider_ratio, sort_rule, notification_enabled, cooldown_seconds, quiet_start, quiet_end, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&s.id)
    .bind(&s.name)
    .bind(&s.season_scope)
    .bind(s.enabled)
    .bind(s.consider_ratio)
    .bind(&s.sort_rule)
    .bind(s.notification_enabled)
    .bind(s.cooldown_seconds)
    .bind(&s.quiet_start)
    .bind(&s.quiet_end)
    .bind(s.created_at)
    .bind(s.updated_at)
    .execute(pool)
    .await
    ?;
    Ok(())
}

pub async fn update_strategy(
    pool: &SqlitePool,
    s: &Strategy,
) -> Result<(), crate::core::errors::AppError> {
    sqlx::query(
        "UPDATE strategies SET name=?, season_scope=?, enabled=?, consider_ratio=?, sort_rule=?, notification_enabled=?, cooldown_seconds=?, quiet_start=?, quiet_end=?, updated_at=? WHERE id=?"
    )
    .bind(&s.name)
    .bind(&s.season_scope)
    .bind(s.enabled)
    .bind(s.consider_ratio)
    .bind(&s.sort_rule)
    .bind(s.notification_enabled)
    .bind(s.cooldown_seconds)
    .bind(&s.quiet_start)
    .bind(&s.quiet_end)
    .bind(Utc::now().timestamp())
    .bind(&s.id)
    .execute(pool)
    .await
    ?;
    Ok(())
}

pub async fn delete_strategy(
    pool: &SqlitePool,
    id: &str,
) -> Result<(), crate::core::errors::AppError> {
    let mut tx = pool.begin().await?;

    // Execute delete operations in order to respect foreign key constraints
    sqlx::query("DELETE FROM strategy_costs WHERE strategy_id=?")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM strategy_outputs WHERE strategy_id=?")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM alert_rules WHERE strategy_id=?")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("UPDATE sections SET strategy_id = NULL WHERE strategy_id=?")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM strategies WHERE id=?")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}
