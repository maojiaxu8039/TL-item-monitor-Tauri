use crate::db::models::Item;
use crate::db::table_resolver::TableResolver;
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
    let table = TableResolver::items_table(season_id, market_mode);

    let items: Vec<Item> = sqlx::query_as(
        &format!(
            r#"
            SELECT item_id, '{}' as season_id, '{}' as market_mode, name, item_type, source, price, last_time, updated_at
            FROM {}
            WHERE name LIKE ?
            ORDER BY name
            LIMIT ? OFFSET ?
            "#,
            season_id, market_mode, table
        ),
    )
    .bind(&pattern)
    .bind(page_size)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    let total: (i64,) = sqlx::query_as(
        &format!("SELECT COUNT(*) FROM {} WHERE name LIKE ?", table),
    )
    .bind(&pattern)
    .fetch_one(pool)
    .await?;

    Ok((items, total.0))
}

/// Count items in a specific season/mode table.
pub async fn get_items_count(pool: &SqlitePool, season_id: &str, market_mode: &str) -> Result<i64, crate::core::errors::AppError> {
    let table = TableResolver::items_table(season_id, market_mode);
    let (count,): (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {}", table))
        .fetch_one(pool)
        .await?;
    Ok(count)
}

/// Bulk upsert items into the season/mode specific table.
pub async fn bulk_insert_items(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    items: &[Item],
) -> Result<(), crate::core::errors::AppError> {
    if items.is_empty() {
        return Ok(());
    }
    
    let table = TableResolver::items_table(season_id, market_mode);
    let mut tx = pool.begin().await?;
    const BATCH_SIZE: usize = 100;
    
    for chunk in items.chunks(BATCH_SIZE) {
        let mut qb: sqlx::query_builder::QueryBuilder<sqlx::Sqlite> =
            sqlx::query_builder::QueryBuilder::new(
                &format!("INSERT OR REPLACE INTO {} (item_id, name, item_type, source, price, last_time, updated_at) ", table)
            );
        qb.push_values(chunk, |mut b, item| {
            b.push_bind(&item.item_id)
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
    // Sum counts from all split tables
    let mut total = 0i64;
    for (season, mode) in TableResolver::supported_combinations() {
        let items_table = TableResolver::items_table(season, mode);
        let fire_table = TableResolver::fire_price_table(season, mode);
        
        let count: (i64,) = sqlx::query_as(
            &format!(
                "SELECT (SELECT COUNT(*) FROM {}) + (SELECT COUNT(*) FROM {})",
                items_table, fire_table
            )
        )
        .fetch_one(pool)
        .await?;
        total += count.0;
    }
    Ok(total)
}

pub async fn get_distinct_item_types(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<String>, crate::core::errors::AppError> {
    let table = TableResolver::items_table(season_id, market_mode);
    let types: Vec<(String,)> = sqlx::query_as(
        &format!(
            "SELECT DISTINCT item_type FROM {} WHERE item_type IS NOT NULL AND item_type != '' ORDER BY item_type",
            table
        )
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
    let table = TableResolver::items_table(season_id, market_mode);
    let items: Vec<Item> = sqlx::query_as(
        &format!(
            r#"
            SELECT item_id, '{}' as season_id, '{}' as market_mode, name, item_type, source, price, last_time, updated_at
            FROM {}
            ORDER BY name
            "#,
            season_id, market_mode, table
        )
    )
    .fetch_all(pool)
    .await?;
    Ok(items)
}

pub async fn get_all_items(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<Item>, crate::core::errors::AppError> {
    get_items_by_season(pool, season_id, market_mode).await
}

pub async fn clear_items(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<(), crate::core::errors::AppError> {
    let table = TableResolver::items_table(season_id, market_mode);
    sqlx::query(&format!("DELETE FROM {}", table))
        .execute(pool)
        .await?;
    Ok(())
}
