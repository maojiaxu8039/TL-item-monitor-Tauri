// db/repo_config.rs
use sqlx::sqlite::SqlitePool;

pub async fn get_config(pool: &SqlitePool, key: &str) -> Result<Option<String>, crate::core::errors::AppError> {
    let result: Option<(String,)> = sqlx::query_as("SELECT value FROM app_meta WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await
        ?;

    Ok(result.map(|r| r.0))
}

pub async fn save_config(pool: &SqlitePool, key: &str, value: &str) -> Result<(), crate::core::errors::AppError> {
    sqlx::query("INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)")
        .bind(key)
        .bind(value)
        .bind(chrono::Utc::now().timestamp())
        .execute(pool)
        .await
        ?;
    Ok(())
}
