use crate::core::state::AppState;
use crate::scraper::etor::{self, MappingUpdateResult};
use std::sync::Arc;
use tauri::State;

/// 对照表本地文件名
const MAPPING_FILENAME: &str = "item_id_mapping.json";

/// 获取对照表本地文件路径
fn mapping_file_path() -> std::path::PathBuf {
    crate::core::paths::app_dir().join(MAPPING_FILENAME)
}

/// 手动更新物品对照表
/// 从刷图小助手和易火获取最新物品列表，合并到现有对照表并保存到本地文件
#[tauri::command]
pub async fn update_item_mapping(
    state: State<'_, Arc<AppState>>,
) -> Result<MappingUpdateResult, String> {
    // 获取当前赛季上下文
    let ctx = state.active_context.read().clone();
    let season_id = ctx.season_id.clone();

    // 获取赛季 API 配置
    let api_config = crate::db::repo_season_api::get_season_api_config(&state.db, &season_id)
        .await
        .map_err(|e| format!("获取赛季配置失败: {}", e))?;

    tracing::info!(
        "[MAPPING] 开始更新对照表: luosi(normal={}, expert={}), etor(normal={}, expert={})",
        api_config.luosi_season_id_normal,
        api_config.luosi_season_id_expert,
        api_config.etor_season_id_normal,
        api_config.etor_season_id_expert
    );

    // 获取刷图小助手的物品列表
    let luosi_fut = crate::scraper::luosi::fetch_luosi_item_list(api_config.luosi_season_id_normal);

    // 从 item_id_mapping 获取易火物品 ID 列表
    let etor_ids = etor::get_etor_item_ids();
    tracing::info!("[MAPPING] 易火对照表有 {} 个物品ID", etor_ids.len());

    let luosi_items = match luosi_fut.await {
        Ok(m) => {
            tracing::info!("[MAPPING] 刷图小助手返回 {} 个物品", m.len());
            m
        }
        Err(e) => {
            tracing::warn!("[MAPPING] 刷图小助手获取失败: {}, 将仅使用易火数据", e);
            std::collections::HashMap::new()
        }
    };

    if luosi_items.is_empty() && etor_ids.is_empty() {
        return Err("两个数据源都未返回数据，对照表未更新".to_string());
    }

    // 合并到现有对照表并更新内存
    let result = etor::merge_and_update_mapping(&luosi_items, &etor_ids);

    // 保存到本地文件
    let json = etor::export_mapping_json();
    let file_path = mapping_file_path();
    match std::fs::write(&file_path, &json) {
        Ok(_) => {
            tracing::info!("[MAPPING] 对照表已保存到: {:?}", file_path);
        }
        Err(e) => {
            tracing::error!("[MAPPING] 保存对照表文件失败: {}", e);
            return Err(format!("对照表已更新内存但保存文件失败: {}", e));
        }
    }

    Ok(result)
}

/// 获取当前对照表的物品数量
#[tauri::command]
pub fn get_item_mapping_count() -> usize {
    etor::get_mapping_count()
}

/// 从本地文件加载对照表（应用启动时调用）
pub fn load_local_mapping_if_exists() {
    let file_path = mapping_file_path();
    match std::fs::read_to_string(&file_path) {
        Ok(json) => match etor::load_mapping_from_json(&json) {
            Ok(count) => {
                tracing::info!("[MAPPING] 从本地文件加载对照表成功: {} 个物品", count);
            }
            Err(e) => {
                tracing::warn!("[MAPPING] 本地对照表文件解析失败: {}, 使用内置对照表", e);
            }
        },
        Err(_) => {
            tracing::info!("[MAPPING] 本地对照表文件不存在, 使用内置对照表");
        }
    }
}
