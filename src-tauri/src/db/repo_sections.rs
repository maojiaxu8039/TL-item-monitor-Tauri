use crate::db::models::{Section, SectionItem};
use sqlx::SqlitePool;
use chrono::Utc;

pub async fn get_sections(pool: &SqlitePool) -> Result<Vec<Section>, crate::core::errors::AppError> {
    let sections: Vec<Section> = sqlx::query_as(
        "SELECT id, name, strategy_id, sort_order, collapsed, created_at, updated_at FROM sections ORDER BY sort_order"
    )
    .fetch_all(pool)
    .await?;
    Ok(sections)
}

pub async fn create_section(pool: &SqlitePool, name: &str) -> Result<Section, crate::core::errors::AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let max_order: Option<(i32,)> = sqlx::query_as(
        "SELECT COALESCE(MAX(sort_order), 0) FROM sections"
    )
    .fetch_optional(pool)
    .await?;
    let sort_order = max_order.map(|r| r.0 + 1).unwrap_or(0);

    sqlx::query(
        "INSERT INTO sections (id, name, sort_order, collapsed, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)"
    )
    .bind(&id)
    .bind(name)
    .bind(sort_order)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(Section { id, name: name.to_string(), strategy_id: None, sort_order, collapsed: 0, created_at: now, updated_at: now })
}

pub async fn update_section(pool: &SqlitePool, id: &str, name: &str) -> Result<(), crate::core::errors::AppError> {
    let now = Utc::now().timestamp();
    sqlx::query("UPDATE sections SET name = ?, updated_at = ? WHERE id = ?")
        .bind(name)
        .bind(now)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_section(pool: &SqlitePool, id: &str) -> Result<(), crate::core::errors::AppError> {
    sqlx::query("DELETE FROM sections WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn reorder_sections(pool: &SqlitePool, ids: &[String]) -> Result<(), crate::core::errors::AppError> {
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

pub async fn get_section_items(pool: &SqlitePool, section_id: &str) -> Result<Vec<SectionItem>, crate::core::errors::AppError> {
    let items: Vec<SectionItem> = sqlx::query_as(
        r#"
        SELECT
            si.id, si.section_id, si.season_id, si.market_mode, si.item_id,
            i.name as item_name, i.item_type as item_type, i.price as current_price,
            si.purchase_fire_price, si.count, si.more_value, si.sort_order,
            si.last_time, si.created_at, si.updated_at
        FROM section_items si
        LEFT JOIN items i ON si.item_id = i.item_id AND si.season_id = i.season_id AND si.market_mode = i.market_mode
        WHERE si.section_id = ?
        ORDER BY si.sort_order, si.created_at
        "#
    )
    .bind(section_id)
    .fetch_all(pool)
    .await?;
    Ok(items)
}

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
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    sqlx::query(
        r#"INSERT INTO section_items (id, section_id, season_id, market_mode, item_id, purchase_fire_price, count, more_value, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)"#
    )
    .bind(&id)
    .bind(section_id)
    .bind(season_id)
    .bind(market_mode)
    .bind(item_id)
    .bind(purchase_fire_price)
    .bind(count)
    .bind(more_value)
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
        last_time: None,
        created_at: now,
        updated_at: now,
    })
}

pub async fn update_section_item(
    pool: &SqlitePool,
    section_id: &str,
    item_id: &str,
    count: Option<i32>,
    more_value: Option<f64>,
    purchase_fire_price: Option<f64>,
    last_time: Option<&str>,
) -> Result<(), crate::core::errors::AppError> {
    let mut tx = pool.begin().await?;
    let now = Utc::now().timestamp();

    if let Some(c) = count {
        sqlx::query("UPDATE section_items SET count = ?, updated_at = ? WHERE section_id = ? AND item_id = ?")
            .bind(c).bind(now).bind(section_id).bind(item_id)
            .execute(&mut *tx).await?;
    }
    if let Some(mv) = more_value {
        sqlx::query("UPDATE section_items SET more_value = ?, updated_at = ? WHERE section_id = ? AND item_id = ?")
            .bind(mv).bind(now).bind(section_id).bind(item_id)
            .execute(&mut *tx).await?;
    }
    if let Some(p) = purchase_fire_price {
        sqlx::query("UPDATE section_items SET purchase_fire_price = ?, updated_at = ? WHERE section_id = ? AND item_id = ?")
            .bind(p).bind(now).bind(section_id).bind(item_id)
            .execute(&mut *tx).await?;
    }
    if let Some(lt) = last_time {
        sqlx::query("UPDATE section_items SET last_time = ?, updated_at = ? WHERE section_id = ? AND item_id = ?")
            .bind(lt).bind(now).bind(section_id).bind(item_id)
            .execute(&mut *tx).await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn remove_section_item(pool: &SqlitePool, section_id: &str, item_id: &str) -> Result<(), crate::core::errors::AppError> {
    sqlx::query("DELETE FROM section_items WHERE section_id = ? AND item_id = ?")
        .bind(section_id)
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
    let rows: Vec<(f64, i32, Option<f64>)> = sqlx::query_as(
        r#"
        SELECT si.purchase_fire_price, si.count, i.price as current_price
        FROM section_items si
        LEFT JOIN items i ON si.item_id = i.item_id AND si.season_id = i.season_id AND si.market_mode = i.market_mode
        WHERE si.season_id = ? AND si.market_mode = ?
        "#
    )
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
