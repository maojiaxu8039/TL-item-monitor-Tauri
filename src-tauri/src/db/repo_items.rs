use crate::db::models::Item;
use crate::db::table_resolver::TableResolver;
use sqlx::SqlitePool;

/// Calculate season day based on current timestamp.
/// Season day is the number of days since the season start (day 1, 2, 3, ...)
/// TODO: In production, fetch actual season start date from seasons table
pub fn calculate_season_day() -> i32 {
    // Placeholder: returns 1 for now
    // Should be calculated based on season start date
    1
}

/// Get latest item snapshot data for a given season.
/// Uses item_snapshots table to get the most recent price for each item.
pub async fn search_items(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    keyword: &str,
    page: i64,
    page_size: i64,
    day_filter: Option<i32>,
    type_filter: Option<&str>,
) -> Result<(Vec<Item>, i64), crate::core::errors::AppError> {
    let offset = (page - 1) * page_size;
    let pattern = format!("%{}%", keyword);
    let snapshots_table = TableResolver::item_snapshots_table(season_id, market_mode);

    // Get latest snapshot for each item using a subquery
    let mut conditions = vec!["name LIKE ?".to_string()];
    
    if let Some(day) = day_filter {
        conditions.push(format!("season_day = {}", day));
    }
    
    if let Some(item_type) = type_filter {
        if item_type != "all" {
            conditions.push(format!("item_type = '{}'", item_type));
        }
    }
    
    let where_clause = conditions.join(" AND ");

    // Get latest snapshot for each item
    let items: Vec<Item> = sqlx::query_as(
        &format!(
            r#"
            SELECT 
                s.item_id, 
                '{}' as season_id, 
                '{}' as market_mode, 
                s.name, 
                s.item_type, 
                'snapshot' as source, 
                s.fire_price as price, 
                s.scraped_at as last_time, 
                s.season_day, 
                s.scraped_at as updated_at
            FROM {} s
            INNER JOIN (
                SELECT item_id, MAX(scraped_at) as max_scraped_at
                FROM {}
                GROUP BY item_id
            ) latest ON s.item_id = latest.item_id AND s.scraped_at = latest.max_scraped_at
            WHERE {}
            ORDER BY s.name
            LIMIT ? OFFSET ?
            "#,
            season_id, market_mode, snapshots_table, snapshots_table, where_clause
        ),
    )
    .bind(&pattern)
    .bind(page_size)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    let total: (i64,) = sqlx::query_as(
        &format!(
            r#"
            SELECT COUNT(*) FROM (
                SELECT s.item_id
                FROM {} s
                INNER JOIN (
                    SELECT item_id, MAX(scraped_at) as max_scraped_at
                    FROM {}
                    GROUP BY item_id
                ) latest ON s.item_id = latest.item_id AND s.scraped_at = latest.max_scraped_at
                WHERE {}
                GROUP BY s.item_id
            )
            "#,
            snapshots_table, snapshots_table, where_clause
        ),
    )
    .bind(&pattern)
    .fetch_one(pool)
    .await?;

    Ok((items, total.0))
}

/// Count items in the real-time table (items_normal/expert).
/// Used by dashboard to show current season's monitored item count.
pub async fn get_items_count(pool: &SqlitePool, _season_id: &str, market_mode: &str) -> Result<i64, crate::core::errors::AppError> {
    let items_table = TableResolver::items_table("ss12", market_mode);
    let (count,): (i64,) = sqlx::query_as(
        &format!(
            "SELECT COUNT(DISTINCT item_id) FROM {}",
            items_table
        )
    )
    .fetch_one(pool)
    .await?;
    Ok(count)
}

/// Bulk upsert items into the real-time table (for client采集).
/// This updates the real-time items_normal/expert tables.
pub async fn bulk_insert_items(
    pool: &SqlitePool,
    _season_id: &str,
    market_mode: &str,
    items: &[Item],
) -> Result<(), crate::core::errors::AppError> {
    if items.is_empty() {
        return Ok(());
    }
    
    // Real-time tables don't have season suffix
    let table = TableResolver::items_table("ss12", market_mode);
    let season_day = calculate_season_day();
    let mut tx = pool.begin().await?;
    const BATCH_SIZE: usize = 100;
    
    for chunk in items.chunks(BATCH_SIZE) {
        let mut qb: sqlx::query_builder::QueryBuilder<sqlx::Sqlite> =
            sqlx::query_builder::QueryBuilder::new(
                &format!("INSERT OR REPLACE INTO {} (item_id, name, item_type, source, price, last_time, season_day, updated_at) ", table)
            );
        qb.push_values(chunk, |mut b, item| {
            b.push_bind(&item.item_id)
                .push_bind(&item.name)
                .push_bind(&item.item_type)
                .push_bind(&item.source)
                .push_bind(item.price)
                .push_bind(item.last_time)
                .push_bind(season_day)
                .push_bind(item.updated_at);
        });
        qb.build().execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn get_db_record_count(pool: &SqlitePool) -> Result<i64, crate::core::errors::AppError> {
    // Count from snapshot tables only (real-time tables are not season-specific)
    let mut total = 0i64;
    for (season, mode) in TableResolver::supported_combinations() {
        let snapshots_table = TableResolver::item_snapshots_table(season, mode);
        let fire_snapshots_table = TableResolver::fire_price_snapshots_table(season, mode);
        
        let count: (i64,) = sqlx::query_as(
            &format!(
                "SELECT (SELECT COUNT(DISTINCT item_id) FROM {}) + (SELECT COUNT(*) FROM {})",
                snapshots_table, fire_snapshots_table
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
    let snapshots_table = TableResolver::item_snapshots_table(season_id, market_mode);
    let types: Vec<(String,)> = sqlx::query_as(
        &format!(
            "SELECT DISTINCT item_type FROM {} WHERE item_type IS NOT NULL AND item_type != '' ORDER BY item_type",
            snapshots_table
        )
    )
    .fetch_all(pool)
    .await?;
    Ok(types.into_iter().map(|(t,)| t).collect())
}

/// Get latest items from snapshot table for a season.
/// Returns the most recent snapshot for each item.
pub async fn get_items_by_season(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<Item>, crate::core::errors::AppError> {
    let snapshots_table = TableResolver::item_snapshots_table(season_id, market_mode);
    let items: Vec<Item> = sqlx::query_as(
        &format!(
            r#"
            SELECT 
                s.item_id, 
                '{}' as season_id, 
                '{}' as market_mode, 
                s.name, 
                s.item_type, 
                'snapshot' as source, 
                s.fire_price as price, 
                s.scraped_at as last_time, 
                s.season_day, 
                s.scraped_at as updated_at
            FROM {} s
            INNER JOIN (
                SELECT item_id, MAX(scraped_at) as max_scraped_at
                FROM {}
                GROUP BY item_id
            ) latest ON s.item_id = latest.item_id AND s.scraped_at = latest.max_scraped_at
            ORDER BY s.name
            "#,
            season_id, market_mode, snapshots_table, snapshots_table
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

/// Clear snapshot items for a season (not real-time tables).
pub async fn clear_items(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<(), crate::core::errors::AppError> {
    let snapshots_table = TableResolver::item_snapshots_table(season_id, market_mode);
    sqlx::query(&format!("DELETE FROM {}", snapshots_table))
        .execute(pool)
        .await?;
    Ok(())
}
