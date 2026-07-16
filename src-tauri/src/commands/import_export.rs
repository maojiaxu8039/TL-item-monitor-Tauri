use crate::commands::types::{BackupInfo, DatabaseMaintenanceResult, ImportResp, OkResponse};
use crate::core::paths;
use crate::core::state::{AppState, SeasonApiConfig};
use crate::db::models_strategy::CreateStrategyRequest;
use crate::db::repo_alerts;
use crate::db::repo_config;
use crate::db::repo_inventory;
use crate::db::repo_inventory::{InventoryBuyWatch, InventoryPosition};
use crate::db::repo_season_api;
use crate::db::repo_sections;
use crate::db::repo_strategy_detail;
use crate::db::table_resolver::TableResolver;
use base64::{engine::general_purpose, Engine};
use csv::StringRecord;
use std::sync::Arc;
use tauri::State;
use tracing::warn;
use uuid::Uuid;

fn csv_field<'a>(headers: &StringRecord, record: &'a StringRecord, aliases: &[&str]) -> &'a str {
    aliases
        .iter()
        .find_map(|alias| {
            headers
                .iter()
                .position(|h| h.trim().eq_ignore_ascii_case(alias))
                .and_then(|idx| record.get(idx))
        })
        .unwrap_or("")
        .trim()
}

async fn resolve_watchlist_section_id(
    pool: &sqlx::SqlitePool,
    section_id: &str,
    section_name: &str,
    market_mode: &str,
) -> Result<String, String> {
    if !section_id.trim().is_empty() {
        let exists: Option<String> =
            sqlx::query_scalar("SELECT id FROM sections WHERE id = ? AND market_mode = ?")
                .bind(section_id)
                .bind(market_mode)
                .fetch_optional(pool)
                .await
                .map_err(|e| e.to_string())?;

        if exists.is_some() || section_name.trim().is_empty() {
            return Ok(section_id.trim().to_string());
        }
    }

    let name = section_name.trim();
    if name.is_empty() {
        return Err("section_id 和 section_name 不能同时为空".to_string());
    }

    if let Some(id) = sqlx::query_scalar::<_, String>(
        "SELECT id FROM sections WHERE name = ? AND market_mode = ?",
    )
    .bind(name)
    .bind(market_mode)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    {
        return Ok(id);
    }

    repo_sections::create_section(pool, name, market_mode)
        .await
        .map(|section| section.id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_watchlist_csv(
    state: State<'_, Arc<AppState>>,
    content: String,
) -> Result<ImportResp, String> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(content.as_bytes());

    let headers = reader.headers().map_err(|e| e.to_string())?.clone();
    let ctx = state.active_context.read().clone();
    let mut imported_count = 0;
    let mut error_list = Vec::new();
    let mut batch: Vec<(String, String, String, String, f64, i32, f64)> = Vec::new();

    for (idx, result) in reader.records().enumerate() {
        if let Ok(record) = result {
            let season_id = csv_field(&headers, &record, &["season_id", "赛季ID", "season"]);
            let season_id = if season_id.is_empty() {
                ctx.season_id.clone()
            } else {
                season_id.to_string()
            };
            let market_mode = csv_field(&headers, &record, &["market_mode", "市场模式", "mode"]);
            let market_mode = if market_mode.is_empty() {
                ctx.market_mode.as_str().to_string()
            } else {
                market_mode.to_string()
            };
            let section_id = csv_field(&headers, &record, &["section_id", "分组ID", "section"]);
            let section_name = csv_field(
                &headers,
                &record,
                &["section_name", "分组名称", "group", "分组"],
            );
            let item_id = csv_field(&headers, &record, &["item_id", "物品ID", "item"]).to_string();
            let purchase_fire_price: f64 = csv_field(
                &headers,
                &record,
                &["purchase_fire_price", "购买火价", "fire_price", "price"],
            )
            .parse()
            .unwrap_or(0.0);
            let count: i32 = csv_field(&headers, &record, &["count", "数量", "qty", "quantity"])
                .parse()
                .unwrap_or(1);
            let more_value: f64 = csv_field(
                &headers,
                &record,
                &["more_value", "更多价值", "extra_value"],
            )
            .parse()
            .unwrap_or(0.0);

            if item_id.trim().is_empty() {
                error_list.push(format!("行 {}: item_id 为空", idx + 2));
                continue;
            }

            if let Err(e) = TableResolver::validate(&season_id, &market_mode) {
                error_list.push(format!("行 {}: {}", idx + 2, e));
                continue;
            }

            let section_id = match resolve_watchlist_section_id(
                &state.db,
                section_id,
                section_name,
                &market_mode,
            )
            .await
            {
                Ok(id) => id,
                Err(e) => {
                    error_list.push(format!("行 {}: {}", idx + 2, e));
                    continue;
                }
            };

            batch.push((
                section_id,
                season_id,
                market_mode,
                item_id,
                purchase_fire_price,
                count,
                more_value,
            ));
        } else {
            error_list.push(format!("行 {}: CSV 记录格式错误", idx + 2));
        }
    }

    for (section_id, season_id, market_mode, item_id, purchase_fire_price, count, more_value) in
        batch
    {
        match repo_sections::add_section_item(
            &state.db,
            &section_id,
            &season_id,
            &market_mode,
            &item_id,
            purchase_fire_price,
            count,
            more_value,
        )
        .await
        {
            Ok(_) => imported_count += 1,
            Err(e) => error_list.push(format!("导入错误: {}", e)),
        }
    }

    Ok(ImportResp {
        imported: imported_count,
        errors: error_list,
    })
}

#[tauri::command]
pub async fn export_watchlist_csv(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let ctx = state.active_context.read().clone();

    TableResolver::validate(&ctx.season_id, ctx.market_mode.as_str())?;

    let rows: Vec<(
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
    )> = sqlx::query_as(
        r#"
        SELECT
            si.section_id,
            COALESCE(s.name, '') AS section_name,
            si.season_id,
            si.market_mode,
            si.item_id,
            si.purchase_fire_price,
            si.count,
            si.more_value,
            COALESCE(si.last_time, '')
        FROM section_items si
        LEFT JOIN sections s ON s.id = si.section_id
        WHERE si.season_id = ? AND si.market_mode = ?
        ORDER BY s.sort_order, si.sort_order, si.created_at
        "#,
    )
    .bind(&ctx.season_id)
    .bind(ctx.market_mode.as_str())
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record([
        "section_id",
        "section_name",
        "season_id",
        "market_mode",
        "item_id",
        "purchase_fire_price",
        "count",
        "more_value",
        "last_time",
    ])
    .map_err(|e| e.to_string())?;

    for row in rows {
        wtr.write_record([
            row.0.as_str(),
            row.1.as_str(),
            row.2.as_str(),
            row.3.as_str(),
            row.4.as_str(),
            row.5.as_str(),
            row.6.as_str(),
            row.7.as_str(),
            row.8.as_str(),
        ])
        .map_err(|e| e.to_string())?;
    }

    let data = wtr.into_inner().map_err(|e| e.to_string())?;
    String::from_utf8(data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_inventory_csv(
    state: State<'_, Arc<AppState>>,
    season_id: String,
    market_mode: String,
) -> Result<String, String> {
    let positions = repo_inventory::list_positions(&state.db, &season_id, &market_mode)
        .await
        .map_err(|e| e.to_string())?;

    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record([
        "item_id",
        "item_name",
        "buy_price",
        "quantity",
        "target_sell_price",
        "total_cost",
        "extra_cost",
        "fee_rate",
        "status",
        "sold_price",
        "sold_at",
        "alert_enabled",
        "note",
        "bought_at",
        "created_at",
    ])
    .map_err(|e| e.to_string())?;

    for pos in positions {
        let total_cost = pos.buy_price * pos.quantity as f64 + pos.extra_cost;
        wtr.write_record([
            pos.item_id.as_str(),
            pos.item_name.as_str(),
            &pos.buy_price.to_string(),
            &pos.quantity.to_string(),
            &pos.target_sell_price.unwrap_or(0.0).to_string(),
            &total_cost.to_string(),
            &pos.extra_cost.to_string(),
            &pos.fee_rate.to_string(),
            pos.status.as_str(),
            &pos.sold_price.unwrap_or(0.0).to_string(),
            &pos.sold_at.map(|v| v.to_string()).unwrap_or_default(),
            if pos.alert_enabled { "true" } else { "false" },
            pos.note.as_str(),
            &pos.bought_at.to_string(),
            &pos.created_at.to_string(),
        ])
        .map_err(|e| e.to_string())?;
    }

    let data = wtr.into_inner().map_err(|e| e.to_string())?;
    String::from_utf8(data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_buy_watches_csv(
    state: State<'_, Arc<AppState>>,
    season_id: String,
    market_mode: String,
) -> Result<String, String> {
    let watches = repo_inventory::list_buy_watches(&state.db, &season_id, &market_mode)
        .await
        .map_err(|e| e.to_string())?;

    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record([
        "item_id",
        "item_name",
        "target_buy_price",
        "max_quantity",
        "alert_enabled",
        "auto_create_position",
        "note",
        "created_at",
    ])
    .map_err(|e| e.to_string())?;

    for watch in watches {
        let alert_enabled_str = if watch.alert_enabled { "true" } else { "false" };
        let auto_create_position_str = if watch.auto_create_position { "true" } else { "false" };
        wtr.write_record([
            watch.item_id.as_str(),
            watch.item_name.as_str(),
            &watch.target_buy_price.to_string(),
            &watch.max_quantity.unwrap_or(0).to_string(),
            alert_enabled_str,
            auto_create_position_str,
            watch.note.as_str(),
            &watch.created_at.to_string(),
        ])
        .map_err(|e| e.to_string())?;
    }

    let data = wtr.into_inner().map_err(|e| e.to_string())?;
    String::from_utf8(data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_inventory_csv(
    state: State<'_, Arc<AppState>>,
    content: String,
) -> Result<ImportResp, String> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(content.as_bytes());

    let headers = reader.headers().map_err(|e| e.to_string())?.clone();
    let ctx = state.active_context.read().clone();
    let mut imported_count = 0;
    let mut error_list: Vec<String> = Vec::new();

    for (idx, result) in reader.records().enumerate() {
        let record = match result {
            Ok(r) => r,
            Err(e) => {
                error_list.push(format!("行 {}: 解析失败: {}", idx + 2, e));
                continue;
            }
        };

        let item_id = csv_field(&headers, &record, &["item_id", "物品ID", "item"]).to_string();
        let item_name =
            csv_field(&headers, &record, &["item_name", "物品名称", "name"]).to_string();
        if item_id.is_empty() || item_name.is_empty() {
            error_list.push(format!("行 {}: item_id 或 item_name 为空", idx + 2));
            continue;
        }

        let buy_price: f64 =
            match csv_field(&headers, &record, &["buy_price", "买入价格", "price"]).parse() {
                Ok(v) if v > 0.0 => v,
                _ => {
                    error_list.push(format!("行 {}: 无效的买入价格", idx + 2));
                    continue;
                }
            };
        let quantity: i64 = csv_field(&headers, &record, &["quantity", "数量", "qty", "count"])
            .parse()
            .unwrap_or(1);

        // 优先读 extra_cost，缺失时用 total_cost 反推（兼容旧格式）
        let extra_cost: f64 = {
            let s = csv_field(&headers, &record, &["extra_cost", "额外成本"]);
            if !s.is_empty() {
                s.parse().unwrap_or(0.0)
            } else {
                let total_cost: f64 = csv_field(&headers, &record, &["total_cost", "总成本"])
                    .parse()
                    .unwrap_or(0.0);
                (total_cost - buy_price * quantity as f64).max(0.0)
            }
        };

        let fee_rate: f64 = csv_field(&headers, &record, &["fee_rate", "手续费率"])
            .parse()
            .unwrap_or(0.125);

        let target_sell_price: Option<f64> = {
            let s = csv_field(&headers, &record, &["target_sell_price", "目标卖出价"]);
            if s.is_empty() {
                None
            } else {
                s.parse().ok()
            }
        };

        // 优先读 bought_at，缺失时用 created_at 代替（兼容旧格式）
        let bought_at: i64 = {
            let s = csv_field(&headers, &record, &["bought_at", "买入时间"]);
            if s.is_empty() {
                csv_field(&headers, &record, &["created_at", "创建时间"])
                    .parse()
                    .unwrap_or_else(|_| chrono::Utc::now().timestamp())
            } else {
                s.parse()
                    .unwrap_or_else(|_| chrono::Utc::now().timestamp())
            }
        };

        let status = {
            let s = csv_field(&headers, &record, &["status", "状态"]);
            if s.is_empty() {
                "holding".to_string()
            } else {
                s.to_string()
            }
        };

        let sold_price: Option<f64> = {
            let s = csv_field(&headers, &record, &["sold_price", "卖出价格"]);
            if s.is_empty() {
                None
            } else {
                s.parse().ok()
            }
        };

        let sold_at: Option<i64> = {
            let s = csv_field(&headers, &record, &["sold_at", "卖出时间"]);
            if s.is_empty() {
                None
            } else {
                s.parse().ok()
            }
        };

        let alert_enabled: bool = {
            let s = csv_field(&headers, &record, &["alert_enabled", "启用预警"]);
            if s.is_empty() {
                true
            } else {
                s.eq_ignore_ascii_case("true") || s == "1" || s.eq_ignore_ascii_case("yes")
            }
        };

        let note = csv_field(&headers, &record, &["note", "备注"]).to_string();

        let created_at: i64 = csv_field(&headers, &record, &["created_at", "创建时间"])
            .parse()
            .unwrap_or_else(|_| chrono::Utc::now().timestamp());

        let position = InventoryPosition {
            id: Uuid::new_v4().to_string(),
            season_id: ctx.season_id.clone(),
            market_mode: ctx.market_mode.as_str().to_string(),
            item_id,
            item_name,
            item_type: String::new(),
            buy_price,
            quantity,
            extra_cost,
            fee_rate,
            target_sell_price,
            bought_at,
            status,
            sold_price,
            sold_at,
            note,
            alert_enabled,
            last_alert_at: None,
            created_at,
            updated_at: chrono::Utc::now().timestamp(),
        };

        match repo_inventory::create_position(&state.db, &position).await {
            Ok(_) => imported_count += 1,
            Err(e) => error_list.push(format!("行 {}: {}", idx + 2, e)),
        }
    }

    Ok(ImportResp {
        imported: imported_count,
        errors: error_list,
    })
}

#[tauri::command]
pub async fn import_buy_watches_csv(
    state: State<'_, Arc<AppState>>,
    content: String,
) -> Result<ImportResp, String> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(content.as_bytes());

    let headers = reader.headers().map_err(|e| e.to_string())?.clone();
    let ctx = state.active_context.read().clone();
    let mut imported_count = 0;
    let mut error_list: Vec<String> = Vec::new();

    for (idx, result) in reader.records().enumerate() {
        let record = match result {
            Ok(r) => r,
            Err(e) => {
                error_list.push(format!("行 {}: 解析失败: {}", idx + 2, e));
                continue;
            }
        };

        let item_id = csv_field(&headers, &record, &["item_id", "物品ID", "item"]).to_string();
        let item_name =
            csv_field(&headers, &record, &["item_name", "物品名称", "name"]).to_string();
        if item_id.is_empty() || item_name.is_empty() {
            error_list.push(format!("行 {}: item_id 或 item_name 为空", idx + 2));
            continue;
        }

        let target_buy_price: f64 =
            match csv_field(&headers, &record, &["target_buy_price", "目标买入价"]).parse() {
                Ok(v) if v > 0.0 => v,
                _ => {
                    error_list.push(format!("行 {}: 无效的目标买入价", idx + 2));
                    continue;
                }
            };
        let max_quantity: Option<i64> = {
            let s = csv_field(&headers, &record, &["max_quantity", "最大数量"]);
            if s.is_empty() {
                None
            } else {
                s.parse().ok()
            }
        };

        let alert_enabled: bool = {
            let s = csv_field(&headers, &record, &["alert_enabled", "启用预警"]);
            if s.is_empty() {
                true
            } else {
                s.eq_ignore_ascii_case("true") || s == "1" || s.eq_ignore_ascii_case("yes")
            }
        };

        let auto_create_position: bool = {
            let s = csv_field(&headers, &record, &["auto_create_position", "自动创建持仓"]);
            if s.is_empty() {
                false
            } else {
                s.eq_ignore_ascii_case("true") || s == "1" || s.eq_ignore_ascii_case("yes")
            }
        };

        let note = csv_field(&headers, &record, &["note", "备注"]).to_string();

        let watch = InventoryBuyWatch {
            id: Uuid::new_v4().to_string(),
            season_id: ctx.season_id.clone(),
            market_mode: ctx.market_mode.as_str().to_string(),
            item_id,
            item_name,
            item_type: String::new(),
            target_buy_price,
            max_quantity,
            note,
            alert_enabled,
            auto_create_position,
            last_alert_at: None,
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
        };

        match repo_inventory::create_buy_watch(&state.db, &watch).await {
            Ok(_) => imported_count += 1,
            Err(e) => error_list.push(format!("行 {}: {}", idx + 2, e)),
        }
    }

    Ok(ImportResp {
        imported: imported_count,
        errors: error_list,
    })
}

#[tauri::command]
pub async fn get_backup_info(state: State<'_, Arc<AppState>>) -> Result<BackupInfo, String> {
    let db_path = paths::db_path();
    let db_size_kb = tokio::fs::metadata(&db_path)
        .await
        .map(|m| m.len() as f64 / 1024.0)
        .unwrap_or(0.0);

    let last_backup_at = repo_config::get_config(&state.db, "last_backup_at")
        .await
        .ok()
        .and_then(|v| v.and_then(|s| s.parse::<i64>().ok()));

    Ok(BackupInfo {
        last_backup_at,
        db_size_kb,
    })
}

#[tauri::command]
pub async fn backup_database(
    state: State<'_, Arc<AppState>>,
    dest_path: String,
) -> Result<OkResponse, String> {
    let db_path = paths::db_path();

    let dest_path = resolve_user_file_path(&dest_path).map_err(|e| format!("备份失败: {}", e))?;

    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&state.db)
        .await
        .map_err(|e| format!("WAL checkpoint 失败: {}", e))?;

    tokio::fs::copy(&db_path, &dest_path)
        .await
        .map_err(|e| format!("备份失败: {}", e))?;

    let now = chrono::Utc::now().timestamp().to_string();
    if let Err(e) = repo_config::save_config(&state.db, "last_backup_at", &now).await {
        warn!("Failed to save last_backup_at: {}", e);
    }

    Ok(OkResponse::success("备份已创建"))
}

async fn file_size_kb(path: &std::path::Path) -> f64 {
    tokio::fs::metadata(path)
        .await
        .map(|m| m.len() as f64 / 1024.0)
        .unwrap_or(0.0)
}

#[tauri::command]
pub async fn maintain_database(
    state: State<'_, Arc<AppState>>,
) -> Result<DatabaseMaintenanceResult, String> {
    let db_path = paths::db_path();
    let wal_path = db_path.with_extension("db-wal");

    let db_size_kb_before = file_size_kb(&db_path).await;
    let wal_size_kb_before = file_size_kb(&wal_path).await;

    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&state.db)
        .await
        .map_err(|e| format!("WAL checkpoint 失败: {}", e))?;

    sqlx::query("PRAGMA optimize")
        .execute(&state.db)
        .await
        .map_err(|e| format!("数据库优化失败: {}", e))?;

    let db_size_kb_after = file_size_kb(&db_path).await;
    let wal_size_kb_after = file_size_kb(&wal_path).await;
    let total_size_kb_before = db_size_kb_before + wal_size_kb_before;
    let total_size_kb_after = db_size_kb_after + wal_size_kb_after;

    Ok(DatabaseMaintenanceResult {
        db_size_kb_before,
        db_size_kb_after,
        wal_size_kb_before,
        wal_size_kb_after,
        total_size_kb_before,
        total_size_kb_after,
        freed_kb: (total_size_kb_before - total_size_kb_after).max(0.0),
    })
}

fn validate_path_within_app_dir(path: &str) -> Result<std::path::PathBuf, String> {
    let path = std::path::Path::new(path);
    let app_dir = paths::app_dir();

    let path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        app_dir.join(path)
    };

    let canonical = std::fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
    let app_dir_canonical = std::fs::canonicalize(&app_dir).unwrap_or_else(|_| app_dir.clone());

    if !canonical.starts_with(&app_dir_canonical) {
        return Err("路径必须在应用数据目录内".to_string());
    }

    Ok(canonical)
}

fn resolve_user_file_path(path: &str) -> Result<std::path::PathBuf, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("文件路径不能为空".to_string());
    }
    Ok(std::path::PathBuf::from(path))
}

#[tauri::command]
pub async fn restore_database(
    _state: State<'_, Arc<AppState>>,
    src_path: String,
) -> Result<OkResponse, String> {
    let db_path = paths::db_path();

    let src_path = resolve_user_file_path(&src_path).map_err(|e| format!("恢复失败: {}", e))?;

    if !tokio::fs::try_exists(&src_path).await.unwrap_or(false) {
        return Err("恢复失败: 源文件不存在".to_string());
    }

    let metadata = tokio::fs::metadata(&src_path)
        .await
        .map_err(|e| format!("无法读取源文件: {}", e))?;
    if metadata.len() < 512 {
        return Err("恢复失败: 源文件太小，可能不是有效的数据库".to_string());
    }

    let mut header = [0u8; 16];
    let mut file = tokio::fs::File::open(&src_path)
        .await
        .map_err(|e| format!("无法打开源文件: {}", e))?;
    tokio::io::AsyncReadExt::read_exact(&mut file, &mut header)
        .await
        .map_err(|e| format!("无法读取文件头: {}", e))?;
    if &header[0..6] != b"SQLite" {
        return Err("恢复失败: 源文件不是有效的 SQLite 数据库".to_string());
    }

    drop(file);

    // 恢复前备份当前数据库；备份失败则中止恢复，避免数据丢失
    let backup_path = db_path.with_extension("db.backup");
    if let Err(e) = tokio::fs::copy(&db_path, &backup_path).await {
        return Err(format!("恢复失败: 无法创建恢复前备份: {}", e));
    }

    let wal_path = db_path.with_extension("db-wal");
    let shm_path = db_path.with_extension("db-shm");
    let _ = tokio::fs::remove_file(&wal_path).await;
    let _ = tokio::fs::remove_file(&shm_path).await;

    tokio::fs::copy(&src_path, &db_path)
        .await
        .map_err(|e| format!("恢复失败: {}", e))?;
    Ok(OkResponse::success("数据库已恢复 — 请重启应用"))
}

#[tauri::command]
pub async fn write_file(path: String, base64_content: String) -> Result<OkResponse, String> {
    let path = validate_path_within_app_dir(&path).map_err(|e| format!("写入失败: {}", e))?;
    let bytes = general_purpose::STANDARD
        .decode(&base64_content)
        .map_err(|e| format!("Base64解码错误: {}", e))?;
    tokio::fs::write(&path, bytes)
        .await
        .map_err(|e| format!("写入文件错误: {}", e))?;
    Ok(OkResponse::success("文件已写入"))
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    let path = validate_path_within_app_dir(&path).map_err(|e| format!("读取失败: {}", e))?;
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("读取文件错误: {}", e))?;
    Ok(general_purpose::STANDARD.encode(&bytes))
}

/// 导出赛季信息 + 每个赛季的 API 配置
/// 表头: season_id,season_name,started_at,ended_at,is_active,api_configs
/// api_configs 格式: source:field:value (多条用 | 分隔)
#[tauri::command]
pub async fn export_seasons_csv(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let rows: Vec<(String, String, i32, Option<i64>, Option<i64>)> = sqlx::query_as(
        "SELECT id, name, is_current, started_at, ended_at FROM seasons ORDER BY started_at DESC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record([
        "season_id",
        "season_name",
        "started_at",
        "ended_at",
        "is_active",
        "api_configs",
    ])
    .map_err(|e| e.to_string())?;

    for (id, name, is_current, started_at, ended_at) in rows {
        let config = repo_season_api::get_season_api_config(&state.db, &id)
            .await
            .map_err(|e| e.to_string())?;

        let mut parts: Vec<String> = Vec::new();
        if !config.qiandao_tag_id_normal.is_empty() {
            parts.push(format!("qiandao:tag_id_normal:{}", config.qiandao_tag_id_normal));
        }
        if !config.qiandao_spec_id_normal.is_empty() {
            parts.push(format!("qiandao:spec_id_normal:{}", config.qiandao_spec_id_normal));
        }
        if !config.qiandao_tag_id_expert.is_empty() {
            parts.push(format!("qiandao:tag_id_expert:{}", config.qiandao_tag_id_expert));
        }
        if !config.qiandao_spec_id_expert.is_empty() {
            parts.push(format!("qiandao:spec_id_expert:{}", config.qiandao_spec_id_expert));
        }
        if config.luosi_season_id_normal != 0 {
            parts.push(format!("luosi:season_id_normal:{}", config.luosi_season_id_normal));
        }
        if config.luosi_season_id_expert != 0 {
            parts.push(format!("luosi:season_id_expert:{}", config.luosi_season_id_expert));
        }
        if config.etor_season_id_normal != 0 {
            parts.push(format!("etor:season_id_normal:{}", config.etor_season_id_normal));
        }
        if config.etor_season_id_expert != 0 {
            parts.push(format!("etor:season_id_expert:{}", config.etor_season_id_expert));
        }
        let api_configs = parts.join("|");

        let started_at_str = started_at.map_or(String::new(), |v| v.to_string());
        let ended_at_str = ended_at.map_or(String::new(), |v| v.to_string());

        wtr.write_record([
            id.as_str(),
            name.as_str(),
            started_at_str.as_str(),
            ended_at_str.as_str(),
            is_current.to_string().as_str(),
            api_configs.as_str(),
        ])
        .map_err(|e| e.to_string())?;
    }

    let data = wtr.into_inner().map_err(|e| e.to_string())?;
    String::from_utf8(data).map_err(|e| e.to_string())
}

/// 导入赛季信息 + 每个赛季的 API 配置
/// INSERT OR REPLACE 到 seasons 表，然后为每个赛季写入 season_api_configs 表
#[tauri::command]
pub async fn import_seasons_csv(
    state: State<'_, Arc<AppState>>,
    content: String,
) -> Result<ImportResp, String> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(content.as_bytes());

    let headers = reader.headers().map_err(|e| e.to_string())?.clone();
    let mut imported_count = 0;
    let mut error_list: Vec<String> = Vec::new();
    let now = chrono::Utc::now().timestamp();

    for (idx, result) in reader.records().enumerate() {
        let record = match result {
            Ok(r) => r,
            Err(e) => {
                error_list.push(format!("行 {}: 解析失败: {}", idx + 2, e));
                continue;
            }
        };

        let season_id = csv_field(&headers, &record, &["season_id", "赛季ID", "id"])
            .to_string();
        let season_name =
            csv_field(&headers, &record, &["season_name", "赛季名称", "name"]).to_string();

        if season_id.trim().is_empty() || season_name.trim().is_empty() {
            error_list.push(format!("行 {}: season_id 或 season_name 为空", idx + 2));
            continue;
        }

        let started_at: Option<i64> =
            csv_field(&headers, &record, &["started_at", "开始时间"]).parse().ok();
        let ended_at: Option<i64> =
            csv_field(&headers, &record, &["ended_at", "结束时间"]).parse().ok();
        let is_active: i32 = csv_field(&headers, &record, &["is_active", "is_current", "是否当前"])
            .parse()
            .unwrap_or(0);
        let api_configs_str = csv_field(&headers, &record, &["api_configs", "API配置"]);

        sqlx::query(
            "INSERT OR REPLACE INTO seasons (id, name, code, is_current, started_at, ended_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&season_id)
        .bind(&season_name)
        .bind(&season_id)
        .bind(is_active)
        .bind(started_at)
        .bind(ended_at)
        .bind(now)
        .bind(now)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;

        if !api_configs_str.is_empty() {
            let mut config = SeasonApiConfig::default();
            for part in api_configs_str.split('|') {
                let part = part.trim();
                if part.is_empty() {
                    continue;
                }
                let segs: Vec<&str> = part.splitn(3, ':').collect();
                if segs.len() != 3 {
                    continue;
                }
                let (source, field, value) = (segs[0], segs[1], segs[2]);
                match (source, field) {
                    ("qiandao", "tag_id_normal") => config.qiandao_tag_id_normal = value.to_string(),
                    ("qiandao", "spec_id_normal") => config.qiandao_spec_id_normal = value.to_string(),
                    ("qiandao", "tag_id_expert") => config.qiandao_tag_id_expert = value.to_string(),
                    ("qiandao", "spec_id_expert") => config.qiandao_spec_id_expert = value.to_string(),
                    ("luosi", "season_id_normal") => {
                        config.luosi_season_id_normal = value.parse().unwrap_or(0);
                    }
                    ("luosi", "season_id_expert") => {
                        config.luosi_season_id_expert = value.parse().unwrap_or(0);
                    }
                    ("etor", "season_id_normal") => {
                        config.etor_season_id_normal = value.parse().unwrap_or(0);
                    }
                    ("etor", "season_id_expert") => {
                        config.etor_season_id_expert = value.parse().unwrap_or(0);
                    }
                    _ => {}
                }
            }

            repo_season_api::set_season_api_config(&state.db, &season_id, &config)
                .await
                .map_err(|e| e.to_string())?;
        }

        imported_count += 1;
    }

    Ok(ImportResp {
        imported: imported_count,
        errors: error_list,
    })
}

// ===== 预警规则 CSV 导入导出 =====

/// 导出预警规则
/// 表头: rule_type,item_id,item_name,strategy_id,section_id,threshold,enabled,cooldown_seconds
#[tauri::command]
pub async fn export_alert_rules_csv(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let ctx = state.active_context.read().clone();
    let rules = repo_alerts::get_alert_rules(&state.db, &ctx.season_id, ctx.market_mode.as_str())
        .await
        .map_err(|e| e.to_string())?;

    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record([
        "rule_type",
        "item_id",
        "item_name",
        "strategy_id",
        "section_id",
        "threshold",
        "enabled",
        "cooldown_seconds",
    ])
    .map_err(|e| e.to_string())?;

    for r in rules {
        wtr.write_record([
            r.rule_type.as_str(),
            r.item_id.as_deref().unwrap_or(""),
            r.item_name.as_deref().unwrap_or(""),
            r.strategy_id.as_deref().unwrap_or(""),
            r.section_id.as_deref().unwrap_or(""),
            &r.threshold.to_string(),
            &r.enabled.to_string(),
            &r.cooldown_seconds.to_string(),
        ])
        .map_err(|e| e.to_string())?;
    }

    let data = wtr.into_inner().map_err(|e| e.to_string())?;
    String::from_utf8(data).map_err(|e| e.to_string())
}

/// 导入预警规则
/// 导入时生成新 UUID，使用 repo_alerts::create_alert_rule 创建
#[tauri::command]
pub async fn import_alert_rules_csv(
    state: State<'_, Arc<AppState>>,
    content: String,
) -> Result<ImportResp, String> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(content.as_bytes());

    let headers = reader.headers().map_err(|e| e.to_string())?.clone();
    let ctx = state.active_context.read().clone();
    let mut imported_count = 0;
    let mut error_list: Vec<String> = Vec::new();

    for (idx, result) in reader.records().enumerate() {
        let record = match result {
            Ok(r) => r,
            Err(e) => {
                error_list.push(format!("行 {}: 解析失败: {}", idx + 2, e));
                continue;
            }
        };

        let rule_type = csv_field(&headers, &record, &["rule_type", "规则类型"]).to_string();
        if rule_type.trim().is_empty() {
            error_list.push(format!("行 {}: rule_type 为空", idx + 2));
            continue;
        }

        let item_id_raw = csv_field(&headers, &record, &["item_id", "物品ID"]);
        let item_id = if item_id_raw.is_empty() {
            None
        } else {
            Some(item_id_raw.to_string())
        };
        let strategy_id_raw = csv_field(&headers, &record, &["strategy_id", "策略ID"]);
        let strategy_id = if strategy_id_raw.is_empty() {
            None
        } else {
            Some(strategy_id_raw.to_string())
        };
        let section_id_raw = csv_field(&headers, &record, &["section_id", "分组ID"]);
        let section_id = if section_id_raw.is_empty() {
            None
        } else {
            Some(section_id_raw.to_string())
        };
        let threshold: f64 = csv_field(&headers, &record, &["threshold", "阈值"])
            .parse()
            .unwrap_or(0.0);
        let enabled: i32 = csv_field(&headers, &record, &["enabled", "启用"])
            .parse()
            .unwrap_or(1);
        let cooldown_seconds: i32 =
            csv_field(&headers, &record, &["cooldown_seconds", "冷却秒数"])
                .parse()
                .unwrap_or(0);

        match repo_alerts::create_alert_rule(
            &state.db,
            &ctx.season_id,
            ctx.market_mode.as_str(),
            strategy_id.as_deref(),
            section_id.as_deref(),
            item_id.as_deref(),
            &rule_type,
            threshold,
            cooldown_seconds,
        )
        .await
        {
            Ok(rule) => {
                if enabled == 0 {
                    if let Err(e) = repo_alerts::toggle_alert_rule(&state.db, &rule.id, false).await
                    {
                        error_list.push(format!("行 {}: 规则已创建但关闭失败: {}", idx + 2, e));
                    }
                }
                imported_count += 1;
            }
            Err(e) => error_list.push(format!("行 {}: {}", idx + 2, e)),
        }
    }

    Ok(ImportResp {
        imported: imported_count,
        errors: error_list,
    })
}

// ===== 策略 CSV 导入导出 =====

/// 导出策略（含 costs 和 outputs）
/// 表头: name,label,difficulty,output_value,defense_value,estimated_cost,estimated_revenue_min,estimated_revenue_max,runs_per_hour,remark,costs,outputs
/// costs 格式: cost_type:item_id:item_name:count:fire_price:total_fire:is_realtime (多条用 | 分隔)
/// outputs 格式: item_name:item_type:count:estimated_value:realtime_value:remark (多条用 | 分隔)
#[tauri::command]
pub async fn export_strategies_csv(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let strategies = repo_strategy_detail::get_strategy_details(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    let strategy_ids: Vec<String> = strategies.iter().map(|s| s.id.clone()).collect();
    let costs_map = repo_strategy_detail::get_strategy_costs_batch(&state.db, &strategy_ids)
        .await
        .map_err(|e| e.to_string())?;
    let outputs_map = repo_strategy_detail::get_strategy_outputs_batch(&state.db, &strategy_ids)
        .await
        .map_err(|e| e.to_string())?;

    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record([
        "name",
        "label",
        "difficulty",
        "output_value",
        "defense_value",
        "estimated_cost",
        "estimated_revenue_min",
        "estimated_revenue_max",
        "runs_per_hour",
        "remark",
        "costs",
        "outputs",
    ])
    .map_err(|e| e.to_string())?;

    for s in strategies {
        let costs = costs_map.get(&s.id).cloned().unwrap_or_default();
        let outputs = outputs_map.get(&s.id).cloned().unwrap_or_default();

        let costs_str = costs
            .iter()
            .map(|c| {
                format!(
                    "{}:{}:{}:{}:{}:{}:{}",
                    c.cost_type,
                    c.item_id,
                    c.item_name.as_deref().unwrap_or(""),
                    c.count,
                    c.fire_price,
                    c.total_fire,
                    if c.is_realtime { "1" } else { "0" }
                )
            })
            .collect::<Vec<_>>()
            .join("|");

        let outputs_str = outputs
            .iter()
            .map(|o| {
                format!(
                    "{}:{}:{}:{}:{}:{}",
                    o.item_name,
                    o.item_type,
                    o.count,
                    o.estimated_value,
                    o.realtime_value,
                    o.remark.as_deref().unwrap_or("")
                )
            })
            .collect::<Vec<_>>()
            .join("|");

        wtr.write_record([
            s.name.as_str(),
            s.label.as_str(),
            s.difficulty.as_str(),
            &s.output_value.to_string(),
            &s.defense_value.to_string(),
            &s.estimated_cost.to_string(),
            &s.estimated_revenue_min.to_string(),
            &s.estimated_revenue_max.to_string(),
            &s.runs_per_hour.to_string(),
            s.remark.as_deref().unwrap_or(""),
            &costs_str,
            &outputs_str,
        ])
        .map_err(|e| e.to_string())?;
    }

    let data = wtr.into_inner().map_err(|e| e.to_string())?;
    String::from_utf8(data).map_err(|e| e.to_string())
}

/// 导入策略（含 costs 和 outputs）
/// 先创建策略主表，再直接 INSERT costs 和 outputs
#[tauri::command]
pub async fn import_strategies_csv(
    state: State<'_, Arc<AppState>>,
    content: String,
) -> Result<ImportResp, String> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(content.as_bytes());

    let headers = reader.headers().map_err(|e| e.to_string())?.clone();
    let mut imported_count = 0;
    let mut error_list: Vec<String> = Vec::new();

    for (idx, result) in reader.records().enumerate() {
        let record = match result {
            Ok(r) => r,
            Err(e) => {
                error_list.push(format!("行 {}: 解析失败: {}", idx + 2, e));
                continue;
            }
        };

        let name = csv_field(&headers, &record, &["name", "名称"]).to_string();
        if name.trim().is_empty() {
            error_list.push(format!("行 {}: name 为空", idx + 2));
            continue;
        }

        let label = csv_field(&headers, &record, &["label", "标签"]).to_string();
        let difficulty = csv_field(&headers, &record, &["difficulty", "难度"]).to_string();
        let output_value: f64 = csv_field(&headers, &record, &["output_value", "产出价值"])
            .parse()
            .unwrap_or(0.0);
        let defense_value: f64 = csv_field(&headers, &record, &["defense_value", "防御价值"])
            .parse()
            .unwrap_or(0.0);
        let estimated_cost: f64 = csv_field(&headers, &record, &["estimated_cost", "预估成本"])
            .parse()
            .unwrap_or(0.0);
        let estimated_revenue_min: f64 =
            csv_field(&headers, &record, &["estimated_revenue_min", "最低收益"])
                .parse()
                .unwrap_or(0.0);
        let estimated_revenue_max: f64 =
            csv_field(&headers, &record, &["estimated_revenue_max", "最高收益"])
                .parse()
                .unwrap_or(0.0);
        let runs_per_hour: f64 = csv_field(&headers, &record, &["runs_per_hour", "每小时次数"])
            .parse()
            .unwrap_or(0.0);
        let remark_raw = csv_field(&headers, &record, &["remark", "备注"]);
        let remark = if remark_raw.is_empty() {
            None
        } else {
            Some(remark_raw.to_string())
        };
        let costs_raw = csv_field(&headers, &record, &["costs", "成本"]);
        let outputs_raw = csv_field(&headers, &record, &["outputs", "产出"]);

        let req = CreateStrategyRequest {
            name,
            label,
            difficulty,
            output_value,
            defense_value,
            estimated_cost,
            estimated_revenue_min,
            estimated_revenue_max,
            runs_per_hour,
            remark,
            image_url: None,
        };

        let strategy_id = match repo_strategy_detail::create_strategy_detail(&state.db, &req).await
        {
            Ok(id) => id,
            Err(e) => {
                error_list.push(format!("行 {}: 创建策略失败: {}", idx + 2, e));
                continue;
            }
        };

        if !costs_raw.is_empty() {
            for cost_part in costs_raw.split('|') {
                if cost_part.trim().is_empty() {
                    continue;
                }
                let fields: Vec<&str> = cost_part.split(':').collect();
                if fields.len() < 7 {
                    error_list.push(format!("行 {}: costs 格式错误: {}", idx + 2, cost_part));
                    continue;
                }
                let cost_type = fields[0].to_string();
                let item_id = fields[1].to_string();
                let item_name = if fields[2].is_empty() {
                    None
                } else {
                    Some(fields[2].to_string())
                };
                let count: f64 = fields[3].parse().unwrap_or(0.0);
                let fire_price: f64 = fields[4].parse().unwrap_or(0.0);
                let total_fire: f64 = fields[5].parse().unwrap_or(0.0);
                let is_realtime = fields[6] == "1" || fields[6].eq_ignore_ascii_case("true");

                let cost_id = Uuid::new_v4().to_string();
                let now = chrono::Utc::now().timestamp();
                if let Err(e) = sqlx::query(
                    "INSERT INTO strategy_detail_costs (id, strategy_id, cost_type, item_id, item_name, count, fire_price, total_fire, is_realtime, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(&cost_id)
                .bind(&strategy_id)
                .bind(&cost_type)
                .bind(&item_id)
                .bind(&item_name)
                .bind(count)
                .bind(fire_price)
                .bind(total_fire)
                .bind(is_realtime)
                .bind(now)
                .bind(now)
                .execute(&state.db)
                .await
                {
                    error_list.push(format!("行 {}: 插入成本失败: {}", idx + 2, e));
                }
            }
        }

        if !outputs_raw.is_empty() {
            for output_part in outputs_raw.split('|') {
                if output_part.trim().is_empty() {
                    continue;
                }
                let fields: Vec<&str> = output_part.split(':').collect();
                if fields.len() < 6 {
                    error_list.push(format!("行 {}: outputs 格式错误: {}", idx + 2, output_part));
                    continue;
                }
                let item_name = fields[0].to_string();
                let item_type = fields[1].to_string();
                let count: f64 = fields[2].parse().unwrap_or(0.0);
                let estimated_value: f64 = fields[3].parse().unwrap_or(0.0);
                let realtime_value: f64 = fields[4].parse().unwrap_or(0.0);
                let remark = if fields[5].is_empty() {
                    None
                } else {
                    Some(fields[5].to_string())
                };

                let output_id = Uuid::new_v4().to_string();
                let now = chrono::Utc::now().timestamp();
                if let Err(e) = sqlx::query(
                    "INSERT INTO strategy_detail_outputs (id, strategy_id, item_name, item_type, count, estimated_value, realtime_value, remark, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(&output_id)
                .bind(&strategy_id)
                .bind(&item_name)
                .bind(&item_type)
                .bind(count)
                .bind(estimated_value)
                .bind(realtime_value)
                .bind(&remark)
                .bind(now)
                .bind(now)
                .execute(&state.db)
                .await
                {
                    error_list.push(format!("行 {}: 插入产出失败: {}", idx + 2, e));
                }
            }
        }

        imported_count += 1;
    }

    Ok(ImportResp {
        imported: imported_count,
        errors: error_list,
    })
}
