use crate::commands::types::{BackupInfo, ImportResp, OkResponse};
use crate::core::paths;
use crate::core::state::AppState;
use crate::db::repo_config;
use crate::db::repo_sections;
use crate::db::table_resolver::TableResolver;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn import_watchlist_csv(
    state: State<'_, Arc<AppState>>,
    content: String,
) -> Result<ImportResp, String> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(content.as_bytes());

    let mut imported_count = 0;
    let mut error_list = Vec::new();

    for (idx, result) in reader.records().enumerate() {
        if let Ok(record) = result {
            if record.len() >= 7 {
                let section_id = record.get(0).unwrap_or("");
                let season_id = record.get(1).unwrap_or("ss12");
                let market_mode = record.get(2).unwrap_or("season_normal");
                let item_id = record.get(3).unwrap_or("");
                let purchase_fire_price: f64 =
                    record.get(4).and_then(|s| s.parse().ok()).unwrap_or(0.0);
                let count: i32 = record.get(5).and_then(|s| s.parse().ok()).unwrap_or(1);
                let more_value: f64 = record.get(6).and_then(|s| s.parse().ok()).unwrap_or(0.0);

                if let Err(e) = TableResolver::validate(season_id, market_mode) {
                    error_list.push(format!("行 {}: {}", idx + 2, e));
                    continue;
                }

                match repo_sections::add_section_item(
                    &state.db,
                    section_id,
                    season_id,
                    market_mode,
                    item_id,
                    purchase_fire_price,
                    count,
                    more_value,
                )
                .await
                {
                    Ok(_) => imported_count += 1,
                    Err(e) => error_list.push(format!("行 {}: {}", idx + 2, e)),
                }
            } else {
                error_list.push(format!("行 {}: 列数不足", idx + 2));
            }
        } else {
            error_list.push(format!("行 {}: CSV 记录格式错误", idx + 2));
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

    let rows: Vec<(String, String, String, String, String, String, String, String)> = sqlx::query_as(
        "SELECT section_id, season_id, market_mode, item_id, purchase_fire_price, count, more_value, COALESCE(last_time, '') FROM section_items WHERE season_id = ? AND market_mode = ? ORDER BY section_id, sort_order, created_at"
    )
    .bind(&ctx.season_id)
    .bind(ctx.market_mode.as_str())
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record([
        "section_id",
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
        ])
        .map_err(|e| e.to_string())?;
    }

    let data = wtr.into_inner().map_err(|e| e.to_string())?;
    String::from_utf8(data).map_err(|e| e.to_string())
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
    let _ = repo_config::save_config(&state.db, "last_backup_at", &now).await;

    Ok(OkResponse::success("备份已创建"))
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

    // Backup current database before restore
    let backup_path = db_path.with_extension("db.backup");
    let _ = tokio::fs::copy(&db_path, &backup_path).await;

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
    let bytes = base64::decode(&base64_content).map_err(|e| format!("Base64解码错误: {}", e))?;
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
    Ok(base64::encode(&bytes))
}
