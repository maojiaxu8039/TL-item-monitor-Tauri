use crate::core::constants::BATCH_SIZE_LARGE;
use crate::db::models::Item;
use crate::db::table_resolver::TableResolver;
use sqlx::SqlitePool;

/// Normalize item_type: fix corrupted UTF-8 and merge similar types.
/// Returns the normalized type string.
pub fn normalize_item_type(raw: &str) -> String {
    if raw.contains('\u{FFFD}') || raw.chars().any(|c| c as u32 > 0xFFFD) {
        if raw.contains("崇高") || raw.contains("华贵") {
            return "崇高华贵".to_string();
        }
        if raw.contains("精密") || raw.contains("技能") {
            return "精密技能".to_string();
        }
        if raw.contains("核心") || raw.contains("器官") || raw.contains("腰带") {
            return "核心器官".to_string();
        }
        if raw.contains("辅助") {
            return "辅助技能".to_string();
        }
        return "其他".to_string();
    }

    if raw.starts_with("核心器官") {
        return "核心器官".to_string();
    }

    match raw {
        "命运相关" => "命运".to_string(),
        "特殊器官-其它" => "特殊器官".to_string(),
        "完美心脏-增益" => "特殊器官".to_string(),
        "狩猎之神" | "欺诈之神" | "知识之神" | "征战之神" | "机械之神" | "巨力之神" => {
            "石板".to_string()
        }
        _ => raw.to_string(),
    }
}

/// One-time fix: update corrupted item_type values in DB tables.
pub async fn fix_corrupted_item_types(pool: &SqlitePool) -> Result<u64, crate::core::errors::AppError> {
    let seasons = get_all_season_ids(pool).await?;
    let modes = ["season_normal", "season_expert"];
    let mut total_fixed = 0u64;

    for season_id in &seasons {
        for mode in &modes {
            if TableResolver::validate(season_id, mode).is_err() {
                continue;
            }
            let table = TableResolver::items_table(season_id, mode);
            let rows: Vec<(String, String)> = sqlx::query_as(&format!(
                "SELECT item_id, item_type FROM {} WHERE item_type IS NOT NULL AND item_type != ''",
                table
            ))
            .fetch_all(pool)
            .await?;

            let mut updates: Vec<(String, String)> = Vec::new();
            for (item_id, raw_type) in &rows {
                let normalized = normalize_item_type(raw_type);
                if normalized != *raw_type {
                    updates.push((normalized, item_id.clone()));
                }
            }

            for (new_type, item_id) in &updates {
                sqlx::query(&format!(
                    "UPDATE {} SET item_type = ? WHERE item_id = ?",
                    table
                ))
                .bind(new_type)
                .bind(item_id)
                .execute(pool)
                .await?;
                total_fixed += 1;
            }
        }
    }

    if total_fixed > 0 {
        tracing::info!("[ITEM-TYPES] Fixed {} corrupted item_type values", total_fixed);
    }
    Ok(total_fixed)
}

async fn get_all_season_ids(
    pool: &SqlitePool,
) -> Result<Vec<String>, crate::core::errors::AppError> {
    let seasons: Vec<(String,)> = sqlx::query_as("SELECT id FROM seasons ORDER BY started_at DESC")
        .fetch_all(pool)
        .await?;
    Ok(seasons.into_iter().map(|(s,)| s).collect())
}

/// Search items from real-time table.
/// Returns current season items with real-time prices.
#[allow(clippy::too_many_arguments)]
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
    TableResolver::validate(season_id, market_mode)?;
    let items_table = TableResolver::items_table(season_id, market_mode);

    let mut conditions = vec!["name LIKE ?".to_string()];
    if day_filter.is_some() {
        conditions.push("season_day = ?".to_string());
    }
    if type_filter.is_some() {
        conditions.push("item_type = ?".to_string());
    }
    let where_clause = conditions.join(" AND ");

    let count_sql = format!(
        "SELECT COUNT(*) FROM {} WHERE {}",
        items_table, where_clause
    );
    let mut count_query = sqlx::query_as(&count_sql).bind(&pattern);
    if let Some(day) = day_filter {
        count_query = count_query.bind(day);
    }
    if let Some(t) = type_filter {
        count_query = count_query.bind(t);
    }
    let (total,): (i64,) = count_query.fetch_one(pool).await?;

    let items_sql = format!(
        r#"
            SELECT 
                item_id, 
                '{}' as season_id, 
                '{}' as market_mode, 
                name, 
                item_type, 
                source, 
                price, 
                last_time, 
                updated_at
            FROM {}
            WHERE {}
            ORDER BY name
            LIMIT ? OFFSET ?
            "#,
        season_id, market_mode, items_table, where_clause
    );
    let mut items_query = sqlx::query_as(&items_sql).bind(&pattern);
    if let Some(day) = day_filter {
        items_query = items_query.bind(day);
    }
    if let Some(t) = type_filter {
        items_query = items_query.bind(t);
    }
    let items: Vec<Item> = items_query
        .bind(page_size)
        .bind(offset)
        .fetch_all(pool)
        .await?;

    Ok((items, total))
}

/// Count items in the real-time table (items_normal/expert).
/// Used by dashboard to show current season's monitored item count.
pub async fn get_items_count(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<i64, crate::core::errors::AppError> {
    TableResolver::validate(season_id, market_mode)?;
    let items_table = TableResolver::items_table(season_id, market_mode);
    let (count,): (i64,) = sqlx::query_as(&format!(
        "SELECT COUNT(DISTINCT item_id) FROM {}",
        items_table
    ))
    .fetch_one(pool)
    .await?;
    Ok(count)
}

pub async fn get_latest_items_updated_at(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Option<i64>, crate::core::errors::AppError> {
    TableResolver::validate(season_id, market_mode)?;
    let items_table = TableResolver::items_table(season_id, market_mode);
    let latest: Option<i64> =
        sqlx::query_scalar(&format!("SELECT MAX(updated_at) FROM {}", items_table))
            .fetch_one(pool)
            .await?;
    Ok(latest)
}

/// Replace items in the real-time table with the latest full scrape.
/// The upstream item source returns a complete list, so rows missing from the
/// new scrape must be removed to avoid showing stale prices as current data.
pub async fn bulk_insert_items(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    items: &[Item],
) -> Result<(), crate::core::errors::AppError> {
    if items.is_empty() {
        return Ok(());
    }

    // Real-time tables don't have season suffix, but we pass season_id for consistency
    TableResolver::validate(season_id, market_mode)?;
    let table = TableResolver::items_table(season_id, market_mode);
    let mut tx = pool.begin().await?;

    sqlx::query(&format!("DELETE FROM {}", table))
        .execute(&mut *tx)
        .await?;

    for chunk in items.chunks(BATCH_SIZE_LARGE) {
        let mut qb: sqlx::query_builder::QueryBuilder<sqlx::Sqlite> =
            sqlx::query_builder::QueryBuilder::new(&format!(
                "INSERT INTO {} (item_id, name, item_type, source, price, last_time, updated_at) ",
                table
            ));
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
    let mut total = 0i64;
    let season_ids = get_all_season_ids(pool).await?;

    for season in &season_ids {
        for mode in ["season_normal", "season_expert"] {
            TableResolver::validate(season, mode)?;
            let snapshots_table = TableResolver::item_snapshots_table(season, mode);
            TableResolver::validate(season, mode)?;
            let fire_snapshots_table = TableResolver::fire_price_snapshots_table(season, mode);

            let item_sql = format!("SELECT COUNT(DISTINCT item_id) FROM {}", snapshots_table);
            let fire_sql = format!("SELECT COUNT(*) FROM {}", fire_snapshots_table);

            let (item_count, fire_count) = tokio::join!(
                sqlx::query_as::<_, (i64,)>(&item_sql).fetch_one(pool),
                sqlx::query_as::<_, (i64,)>(&fire_sql).fetch_one(pool)
            );

            if let Ok(count) = item_count {
                total += count.0;
            }
            if let Ok(count) = fire_count {
                total += count.0;
            }
        }
    }

    Ok(total)
}

pub async fn get_distinct_item_types(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<String>, crate::core::errors::AppError> {
    TableResolver::validate(season_id, market_mode)?;
    let items_table = TableResolver::items_table(season_id, market_mode);
    let types: Vec<(String,)> = sqlx::query_as(
        &format!(
            "SELECT DISTINCT item_type FROM {} WHERE item_type IS NOT NULL AND item_type != '' ORDER BY item_type",
            items_table
        )
    )
    .fetch_all(pool)
    .await?;

    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for (t,) in types {
        let normalized = normalize_item_type(&t);
        if seen.insert(normalized.clone()) {
            result.push(normalized);
        }
    }
    result.sort();
    Ok(result)
}

/// Get latest items from snapshot table for a season.
/// Returns the most recent snapshot for each item.
pub async fn get_items_by_season(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<Item>, crate::core::errors::AppError> {
    TableResolver::validate(season_id, market_mode)?;
    let snapshots_table = TableResolver::item_snapshots_table(season_id, market_mode);
    let items: Vec<Item> = sqlx::query_as(&format!(
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
    ))
    .fetch_all(pool)
    .await?;
    Ok(items)
}

/// Get items from real-time table (items_normal/expert).
/// Used to load items_cache on startup for snapshot tasks.
pub async fn get_items_from_realtime_table(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<Item>, crate::core::errors::AppError> {
    TableResolver::validate(season_id, market_mode)?;
    let items_table = TableResolver::items_table(season_id, market_mode);
    let items: Vec<Item> = sqlx::query_as(&format!(
        r#"
            SELECT
                item_id,
                '{}' as season_id,
                '{}' as market_mode,
                name,
                item_type,
                source,
                price,
                last_time,
                updated_at
            FROM {}
            ORDER BY name
            "#,
        season_id, market_mode, items_table
    ))
    .fetch_all(pool)
    .await?;
    Ok(items)
}

/// Clear snapshot items for a season (not real-time tables).
pub async fn clear_items(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<(), crate::core::errors::AppError> {
    TableResolver::validate(season_id, market_mode)?;
    let snapshots_table = TableResolver::item_snapshots_table(season_id, market_mode);
    sqlx::query(&format!("DELETE FROM {}", snapshots_table))
        .execute(pool)
        .await?;
    Ok(())
}

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ItemSearchResult {
    pub item_id: String,
    pub name: String,
    pub item_type: String,
    pub price: f64,
}

pub async fn search_items_simple(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
    keyword: &str,
) -> Result<Vec<ItemSearchResult>, crate::core::errors::AppError> {
    TableResolver::validate(season_id, market_mode)?;
    let items_table = TableResolver::items_table(season_id, market_mode);
    let pattern = format!("%{}%", keyword);

    let items: Vec<ItemSearchResult> = sqlx::query_as(&format!(
        r#"
            SELECT item_id, name, item_type, price
            FROM {}
            WHERE name LIKE ?
            ORDER BY name
            LIMIT 50
            "#,
        items_table
    ))
    .bind(&pattern)
    .fetch_all(pool)
    .await?;

    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("test sqlite pool should connect");

        sqlx::query(
            r#"
            CREATE TABLE items_normal (
                item_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                item_type TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT '',
                price REAL NOT NULL DEFAULT 0,
                last_time INTEGER,
                updated_at INTEGER NOT NULL
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("items_normal table should be created");

        pool
    }

    fn item(id: &str, price: f64) -> Item {
        Item {
            item_id: id.to_string(),
            season_id: "ss12".to_string(),
            market_mode: "season_normal".to_string(),
            name: format!("Item {id}"),
            item_type: "材料".to_string(),
            source: "test".to_string(),
            price,
            last_time: Some(1000),
            updated_at: 1000,
        }
    }

    #[tokio::test]
    async fn full_refresh_removes_items_missing_from_latest_scrape() {
        let pool = test_pool().await;

        bulk_insert_items(
            &pool,
            "ss12",
            "season_normal",
            &[item("a", 1.0), item("b", 2.0)],
        )
        .await
        .expect("first full refresh should insert");
        assert_eq!(
            get_items_count(&pool, "ss12", "season_normal")
                .await
                .expect("count should load"),
            2
        );

        bulk_insert_items(&pool, "ss12", "season_normal", &[item("a", 3.0)])
            .await
            .expect("second full refresh should replace");

        let rows: Vec<(String, f64)> =
            sqlx::query_as("SELECT item_id, price FROM items_normal ORDER BY item_id")
                .fetch_all(&pool)
                .await
                .expect("items should load");
        assert_eq!(rows, vec![("a".to_string(), 3.0)]);
    }
}
