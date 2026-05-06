use crate::core::errors::AppError;
use crate::db::models::SourceDiagnostic;
use sqlx::SqlitePool;

fn success_failure_times(success: bool, now: i64) -> (Option<i64>, Option<i64>) {
    if success {
        (Some(now), None)
    } else {
        (None, Some(now))
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn upsert_diagnostic(
    pool: &SqlitePool,
    source: &str,
    source_type: &str,
    enabled: bool,
    market_mode: Option<&str>,
    local_path: Option<&str>,
    success: bool,
    duration_ms: i64,
    item_count: Option<i64>,
    error: Option<&str>,
) -> Result<(), AppError> {
    let now = chrono::Utc::now().timestamp();
    let (last_success_at, last_failure_at) = success_failure_times(success, now);

    let existing: Option<(i64,)> =
        sqlx::query_as("SELECT updated_at FROM source_diagnostics WHERE source = ?")
            .bind(source)
            .fetch_optional(pool)
            .await?;

    if existing.is_some() {
        sqlx::query(
            r#"UPDATE source_diagnostics SET
               source_type = ?, enabled = ?, market_mode = ?, local_path = ?,
               last_success_at = COALESCE(?, last_success_at),
               last_failure_at = COALESCE(?, last_failure_at),
               last_duration_ms = ?, last_item_count = ?, last_error = ?, updated_at = ?
               WHERE source = ?"#,
        )
        .bind(source_type)
        .bind(enabled)
        .bind(market_mode)
        .bind(local_path)
        .bind(last_success_at)
        .bind(last_failure_at)
        .bind(duration_ms)
        .bind(item_count)
        .bind(error)
        .bind(now)
        .bind(source)
        .execute(pool)
        .await?;
    } else {
        sqlx::query(
            r#"INSERT INTO source_diagnostics
               (source, source_type, enabled, market_mode, local_path, last_success_at, last_failure_at, last_duration_ms, last_item_count, last_error, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#
        )
        .bind(source)
        .bind(source_type)
        .bind(enabled)
        .bind(market_mode)
        .bind(local_path)
        .bind(last_success_at)
        .bind(last_failure_at)
        .bind(duration_ms)
        .bind(item_count)
        .bind(error)
        .bind(now)
        .execute(pool)
        .await?;
    }

    Ok(())
}

pub async fn get_diagnostics(pool: &SqlitePool) -> Result<Vec<SourceDiagnostic>, AppError> {
    let rows: Vec<SourceDiagnostic> = sqlx::query_as(
        "SELECT source, source_type, enabled, market_mode, local_path, last_success_at, last_failure_at, last_duration_ms, last_item_count, last_error, updated_at FROM source_diagnostics ORDER BY source"
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[allow(dead_code)]
pub async fn get_diagnostic(
    pool: &SqlitePool,
    source: &str,
) -> Result<Option<SourceDiagnostic>, AppError> {
    let row: Option<SourceDiagnostic> = sqlx::query_as(
        "SELECT source, source_type, enabled, market_mode, local_path, last_success_at, last_failure_at, last_duration_ms, last_item_count, last_error, updated_at FROM source_diagnostics WHERE source = ?"
    )
    .bind(source)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}
