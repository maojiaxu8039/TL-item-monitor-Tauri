use crate::core::errors::AppError;
use crate::db::models::{AlertEvent, AlertRule};
use crate::db::table_resolver::TableResolver;
use sqlx::SqlitePool;

// ─── Alert Rules ───────────────────────────────────────────────────────────

pub async fn get_alert_rules(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<AlertRule>, AppError> {
    TableResolver::validate(season_id, market_mode)?;
    let items_table = TableResolver::items_table(season_id, market_mode);

    let sql = format!(
        r#"
        SELECT
            r.id, r.strategy_id, r.section_id, r.item_id,
            i.name AS item_name,
            r.rule_type, r.threshold, r.enabled, r.cooldown_seconds,
            r.last_triggered_at, r.created_at, r.updated_at
        FROM alert_rules r
        LEFT JOIN {items_table} i ON i.item_id = r.item_id
        ORDER BY r.created_at DESC
        "#,
        items_table = items_table
    );

    let rows: Vec<AlertRule> = sqlx::query_as(&sql).fetch_all(pool).await?;
    Ok(rows)
}

pub async fn create_alert_rule(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    strategy_id: Option<&str>,
    section_id: Option<&str>,
    item_id: Option<&str>,
    rule_type: &str,
    threshold: f64,
    cooldown_seconds: i32,
) -> Result<AlertRule, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    sqlx::query(
        r#"INSERT INTO alert_rules (id, strategy_id, section_id, item_id, rule_type, threshold, enabled, cooldown_seconds, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)"#
    )
    .bind(&id)
    .bind(strategy_id)
    .bind(section_id)
    .bind(item_id)
    .bind(rule_type)
    .bind(threshold)
    .bind(cooldown_seconds)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    let item_name = if let Some(iid) = item_id {
        let items_table = TableResolver::items_table(season_id, market_mode);
        let sql = format!(
            "SELECT name FROM {items_table} WHERE item_id = ? LIMIT 1",
            items_table = items_table
        );
        let name: Option<(String,)> = sqlx::query_as(&sql).bind(iid).fetch_optional(pool).await?;
        name.map(|(n,)| n)
    } else {
        None
    };

    Ok(AlertRule {
        id,
        strategy_id: strategy_id.map(|s| s.to_string()),
        section_id: section_id.map(|s| s.to_string()),
        item_id: item_id.map(|s| s.to_string()),
        item_name,
        rule_type: rule_type.to_string(),
        threshold,
        enabled: 1,
        cooldown_seconds,
        last_triggered_at: None,
        created_at: now,
        updated_at: now,
    })
}

#[allow(clippy::too_many_arguments)]
pub async fn update_alert_rule(
    pool: &SqlitePool,
    id: &str,
    strategy_id: Option<&str>,
    section_id: Option<&str>,
    item_id: Option<&str>,
    rule_type: &str,
    threshold: f64,
    cooldown_seconds: i32,
    enabled: bool,
) -> Result<(), AppError> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        r#"UPDATE alert_rules SET
           strategy_id = ?, section_id = ?, item_id = ?, rule_type = ?,
           threshold = ?, enabled = ?, cooldown_seconds = ?, updated_at = ?
           WHERE id = ?"#,
    )
    .bind(strategy_id)
    .bind(section_id)
    .bind(item_id)
    .bind(rule_type)
    .bind(threshold)
    .bind(enabled)
    .bind(cooldown_seconds)
    .bind(now)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn toggle_alert_rule(pool: &SqlitePool, id: &str, enabled: bool) -> Result<(), AppError> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query("UPDATE alert_rules SET enabled = ?, updated_at = ? WHERE id = ?")
        .bind(enabled)
        .bind(now)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_alert_rule(pool: &SqlitePool, id: &str) -> Result<(), AppError> {
    sqlx::query("DELETE FROM alert_rules WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// ─── Alert Events ──────────────────────────────────────────────────────────

pub async fn create_alert_event(
    pool: &SqlitePool,
    rule_id: &str,
    section_item_id: Option<&str>,
    message: &str,
) -> Result<AlertEvent, AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    sqlx::query(
        r#"INSERT INTO alert_events (id, rule_id, section_item_id, triggered_at, message, seen, created_at)
           VALUES (?, ?, ?, ?, ?, 0, ?)"#
    )
    .bind(&id)
    .bind(rule_id)
    .bind(section_item_id)
    .bind(now)
    .bind(message)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(AlertEvent {
        id,
        rule_id: rule_id.to_string(),
        section_item_id: section_item_id.map(|s| s.to_string()),
        triggered_at: now,
        message: message.to_string(),
        seen: false,
        created_at: now,
    })
}

pub async fn get_alert_events(pool: &SqlitePool, limit: i64) -> Result<Vec<AlertEvent>, AppError> {
    let rows: Vec<AlertEvent> = sqlx::query_as(
        r#"SELECT id, rule_id, section_item_id, triggered_at, message, seen, created_at
           FROM alert_events ORDER BY triggered_at DESC LIMIT ?"#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn update_rule_last_triggered(
    pool: &SqlitePool,
    id: &str,
    timestamp: i64,
) -> Result<(), AppError> {
    sqlx::query("UPDATE alert_rules SET last_triggered_at = ? WHERE id = ?")
        .bind(timestamp)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
