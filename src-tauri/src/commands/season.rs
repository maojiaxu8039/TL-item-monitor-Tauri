use crate::core::state::{AppState, SeasonApiConfig};
use crate::db::table_resolver::TableResolver;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, serde::Serialize)]
pub struct SeasonInfo {
    pub season_id: String,
    pub name: String,
    pub is_current: bool,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub item_count: i64,
    pub fire_record_count: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SeasonApiConfigResponse {
    pub season_id: String,
    pub qiandao_tag_id_normal: String,
    pub qiandao_spec_id_normal: String,
    pub qiandao_tag_id_expert: String,
    pub qiandao_spec_id_expert: String,
    pub luosi_season_id_normal: i32,
    pub luosi_season_id_expert: i32,
}

/// Get API config for a season.
#[tauri::command]
pub async fn get_season_api_config_cmd(
    state: State<'_, Arc<AppState>>,
    season_id: String,
) -> Result<SeasonApiConfigResponse, String> {
    let config = crate::db::repo_season_api::get_season_api_config(&state.db, &season_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(SeasonApiConfigResponse {
        season_id,
        qiandao_tag_id_normal: config.qiandao_tag_id_normal,
        qiandao_spec_id_normal: config.qiandao_spec_id_normal,
        qiandao_tag_id_expert: config.qiandao_tag_id_expert,
        qiandao_spec_id_expert: config.qiandao_spec_id_expert,
        luosi_season_id_normal: config.luosi_season_id_normal,
        luosi_season_id_expert: config.luosi_season_id_expert,
    })
}

/// Set API config for a season.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn set_season_api_config_cmd(
    state: State<'_, Arc<AppState>>,
    season_id: String,
    qiandao_tag_id_normal: String,
    qiandao_spec_id_normal: String,
    qiandao_tag_id_expert: String,
    qiandao_spec_id_expert: String,
    luosi_season_id_normal: i32,
    luosi_season_id_expert: i32,
) -> Result<crate::commands::types::OkResponse, String> {
    let config = SeasonApiConfig {
        qiandao_tag_id_normal,
        qiandao_spec_id_normal,
        qiandao_tag_id_expert,
        qiandao_spec_id_expert,
        luosi_season_id_normal,
        luosi_season_id_expert,
    };

    crate::db::repo_season_api::set_season_api_config(&state.db, &season_id, &config)
        .await
        .map_err(|e| e.to_string())?;

    Ok(crate::commands::types::OkResponse::success("API配置已保存"))
}

/// List all seasons with basic stats.
#[tauri::command]
pub async fn list_seasons(state: State<'_, Arc<AppState>>) -> Result<Vec<SeasonInfo>, String> {
    #[allow(clippy::type_complexity)]
    let rows: Vec<(String, String, i32, Option<i64>, Option<i64>)> = sqlx::query_as(
        "SELECT id, name, is_current, started_at, ended_at FROM seasons ORDER BY started_at DESC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let mut seasons = Vec::new();
    for (id, name, is_current, started_at, ended_at) in rows {
        let is_current_season = is_current == 1;
        let item_table_normal;
        let item_table_expert;
        let fire_table_normal;
        let fire_table_expert;

        if is_current_season {
            item_table_normal = TableResolver::items_table(&id, "season_normal");
            item_table_expert = TableResolver::items_table(&id, "season_expert");
            fire_table_normal = TableResolver::fire_price_table(&id, "season_normal");
            fire_table_expert = TableResolver::fire_price_table(&id, "season_expert");
        } else {
            item_table_normal = TableResolver::item_snapshots_table(&id, "season_normal");
            item_table_expert = TableResolver::item_snapshots_table(&id, "season_expert");
            fire_table_normal = TableResolver::fire_price_snapshots_table(&id, "season_normal");
            fire_table_expert = TableResolver::fire_price_snapshots_table(&id, "season_expert");
        }

        let mut item_count = 0i64;
        for table in [&item_table_normal, &item_table_expert] {
            let count: (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {}", table))
                .fetch_one(&state.db)
                .await
                .unwrap_or((0,));
            item_count += count.0;
        }

        let mut fire_count = 0i64;
        for table in [&fire_table_normal, &fire_table_expert] {
            let count: (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {}", table))
                .fetch_one(&state.db)
                .await
                .unwrap_or((0,));
            fire_count += count.0;
        }

        seasons.push(SeasonInfo {
            season_id: id,
            name,
            is_current: is_current_season,
            started_at,
            ended_at,
            item_count,
            fire_record_count: fire_count,
        });
    }

    Ok(seasons)
}
