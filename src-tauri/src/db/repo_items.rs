use crate::db::models::Item;
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
