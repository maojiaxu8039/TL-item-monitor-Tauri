use crate::db::models::{Item, SectionItem};
use sqlx::SqlitePool;

pub async fn search_items(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    keyword: &str,
    page: i64,
    page_size: i64,
) -> Result<(Vec<Item>, i64), crate::core::errors::AppError> {
    let offset = (page - 1) * page_size;
    let pattern = format!("%{}%", keyword);

    let items: Vec<Item> = sqlx::query_as(
        r#"
        SELECT item_id, season_id, market_mode, name, item_type, source, price, last_time, updated_at
        FROM items
        WHERE season_id = ? AND market_mode = ? AND name LIKE ?
        ORDER BY name
        LIMIT ? OFFSET ?
        "#,
    )
    .bind(season_id)
    .bind(market_mode)
    .bind(&pattern)
    .bind(page_size)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    let total: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM items WHERE season_id = ? AND market_mode = ? AND name LIKE ?",
    )
    .bind(season_id)
    .bind(market_mode)
    .bind(&pattern)
    .fetch_one(pool)
    .await?;

    Ok((items, total.0))
}

/// Count ALL items regardless of season/market_mode.
pub async fn get_items_count(pool: &SqlitePool) -> Result<i64, crate::core::errors::AppError> {
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM items")
        .fetch_one(pool)
        .await?;
    Ok(count)
}

/// Bulk upsert items using INSERT OR REPLACE, batched in groups of 100.
/// Uses a transaction: if any batch fails, all changes are rolled back.
pub async fn bulk_insert_items(pool: &SqlitePool, items: &[Item]) -> Result<(), crate::core::errors::AppError> {
    let mut tx = pool.begin().await?;
    const BATCH_SIZE: usize = 100;
    for chunk in items.chunks(BATCH_SIZE) {
        let mut qb: sqlx::query_builder::QueryBuilder<sqlx::Sqlite> =
            sqlx::query_builder::QueryBuilder::new(
                "INSERT OR REPLACE INTO items (item_id, season_id, market_mode, name, item_type, source, price, last_time, updated_at) "
            );
        qb.push_values(chunk, |mut b, item| {
            b.push_bind(&item.item_id)
                .push_bind(&item.season_id)
                .push_bind(&item.market_mode)
                .push_bind(&item.name)
                .push_bind(&item.item_type)
                .push_bind(&item.source)
                .push_bind(item.price)
                .push_bind(item.last_time)
                .push_bind(item.updated_at);
        });
        qb.build().execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn get_db_record_count(pool: &SqlitePool) -> Result<i64, crate::core::errors::AppError> {
    let (count,): (i64,) = sqlx::query_as(
        "SELECT (SELECT COUNT(*) FROM items) + (SELECT COUNT(*) FROM fire_price_records) + (SELECT COUNT(*) FROM section_items)"
    )
    .fetch_one(pool)
    .await?;
    Ok(count)
}

pub async fn get_distinct_item_types(pool: &SqlitePool) -> Result<Vec<String>, crate::core::errors::AppError> {
    let types: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT item_type FROM items WHERE item_type IS NOT NULL AND item_type != '' ORDER BY item_type"
    )
    .fetch_all(pool)
    .await?;
    Ok(types.into_iter().map(|(t,)| t).collect())
}

pub async fn get_items_by_season(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<Item>, crate::core::errors::AppError> {
    let items: Vec<Item> = sqlx::query_as(
        r#"
        SELECT item_id, season_id, market_mode, name, item_type, source, price, last_time, updated_at
        FROM items
        WHERE season_id = ? AND market_mode = ?
        "#
    )
    .bind(season_id)
    .bind(market_mode)
    .fetch_all(pool)
    .await?;
    Ok(items)
}

pub async fn get_item_previous_price(
    pool: &SqlitePool,
    item_id: &str,
    season_id: &str,
    market_mode: &str,
    seconds_ago: i64,
) -> Result<Option<f64>, crate::core::errors::AppError> {
    let now = chrono::Utc::now().timestamp();
    let cutoff = now - seconds_ago;

    let result: Option<(f64,)> = sqlx::query_as(
        r#"
        SELECT price FROM items
        WHERE item_id = ? AND season_id = ? AND market_mode = ? AND updated_at <= ?
        ORDER BY updated_at DESC
        LIMIT 1
        "#
    )
    .bind(item_id)
    .bind(season_id)
    .bind(market_mode)
    .bind(cutoff)
    .fetch_optional(pool)
    .await?;

    Ok(result.map(|(p,)| p))
}

pub async fn get_all_section_items(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<SectionItem>, crate::core::errors::AppError> {
    let items: Vec<SectionItem> = sqlx::query_as(
        r#"
        SELECT si.id, si.section_id, si.season_id, si.market_mode, si.item_id,
               i.name as item_name, i.item_type as item_type, i.price as current_price,
               si.purchase_fire_price, si.count, si.more_value, si.sort_order,
               CASE WHEN i.last_time IS NOT NULL THEN CAST(i.last_time AS TEXT) ELSE NULL END as last_time,
               si.created_at, si.updated_at
        FROM section_items si
        LEFT JOIN items i ON si.item_id = i.item_id AND si.season_id = i.season_id AND si.market_mode = i.market_mode
        WHERE si.season_id = ? AND si.market_mode = ?
        "#
    )
    .bind(season_id)
    .bind(market_mode)
    .fetch_all(pool)
    .await?;
    Ok(items)
}

pub async fn get_all_items(pool: &SqlitePool) -> Result<Vec<Item>, crate::core::errors::AppError> {
    let items: Vec<Item> = sqlx::query_as(
        r#"
        SELECT item_id, season_id, market_mode, name, item_type, source, price, last_time, updated_at
        FROM items
        ORDER BY name
        "#,
    )
    .fetch_all(pool)
    .await?;
    Ok(items)
}

pub async fn clear_all_items(pool: &SqlitePool) -> Result<(), crate::core::errors::AppError> {
    sqlx::query("DELETE FROM items")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM section_items")
        .execute(pool)
        .await?;
    Ok(())
}
