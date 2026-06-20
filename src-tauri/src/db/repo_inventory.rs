use crate::db::repo_items;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct InventoryPositionRow {
    pub id: String,
    pub season_id: String,
    pub market_mode: String,
    pub item_id: String,
    pub item_name: String,
    pub item_type: String,
    pub buy_price: f64,
    pub quantity: i64,
    pub extra_cost: f64,
    pub fee_rate: f64,
    pub target_sell_price: Option<f64>,
    pub bought_at: i64,
    pub status: String,
    pub sold_price: Option<f64>,
    pub sold_at: Option<i64>,
    pub note: String,
    pub alert_enabled: i32,
    pub last_alert_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryPosition {
    pub id: String,
    pub season_id: String,
    pub market_mode: String,
    pub item_id: String,
    pub item_name: String,
    pub item_type: String,
    pub buy_price: f64,
    pub quantity: i64,
    pub extra_cost: f64,
    pub fee_rate: f64,
    pub target_sell_price: Option<f64>,
    pub bought_at: i64,
    pub status: String,
    pub sold_price: Option<f64>,
    pub sold_at: Option<i64>,
    pub note: String,
    pub alert_enabled: bool,
    pub last_alert_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl From<InventoryPositionRow> for InventoryPosition {
    fn from(row: InventoryPositionRow) -> Self {
        Self {
            id: row.id,
            season_id: row.season_id,
            market_mode: row.market_mode,
            item_id: row.item_id,
            item_name: row.item_name,
            item_type: row.item_type,
            buy_price: row.buy_price,
            quantity: row.quantity,
            extra_cost: row.extra_cost,
            fee_rate: row.fee_rate,
            target_sell_price: row.target_sell_price,
            bought_at: row.bought_at,
            status: row.status,
            sold_price: row.sold_price,
            sold_at: row.sold_at,
            note: row.note,
            alert_enabled: row.alert_enabled != 0,
            last_alert_at: row.last_alert_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryPositionView {
    pub position: InventoryPosition,
    pub current_price: Option<f64>,
    pub break_even_price: f64,
    pub total_cost: f64,
    pub estimated_net_value: Option<f64>,
    pub profit: Option<f64>,
    pub profit_ratio: Option<f64>,
    pub sell_signal: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct InventoryBuyWatchRow {
    pub id: String,
    pub season_id: String,
    pub market_mode: String,
    pub item_id: String,
    pub item_name: String,
    pub item_type: String,
    pub target_buy_price: f64,
    pub max_quantity: Option<i64>,
    pub note: String,
    pub alert_enabled: i32,
    pub auto_create_position: i32,
    pub last_alert_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryBuyWatch {
    pub id: String,
    pub season_id: String,
    pub market_mode: String,
    pub item_id: String,
    pub item_name: String,
    pub item_type: String,
    pub target_buy_price: f64,
    pub max_quantity: Option<i64>,
    pub note: String,
    pub alert_enabled: bool,
    pub auto_create_position: bool,
    pub last_alert_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl From<InventoryBuyWatchRow> for InventoryBuyWatch {
    fn from(row: InventoryBuyWatchRow) -> Self {
        Self {
            id: row.id,
            season_id: row.season_id,
            market_mode: row.market_mode,
            item_id: row.item_id,
            item_name: row.item_name,
            item_type: row.item_type,
            target_buy_price: row.target_buy_price,
            max_quantity: row.max_quantity,
            note: row.note,
            alert_enabled: row.alert_enabled != 0,
            auto_create_position: row.auto_create_position != 0,
            last_alert_at: row.last_alert_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryBuyWatchView {
    pub watch: InventoryBuyWatch,
    pub current_price: Option<f64>,
    pub discount_to_target: Option<f64>,
    pub buy_signal: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventorySummary {
    pub total_cost: f64,
    pub current_value: f64,
    pub profit: f64,
    pub sell_ready_count: i64,
    pub buy_ready_count: i64,
    pub loss_risk_count: i64,
    pub holding_count: i64,
}

fn calc_break_even_price(buy_price: f64, _quantity: i64, extra_cost: f64, fee_rate: f64) -> f64 {
    (buy_price + extra_cost) / (1.0 - fee_rate)
}

fn calc_estimated_net_value(current_price: f64, quantity: i64, fee_rate: f64) -> f64 {
    current_price * quantity as f64 * (1.0 - fee_rate)
}

pub async fn list_positions(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<InventoryPosition>, String> {
    let rows: Vec<InventoryPositionRow> = sqlx::query_as(
        r#"
        SELECT id, season_id, market_mode, item_id, item_name, item_type,
               buy_price, quantity, extra_cost, fee_rate, target_sell_price,
               bought_at, status, sold_price, sold_at, note,
               alert_enabled, last_alert_at, created_at, updated_at
        FROM inventory_positions
        WHERE season_id = ? AND market_mode = ? AND status = 'holding'
        ORDER BY updated_at DESC
        "#,
    )
    .bind(season_id)
    .bind(market_mode)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(InventoryPosition::from).collect())
}

pub async fn list_positions_with_current_price(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<InventoryPositionView>, String> {
    let positions = list_positions(pool, season_id, market_mode).await?;

    let items = repo_items::get_items_from_realtime_table(pool, season_id, market_mode)
        .await
        .unwrap_or_else(|_| Vec::new());

    let price_map: std::collections::HashMap<String, f64> = items
        .into_iter()
        .map(|item| (item.item_id.clone(), item.price))
        .collect();

    let mut views: Vec<InventoryPositionView> = positions
        .into_iter()
        .map(|position| {
            let current_price = price_map.get(&position.item_id).copied();
            let total_cost = position.buy_price * position.quantity as f64 + position.extra_cost;
            let break_even_price = calc_break_even_price(
                position.buy_price,
                position.quantity,
                position.extra_cost,
                position.fee_rate,
            );
            let estimated_net_value = current_price
                .map(|cp| calc_estimated_net_value(cp, position.quantity, position.fee_rate));

            let (profit, profit_ratio) = match estimated_net_value {
                Some(net) => {
                    let p = net - total_cost;
                    (Some(p), Some(p / total_cost * 100.0))
                }
                None => (None, None),
            };

            let sell_signal = match current_price {
                None => "no_price".to_string(),
                Some(cp) => {
                    if cp < break_even_price {
                        "loss".to_string()
                    } else if let Some(target) = position.target_sell_price {
                        if cp >= target {
                            "profitable".to_string()
                        } else {
                            "break_even".to_string()
                        }
                    } else if cp >= break_even_price {
                        "break_even".to_string()
                    } else {
                        "break_even".to_string()
                    }
                }
            };

            InventoryPositionView {
                position,
                current_price,
                break_even_price,
                total_cost,
                estimated_net_value,
                profit,
                profit_ratio,
                sell_signal,
            }
        })
        .collect();

    views.sort_by(|a, b| {
        let signal_order = |s: &str| match s {
            "profitable" => 0,
            "break_even" => 1,
            "loss" => 2,
            _ => 3,
        };
        let cmp = signal_order(&a.sell_signal).cmp(&signal_order(&b.sell_signal));
        if cmp == std::cmp::Ordering::Equal {
            b.profit_ratio
                .unwrap_or(0.0)
                .partial_cmp(&a.profit_ratio.unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        } else {
            cmp
        }
    });

    Ok(views)
}

pub async fn create_position(
    pool: &SqlitePool,
    position: &InventoryPosition,
) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        r#"
        INSERT INTO inventory_positions (
            id, season_id, market_mode, item_id, item_name, item_type,
            buy_price, quantity, extra_cost, fee_rate, target_sell_price,
            bought_at, status, note, alert_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&position.id)
    .bind(&position.season_id)
    .bind(&position.market_mode)
    .bind(&position.item_id)
    .bind(&position.item_name)
    .bind(&position.item_type)
    .bind(position.buy_price)
    .bind(position.quantity)
    .bind(position.extra_cost)
    .bind(position.fee_rate)
    .bind(position.target_sell_price)
    .bind(position.bought_at)
    .bind(&position.status)
    .bind(&position.note)
    .bind(if position.alert_enabled { 1 } else { 0 })
    .bind(now)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn update_position(
    pool: &SqlitePool,
    position: &InventoryPosition,
) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        r#"
        UPDATE inventory_positions SET
            item_name = ?, item_type = ?, buy_price = ?, quantity = ?,
            extra_cost = ?, fee_rate = ?, target_sell_price = ?,
            bought_at = ?, status = ?, note = ?,
            alert_enabled = ?, updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(&position.item_name)
    .bind(&position.item_type)
    .bind(position.buy_price)
    .bind(position.quantity)
    .bind(position.extra_cost)
    .bind(position.fee_rate)
    .bind(position.target_sell_price)
    .bind(position.bought_at)
    .bind(&position.status)
    .bind(&position.note)
    .bind(if position.alert_enabled { 1 } else { 0 })
    .bind(now)
    .bind(&position.id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn mark_position_sold(
    pool: &SqlitePool,
    id: &str,
    sold_price: f64,
) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        r#"
        UPDATE inventory_positions SET
            status = 'sold', sold_price = ?, sold_at = ?, updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(sold_price)
    .bind(now)
    .bind(now)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn mark_position_ignored(pool: &SqlitePool, id: &str) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        r#"
        UPDATE inventory_positions SET status = 'ignored', updated_at = ? WHERE id = ?
        "#,
    )
    .bind(now)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn delete_position(pool: &SqlitePool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM inventory_positions WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn get_position_by_id(
    pool: &SqlitePool,
    id: &str,
) -> Result<Option<InventoryPosition>, String> {
    let row: Option<InventoryPositionRow> = sqlx::query_as(
        r#"
        SELECT id, season_id, market_mode, item_id, item_name, item_type,
               buy_price, quantity, extra_cost, fee_rate, target_sell_price,
               bought_at, status, sold_price, sold_at, note,
               alert_enabled, last_alert_at, created_at, updated_at
        FROM inventory_positions WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(InventoryPosition::from))
}

pub async fn list_buy_watches(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<InventoryBuyWatch>, String> {
    let rows: Vec<InventoryBuyWatchRow> = sqlx::query_as(
        r#"
        SELECT id, season_id, market_mode, item_id, item_name, item_type,
               target_buy_price, max_quantity, note, alert_enabled,
               auto_create_position, last_alert_at, created_at, updated_at
        FROM inventory_buy_watches
        WHERE season_id = ? AND market_mode = ?
        ORDER BY target_buy_price ASC
        "#,
    )
    .bind(season_id)
    .bind(market_mode)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(InventoryBuyWatch::from).collect())
}

pub async fn get_buy_watch_by_id(
    pool: &SqlitePool,
    id: &str,
) -> Result<Option<InventoryBuyWatch>, String> {
    let row: Option<InventoryBuyWatchRow> = sqlx::query_as(
        r#"
        SELECT id, season_id, market_mode, item_id, item_name, item_type,
               target_buy_price, max_quantity, note, alert_enabled,
               auto_create_position, last_alert_at, created_at, updated_at
        FROM inventory_buy_watches
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(InventoryBuyWatch::from))
}

pub async fn list_buy_watches_with_current_price(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<InventoryBuyWatchView>, String> {
    let watches = list_buy_watches(pool, season_id, market_mode).await?;

    let items = repo_items::get_items_from_realtime_table(pool, season_id, market_mode)
        .await
        .unwrap_or_else(|_| Vec::new());

    let price_map: std::collections::HashMap<String, f64> = items
        .into_iter()
        .map(|item| (item.item_id.clone(), item.price))
        .collect();

    let views: Vec<InventoryBuyWatchView> = watches
        .into_iter()
        .map(|watch| {
            let current_price = price_map.get(&watch.item_id).copied();
            let discount_to_target = if watch.target_buy_price > 0.0 {
                current_price
                    .map(|cp| ((watch.target_buy_price - cp) / watch.target_buy_price) * 100.0)
            } else {
                None
            };

            let buy_signal = match (watch.alert_enabled, current_price) {
                (false, _) => "disabled",
                (true, None) => "no_price",
                (true, Some(cp)) if cp <= watch.target_buy_price => "buy_ready",
                (true, Some(_)) => "waiting",
            };

            InventoryBuyWatchView {
                watch,
                current_price,
                discount_to_target,
                buy_signal: buy_signal.to_string(),
            }
        })
        .collect();

    Ok(views)
}

pub async fn create_buy_watch(pool: &SqlitePool, watch: &InventoryBuyWatch) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        r#"
        INSERT INTO inventory_buy_watches (
            id, season_id, market_mode, item_id, item_name, item_type,
            target_buy_price, max_quantity, note, alert_enabled,
            auto_create_position, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&watch.id)
    .bind(&watch.season_id)
    .bind(&watch.market_mode)
    .bind(&watch.item_id)
    .bind(&watch.item_name)
    .bind(&watch.item_type)
    .bind(watch.target_buy_price)
    .bind(watch.max_quantity)
    .bind(&watch.note)
    .bind(if watch.alert_enabled { 1 } else { 0 })
    .bind(if watch.auto_create_position { 1 } else { 0 })
    .bind(now)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn update_buy_watch(pool: &SqlitePool, watch: &InventoryBuyWatch) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        r#"
        UPDATE inventory_buy_watches SET
            item_name = ?, item_type = ?, target_buy_price = ?,
            max_quantity = ?, note = ?, alert_enabled = ?,
            auto_create_position = ?, updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(&watch.item_name)
    .bind(&watch.item_type)
    .bind(watch.target_buy_price)
    .bind(watch.max_quantity)
    .bind(&watch.note)
    .bind(if watch.alert_enabled { 1 } else { 0 })
    .bind(if watch.auto_create_position { 1 } else { 0 })
    .bind(now)
    .bind(&watch.id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn delete_buy_watch(pool: &SqlitePool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM inventory_buy_watches WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn get_summary(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<InventorySummary, String> {
    let views = list_positions_with_current_price(pool, season_id, market_mode).await?;

    let mut total_cost = 0.0;
    let mut current_value = 0.0;
    let mut sell_ready_count = 0i64;
    let mut loss_risk_count = 0i64;

    for view in &views {
        total_cost += view.total_cost;
        if let Some(net) = view.estimated_net_value {
            current_value += net;
        }
        if view.sell_signal == "profitable" || view.sell_signal == "break_even" {
            sell_ready_count += 1;
        }
        if view.sell_signal == "loss" {
            loss_risk_count += 1;
        }
    }

    let items = repo_items::get_items_from_realtime_table(pool, season_id, market_mode)
        .await
        .unwrap_or_else(|_| Vec::new());
    let price_map: std::collections::HashMap<String, f64> = items
        .into_iter()
        .map(|item| (item.item_id.clone(), item.price))
        .collect();

    let watches = list_buy_watches(pool, season_id, market_mode).await?;
    let buy_ready_count = watches
        .iter()
        .filter(|w| {
            w.alert_enabled
                && price_map
                    .get(&w.item_id)
                    .map(|&cp| cp <= w.target_buy_price)
                    .unwrap_or(false)
        })
        .count() as i64;

    Ok(InventorySummary {
        total_cost,
        current_value,
        profit: current_value - total_cost,
        sell_ready_count,
        buy_ready_count,
        loss_risk_count,
        holding_count: views.len() as i64,
    })
}

pub async fn get_sell_ready_positions(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<InventoryPositionView>, String> {
    let views = list_positions_with_current_price(pool, season_id, market_mode).await?;
    Ok(views
        .into_iter()
        .filter(|v| v.sell_signal == "profitable" || v.sell_signal == "break_even")
        .collect())
}

pub async fn get_buy_ready_watches(
    pool: &SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<Vec<InventoryBuyWatchView>, String> {
    let views = list_buy_watches_with_current_price(pool, season_id, market_mode).await?;
    Ok(views
        .into_iter()
        .filter(|v| v.buy_signal == "buy_ready")
        .collect())
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
            CREATE TABLE inventory_buy_watches (
                id TEXT PRIMARY KEY,
                season_id TEXT NOT NULL,
                market_mode TEXT NOT NULL,
                item_id TEXT NOT NULL,
                item_name TEXT NOT NULL,
                item_type TEXT,
                target_buy_price REAL NOT NULL,
                max_quantity INTEGER,
                note TEXT,
                alert_enabled INTEGER NOT NULL DEFAULT 1,
                auto_create_position INTEGER NOT NULL DEFAULT 0,
                last_alert_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("inventory_buy_watches table should be created");

        pool
    }

    fn watch(id: &str) -> InventoryBuyWatch {
        InventoryBuyWatch {
            id: id.to_string(),
            season_id: "ss12".to_string(),
            market_mode: "season_normal".to_string(),
            item_id: "item-1".to_string(),
            item_name: "测试物品".to_string(),
            item_type: "材料".to_string(),
            target_buy_price: 100.0,
            max_quantity: Some(3),
            note: "first".to_string(),
            alert_enabled: true,
            auto_create_position: false,
            last_alert_at: None,
            created_at: 0,
            updated_at: 0,
        }
    }

    #[tokio::test]
    async fn buy_watch_crud_round_trip_by_id() {
        let pool = test_pool().await;
        let mut buy_watch = watch("watch-1");

        create_buy_watch(&pool, &buy_watch)
            .await
            .expect("buy watch should insert");

        let loaded = get_buy_watch_by_id(&pool, "watch-1")
            .await
            .expect("buy watch should load")
            .expect("buy watch should exist");
        assert_eq!(loaded.item_name, "测试物品");
        assert_eq!(loaded.target_buy_price, 100.0);

        buy_watch.item_name = "测试物品-改".to_string();
        buy_watch.target_buy_price = 88.0;
        buy_watch.alert_enabled = false;
        buy_watch.auto_create_position = true;
        update_buy_watch(&pool, &buy_watch)
            .await
            .expect("buy watch should update");

        let updated = get_buy_watch_by_id(&pool, "watch-1")
            .await
            .expect("updated buy watch should load")
            .expect("updated buy watch should exist");
        assert_eq!(updated.item_name, "测试物品-改");
        assert_eq!(updated.target_buy_price, 88.0);
        assert!(!updated.alert_enabled);
        assert!(updated.auto_create_position);

        delete_buy_watch(&pool, "watch-1")
            .await
            .expect("buy watch should delete");
        assert!(get_buy_watch_by_id(&pool, "watch-1")
            .await
            .expect("deleted buy watch lookup should work")
            .is_none());
    }
}
