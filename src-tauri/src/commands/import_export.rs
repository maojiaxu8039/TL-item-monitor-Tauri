use crate::commands::types::{BackupInfo, DatabaseMaintenanceResult, ImportResp, OkResponse};
use crate::core::paths;
use crate::core::state::AppState;
use crate::db::repo_config;
use crate::db::repo_inventory;
use crate::db::repo_inventory::{InventoryBuyWatch, InventoryPosition};
use crate::db::repo_sections;
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
        "note",
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
            pos.note.as_str(),
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
        "note",
        "created_at",
    ])
    .map_err(|e| e.to_string())?;

    for watch in watches {
        wtr.write_record([
            watch.item_id.as_str(),
            watch.item_name.as_str(),
            &watch.target_buy_price.to_string(),
            &watch.max_quantity.unwrap_or(0).to_string(),
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

        let item_id = record.get(0).unwrap_or("").trim().to_string();
        let item_name = record.get(1).unwrap_or("").trim().to_string();
        if item_id.is_empty() || item_name.is_empty() {
            error_list.push(format!("行 {}: item_id 或 item_name 为空", idx + 2));
            continue;
        }

        let buy_price: f64 = match record.get(2).unwrap_or("0").parse() {
            Ok(v) if v > 0.0 => v,
            _ => {
                error_list.push(format!("行 {}: 无效的买入价格", idx + 2));
                continue;
            }
        };
        let quantity: i64 = record.get(3).unwrap_or("1").parse().unwrap_or(1);
        let target_sell_price: Option<f64> = record.get(4).and_then(|s| s.parse().ok());
        let total_cost: f64 = record.get(5).unwrap_or("0").parse().unwrap_or(0.0);
        let note = record.get(6).unwrap_or("").to_string();
        let bought_at: i64 = record
            .get(7)
            .and_then(|s| s.parse().ok())
            .unwrap_or_else(|| chrono::Utc::now().timestamp());

        let extra_cost = (total_cost - buy_price * quantity as f64).max(0.0);

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
            fee_rate: 0.125,
            target_sell_price,
            bought_at,
            status: "holding".to_string(),
            sold_price: None,
            sold_at: None,
            note,
            alert_enabled: true,
            last_alert_at: None,
            created_at: chrono::Utc::now().timestamp(),
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

        let item_id = record.get(0).unwrap_or("").trim().to_string();
        let item_name = record.get(1).unwrap_or("").trim().to_string();
        if item_id.is_empty() || item_name.is_empty() {
            error_list.push(format!("行 {}: item_id 或 item_name 为空", idx + 2));
            continue;
        }

        let target_buy_price: f64 = match record.get(2).unwrap_or("0").parse() {
            Ok(v) if v > 0.0 => v,
            _ => {
                error_list.push(format!("行 {}: 无效的目标买入价", idx + 2));
                continue;
            }
        };
        let max_quantity: Option<i64> = record.get(3).and_then(|s| s.parse().ok());
        let note = record.get(4).unwrap_or("").to_string();

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
            alert_enabled: true,
            auto_create_position: false,
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
