use crate::db::models::{Section, SectionItem};
use crate::db::table_resolver::TableResolver;
use chrono::Utc;
use sqlx::SqlitePool;

#[derive(Debug, Clone, serde::Serialize, sqlx::FromRow)]
pub struct SectionAlertItem {
    pub id: String,
    pub section_id: String,
    pub section_name: String,
    pub item_id: String,
    pub item_name: String,
    pub item_type: Option<String>,
    pub current_price: Option<f64>,
    pub purchase_fire_price: f64,
    pub count: i32,
    pub more_value: f64,
}

pub async fn get_sections(
    pool: &SqlitePool,
    market_mode: &str,
) -> Result<Vec<Section>, crate::core::errors::AppError> {
    let sections: Vec<Section> = sqlx::query_as(
        "SELECT id, name, strategy_id, market_mode, sort_order, collapsed, created_at, updated_at FROM sections WHERE market_mode = ? ORDER BY sort_order"
    )
    .bind(market_mode)
    .fetch_all(pool)
    .await?;
    Ok(sections)
}

pub async fn create_section(
    pool: &SqlitePool,
    name: &str,
    market_mode: &str,
) -> Result<Section, crate::core::errors::AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let max_order: Option<(i32,)> =
        sqlx::query_as("SELECT COALESCE(MAX(sort_order), 0) FROM sections WHERE market_mode = ?")
            .bind(market_mode)
            .fetch_optional(pool)
            .await?;
    let sort_order = max_order.map(|r| r.0 + 1).unwrap_or(0);

    sqlx::query(
        "INSERT INTO sections (id, name, market_mode, sort_order, collapsed, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)"
    )
    .bind(&id)
    .bind(name)
    .bind(market_mode)
    .bind(sort_order)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(Section {
        id,
        name: name.to_string(),
        strategy_id: None,
        market_mode: market_mode.to_string(),
        sort_order,
        collapsed: 0,
        created_at: now,
        updated_at: now,
    })
}

pub async fn update_section(
    pool: &SqlitePool,
    id: &str,
    name: &str,
) -> Result<(), crate::core::errors::AppError> {
    let now = Utc::now().timestamp();
    sqlx::query("UPDATE sections SET name = ?, updated_at = ? WHERE id = ?")
        .bind(name)
        .bind(now)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_section(
    pool: &SqlitePool,
    id: &str,
    market_mode: &str,
) -> Result<(), crate::core::errors::AppError> {
    sqlx::query("DELETE FROM sections WHERE id = ? AND market_mode = ?")
        .bind(id)
        .bind(market_mode)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn reorder_sections(
    pool: &SqlitePool,
    ids: &[String],
) -> Result<(), crate::core::errors::AppError> {
    let mut tx = pool.begin().await?;
    let now = Utc::now().timestamp();
    for (i, id) in ids.iter().enumerate() {
        sqlx::query("UPDATE sections SET sort_order = ?, updated_at = ? WHERE id = ?")
            .bind(i as i32)
            .bind(now)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn get_section_items(
    pool: &SqlitePool,
    section_id: &str,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<SectionItem>, crate::core::errors::AppError> {
    TableResolver::validate(season_id, market_mode)?;
    let items_table = TableResolver::items_table(season_id, market_mode);
    let rows: Vec<SectionItem> = sqlx::query_as(&format!(
        r#"
        SELECT
            si.id, si.section_id, si.season_id, si.market_mode, si.item_id,
            COALESCE(i.name, si.item_id) as item_name,
            i.item_type as item_type,
            i.price as current_price,
            si.purchase_fire_price, si.count, si.more_value, si.sort_order,
            CAST(i.last_time AS TEXT) as last_time,
            si.created_at, si.updated_at
        FROM section_items si
        LEFT JOIN {} i ON si.item_id = i.item_id
        WHERE si.section_id = ? AND si.season_id = ? AND si.market_mode = ?
        ORDER BY si.sort_order, si.created_at
        "#,
        items_table
    ))
    .bind(section_id)
    .bind(season_id)
    .bind(market_mode)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn get_section_items_for_context(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<SectionAlertItem>, crate::core::errors::AppError> {
    TableResolver::validate(season_id, market_mode)?;
    let items_table = TableResolver::items_table(season_id, market_mode);
    let rows: Vec<SectionAlertItem> = sqlx::query_as(&format!(
        r#"
        SELECT
            si.id,
            si.section_id,
            s.name as section_name,
            si.item_id,
            COALESCE(i.name, si.item_id) as item_name,
            i.item_type as item_type,
            i.price as current_price,
            si.purchase_fire_price,
            si.count,
            si.more_value
        FROM section_items si
        INNER JOIN sections s ON s.id = si.section_id
        LEFT JOIN {} i ON si.item_id = i.item_id
        WHERE si.season_id = ? AND si.market_mode = ?
        ORDER BY s.sort_order, si.sort_order, si.created_at
        "#,
        items_table
    ))
    .bind(season_id)
    .bind(market_mode)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

#[allow(clippy::too_many_arguments)]
pub async fn add_section_item(
    pool: &SqlitePool,
    section_id: &str,
    season_id: &str,
    market_mode: &str,
    item_id: &str,
    purchase_fire_price: f64,
    count: i32,
    more_value: f64,
) -> Result<SectionItem, crate::core::errors::AppError> {
    // Check if item already exists in this section
    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM section_items WHERE section_id = ? AND item_id = ? AND season_id = ? AND market_mode = ?"
    )
    .bind(section_id)
    .bind(item_id)
    .bind(season_id)
    .bind(market_mode)
    .fetch_optional(pool)
    .await?;

    if existing.is_some() {
        return Err(crate::core::errors::AppError::Validation(
            "物品已存在于该分组中".to_string(),
        ));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    TableResolver::validate(season_id, market_mode)?;

    let items_table = TableResolver::items_table(season_id, market_mode);
    let last_time: Option<String> = sqlx::query_scalar::<_, Option<i64>>(&format!(
        "SELECT last_time FROM {} WHERE item_id = ?",
        items_table
    ))
    .bind(item_id)
    .fetch_optional(pool)
    .await?
    .flatten()
    .map(|ts| ts.to_string());

    sqlx::query(
        r#"INSERT INTO section_items (id, section_id, season_id, market_mode, item_id, purchase_fire_price, count, more_value, sort_order, last_time, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)"#
    )
    .bind(&id)
    .bind(section_id)
    .bind(season_id)
    .bind(market_mode)
    .bind(item_id)
    .bind(purchase_fire_price)
    .bind(count)
    .bind(more_value)
    .bind(last_time.as_ref())
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(SectionItem {
        id,
        section_id: section_id.to_string(),
        season_id: season_id.to_string(),
        market_mode: market_mode.to_string(),
        item_id: item_id.to_string(),
        item_name: None,
        item_type: None,
        current_price: None,
        purchase_fire_price,
        count,
        more_value,
        sort_order: 0,
        last_time,
        created_at: now,
        updated_at: now,
    })
}

pub async fn update_section_item(
    pool: &SqlitePool,
    section_id: &str,
    season_id: &str,
    market_mode: &str,
    item_id: &str,
    count: Option<i32>,
    more_value: Option<f64>,
    purchase_fire_price: Option<f64>,
    last_time: Option<&str>,
) -> Result<(), crate::core::errors::AppError> {
    TableResolver::validate(season_id, market_mode)?;
    let mut tx = pool.begin().await?;
    let now = Utc::now().timestamp();

    if let Some(c) = count {
        sqlx::query("UPDATE section_items SET count = ?, updated_at = ? WHERE section_id = ? AND season_id = ? AND market_mode = ? AND item_id = ?")
            .bind(c).bind(now).bind(section_id).bind(season_id).bind(market_mode).bind(item_id)
            .execute(&mut *tx).await?;
    }
    if let Some(mv) = more_value {
        sqlx::query("UPDATE section_items SET more_value = ?, updated_at = ? WHERE section_id = ? AND season_id = ? AND market_mode = ? AND item_id = ?")
            .bind(mv).bind(now).bind(section_id).bind(season_id).bind(market_mode).bind(item_id)
            .execute(&mut *tx).await?;
    }
    if let Some(p) = purchase_fire_price {
        sqlx::query("UPDATE section_items SET purchase_fire_price = ?, updated_at = ? WHERE section_id = ? AND season_id = ? AND market_mode = ? AND item_id = ?")
            .bind(p).bind(now).bind(section_id).bind(season_id).bind(market_mode).bind(item_id)
            .execute(&mut *tx).await?;
    }
    if let Some(lt) = last_time {
        sqlx::query("UPDATE section_items SET last_time = ?, updated_at = ? WHERE section_id = ? AND season_id = ? AND market_mode = ? AND item_id = ?")
            .bind(lt).bind(now).bind(section_id).bind(season_id).bind(market_mode).bind(item_id)
            .execute(&mut *tx).await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn remove_section_item(
    pool: &SqlitePool,
    section_id: &str,
    season_id: &str,
    market_mode: &str,
    item_id: &str,
) -> Result<(), crate::core::errors::AppError> {
    TableResolver::validate(season_id, market_mode)?;
    sqlx::query(
        "DELETE FROM section_items WHERE section_id = ? AND season_id = ? AND market_mode = ? AND item_id = ?",
    )
        .bind(section_id)
        .bind(season_id)
        .bind(market_mode)
        .bind(item_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Calculate total fire and total RMB for all section items in current context.
pub async fn get_totals(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<(f64, f64), crate::core::errors::AppError> {
    TableResolver::validate(season_id, market_mode)?;
    let items_table = TableResolver::items_table(season_id, market_mode);
    let rows: Vec<(f64, i32, Option<f64>)> = sqlx::query_as(&format!(
        r#"
            SELECT si.purchase_fire_price, si.count, i.price as current_price
            FROM section_items si
            LEFT JOIN {} i ON si.item_id = i.item_id
            WHERE si.season_id = ? AND si.market_mode = ?
            "#,
        items_table
    ))
    .bind(season_id)
    .bind(market_mode)
    .fetch_all(pool)
    .await?;

    let mut total_fire: f64 = 0.0;
    let mut total_rmb: f64 = 0.0;

    for (purchase_fire_price, count, current_price) in rows {
        let count_f = count as f64;
        total_fire += purchase_fire_price * count_f;
        if let Some(price) = current_price {
            total_rmb += price * count_f;
        }
    }

    Ok((total_fire, total_rmb))
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

        for sql in [
            r#"
            CREATE TABLE sections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                strategy_id TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                collapsed INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            "#,
            r#"
            CREATE TABLE section_items (
                id TEXT PRIMARY KEY,
                section_id TEXT NOT NULL,
                season_id TEXT NOT NULL DEFAULT 'current',
                market_mode TEXT NOT NULL DEFAULT 'season_normal',
                item_id TEXT NOT NULL,
                purchase_fire_price REAL NOT NULL DEFAULT 0,
                count INTEGER NOT NULL DEFAULT 1,
                more_value REAL NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                last_time TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            "#,
            r#"
            CREATE TABLE items_normal (
                item_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                item_type TEXT,
                price REAL,
                last_time INTEGER
            )
            "#,
            r#"
            CREATE TABLE items_expert (
                item_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                item_type TEXT,
                price REAL,
                last_time INTEGER
            )
            "#,
        ] {
            sqlx::query(sql)
                .execute(&pool)
                .await
                .expect("test table should be created");
        }

        sqlx::query(
            "INSERT INTO sections (id, name, sort_order, collapsed, created_at, updated_at) VALUES ('section-1', '分组', 0, 0, 1, 1)",
        )
        .execute(&pool)
        .await
        .expect("section should insert");

        sqlx::query("INSERT INTO items_normal (item_id, name, item_type, price, last_time) VALUES ('item-1', '普通物品', '材料', 10, 100)")
            .execute(&pool)
            .await
            .expect("normal item should insert");
        sqlx::query("INSERT INTO items_expert (item_id, name, item_type, price, last_time) VALUES ('item-1', '专家物品', '材料', 20, 200)")
            .execute(&pool)
            .await
            .expect("expert item should insert");

        sqlx::query(
            r#"
            INSERT INTO section_items
            (id, section_id, season_id, market_mode, item_id, purchase_fire_price, count, more_value, sort_order, created_at, updated_at)
            VALUES
            ('normal-row', 'section-1', 'ss12', 'season_normal', 'item-1', 10, 1, 0, 0, 1, 1),
            ('expert-row', 'section-1', 'ss12', 'season_expert', 'item-1', 20, 2, 0, 0, 1, 1)
            "#,
        )
        .execute(&pool)
        .await
        .expect("section items should insert");

        pool
    }

    #[tokio::test]
    async fn get_section_items_filters_by_market_context() {
        let pool = test_pool().await;

        let normal = get_section_items(&pool, "section-1", "ss12", "season_normal")
            .await
            .expect("normal section items should load");
        assert_eq!(normal.len(), 1);
        assert_eq!(normal[0].id, "normal-row");
        assert_eq!(normal[0].item_name.as_deref(), Some("普通物品"));

        let expert = get_section_items(&pool, "section-1", "ss12", "season_expert")
            .await
            .expect("expert section items should load");
        assert_eq!(expert.len(), 1);
        assert_eq!(expert[0].id, "expert-row");
        assert_eq!(expert[0].item_name.as_deref(), Some("专家物品"));
    }

    #[tokio::test]
    async fn update_and_remove_section_item_only_touch_selected_context() {
        let pool = test_pool().await;

        update_section_item(
            &pool,
            "section-1",
            "ss12",
            "season_normal",
            "item-1",
            Some(9),
            None,
            Some(99.0),
            None,
        )
        .await
        .expect("normal row should update");

        let rows: Vec<(String, f64, i32)> =
            sqlx::query_as("SELECT id, purchase_fire_price, count FROM section_items ORDER BY id")
                .fetch_all(&pool)
                .await
                .expect("rows should load");
        assert_eq!(
            rows,
            vec![
                ("expert-row".to_string(), 20.0, 2),
                ("normal-row".to_string(), 99.0, 9),
            ]
        );

        remove_section_item(&pool, "section-1", "ss12", "season_normal", "item-1")
            .await
            .expect("normal row should delete");

        let remaining: Vec<String> = sqlx::query_scalar("SELECT id FROM section_items ORDER BY id")
            .fetch_all(&pool)
            .await
            .expect("remaining ids should load");
        assert_eq!(remaining, vec!["expert-row".to_string()]);
    }
}
