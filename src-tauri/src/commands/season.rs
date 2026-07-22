use crate::core::state::{AppState, SeasonApiConfig};
use crate::db::table_resolver::TableResolver;
use std::sync::Arc;
use tauri::State;

/// 探测给定 luosi/etor season_id 是否返回实时数据（最近 1 小时有交易）
#[derive(Debug, Clone, serde::Serialize)]
pub struct SeasonProbeResult {
    pub luosi_normal_ok: bool,
    pub luosi_normal_latest: Option<i64>,
    pub luosi_expert_ok: bool,
    pub luosi_expert_latest: Option<i64>,
    pub etor_normal_ok: bool,
    pub etor_normal_latest: Option<i64>,
    pub etor_expert_ok: bool,
    pub etor_expert_latest: Option<i64>,
}

const LUOSI_BASE_URL: &str = "http://115.231.176.101:8080";
const ETOR_BASE_URL: &str = "https://etor.710421059.xyz";

/// 探测单个螺蛳粉 season_id
async fn probe_luosi_season(season_id: i32) -> (bool, Option<i64>) {
    let url = format!("{}/get?season_id={}", LUOSI_BASE_URL, season_id);
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
    {
        Ok(c) => c,
        Err(_) => return (false, None),
    };
    match client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            match resp.text().await {
                Ok(body) => {
                    if let Ok(map) =
                        serde_json::from_str::<std::collections::HashMap<String, serde_json::Value>>(&body)
                    {
                        let latest = map
                            .values()
                            .filter_map(|v| v.get("last_time").and_then(|x| x.as_i64()))
                            .max();
                        let now = chrono::Utc::now().timestamp();
                        let is_recent = latest.map(|t| now - t < 3600).unwrap_or(false);
                        (is_recent, latest)
                    } else {
                        (false, None)
                    }
                }
                Err(_) => (false, None),
            }
        }
        _ => (false, None),
    }
}

/// 探测单个易火 season_id（用任意已知 item_id 测试）
async fn probe_etor_season(season_id: i32) -> (bool, Option<i64>) {
    // 用一个常见 item_id 测试响应（5200 是 SS12/SS13 都可能有的物品）
    let test_ids = ["5200", "10001", "113335"];
    let url_template = |id: &str| {
        format!("{}/etor-api/api/chart/{}/{}?interval=15m", ETOR_BASE_URL, season_id, id)
    };
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
    {
        Ok(c) => c,
        Err(_) => return (false, None),
    };
    for item_id in test_ids {
        let url = url_template(item_id);
        match client
            .get(&url)
            .header("x-frontend-version", "10.5.50")
            .header("playroid", "20")
            .header("platform", "web")
            .header("user-agent", "Mozilla/5.0")
            .header("seasonid", season_id.to_string())
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(body) = resp.text().await {
                    if let Ok(parsed) =
                        serde_json::from_str::<serde_json::Value>(&body)
                    {
                        if let Some(trend) =
                            parsed.get("trend").and_then(|t| t.as_array())
                        {
                            if !trend.is_empty() {
                                let latest_ts = trend
                                    .iter()
                                    .filter_map(|t| {
                                        t.get("timestamp").and_then(|x| x.as_i64())
                                    })
                                    .max();
                                let now = chrono::Utc::now().timestamp() * 1000;
                                let is_recent = latest_ts
                                    .map(|t| now - t < 3600 * 1000)
                                    .unwrap_or(false);
                                return (is_recent, latest_ts.map(|t| t / 1000));
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
    (false, None)
}

/// 一次性探测 4 个 API season_id 是否返回实时数据
#[tauri::command]
pub async fn probe_season_api_cmd(
    #[allow(non_snake_case)] luosiSeasonIdNormal: i32,
    #[allow(non_snake_case)] luosiSeasonIdExpert: i32,
    #[allow(non_snake_case)] etorSeasonIdNormal: i32,
    #[allow(non_snake_case)] etorSeasonIdExpert: i32,
) -> Result<SeasonProbeResult, String> {
    let (luosi_normal_ok, luosi_normal_latest) =
        probe_luosi_season(luosiSeasonIdNormal).await;
    let (luosi_expert_ok, luosi_expert_latest) =
        probe_luosi_season(luosiSeasonIdExpert).await;
    let (etor_normal_ok, etor_normal_latest) =
        probe_etor_season(etorSeasonIdNormal).await;
    let (etor_expert_ok, etor_expert_latest) =
        probe_etor_season(etorSeasonIdExpert).await;
    Ok(SeasonProbeResult {
        luosi_normal_ok,
        luosi_normal_latest,
        luosi_expert_ok,
        luosi_expert_latest,
        etor_normal_ok,
        etor_normal_latest,
        etor_expert_ok,
        etor_expert_latest,
    })
}

/// 设置当前活跃赛季：传入 season_id，自动将该赛季标记为 is_current=1，
/// 其他赛季标记为 is_current=0，并切换 active_context。
#[tauri::command]
pub async fn switch_current_season_cmd(
    state: State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] seasonId: String,
) -> Result<crate::commands::types::OkResponse, String> {
    // 校验赛季存在
    let exists: Option<(i64,)> = sqlx::query_as(
        "SELECT 1 FROM seasons WHERE id = ?",
    )
    .bind(&seasonId)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Err(format!("赛季 {} 不存在，请先在 settings 中初始化", seasonId));
    }

    let mut tx = state
        .db
        .begin()
        .await
        .map_err(|e| format!("开启事务失败: {}", e))?;

    sqlx::query("UPDATE seasons SET is_current = 0, updated_at = strftime('%s', 'now')")
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("重置赛季失败: {}", e))?;

    sqlx::query("UPDATE seasons SET is_current = 1, updated_at = strftime('%s', 'now') WHERE id = ?")
        .bind(&seasonId)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("设置当前赛季失败: {}", e))?;

    tx.commit()
        .await
        .map_err(|e| format!("提交事务失败: {}", e))?;

    // 同步切换 active_context 和 config.app.season_id
    {
        let mut ctx = state.active_context.write();
        ctx.season_id = seasonId.clone();
    }
    {
        let mut cfg = state.config.write();
        cfg.app.season_id = seasonId.clone();
    }

    tracing::info!("[SEASON] 已切换当前赛季为 {}", seasonId);

    Ok(crate::commands::types::OkResponse::success(&format!(
        "已切换到赛季 {}",
        seasonId
    )))
}

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
    pub etor_season_id_normal: i32,
    pub etor_season_id_expert: i32,
}

/// Get API config for a season.
#[tauri::command]
pub async fn get_season_api_config_cmd(
    state: State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] seasonId: String,
) -> Result<SeasonApiConfigResponse, String> {
    let config = crate::db::repo_season_api::get_season_api_config(&state.db, &seasonId)
        .await
        .map_err(|e| e.to_string())?;

    Ok(SeasonApiConfigResponse {
        season_id: seasonId,
        qiandao_tag_id_normal: config.qiandao_tag_id_normal,
        qiandao_spec_id_normal: config.qiandao_spec_id_normal,
        qiandao_tag_id_expert: config.qiandao_tag_id_expert,
        qiandao_spec_id_expert: config.qiandao_spec_id_expert,
        luosi_season_id_normal: config.luosi_season_id_normal,
        luosi_season_id_expert: config.luosi_season_id_expert,
        etor_season_id_normal: config.etor_season_id_normal,
        etor_season_id_expert: config.etor_season_id_expert,
    })
}

/// Set API config for a season.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn set_season_api_config_cmd(
    state: State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] seasonId: String,
    #[allow(non_snake_case)] qiandaoTagIdNormal: String,
    #[allow(non_snake_case)] qiandaoSpecIdNormal: String,
    #[allow(non_snake_case)] qiandaoTagIdExpert: String,
    #[allow(non_snake_case)] qiandaoSpecIdExpert: String,
    #[allow(non_snake_case)] luosiSeasonIdNormal: i32,
    #[allow(non_snake_case)] luosiSeasonIdExpert: i32,
    #[allow(non_snake_case)] etorSeasonIdNormal: i32,
    #[allow(non_snake_case)] etorSeasonIdExpert: i32,
) -> Result<crate::commands::types::OkResponse, String> {
    let config = SeasonApiConfig {
        qiandao_tag_id_normal: qiandaoTagIdNormal,
        qiandao_spec_id_normal: qiandaoSpecIdNormal,
        qiandao_tag_id_expert: qiandaoTagIdExpert,
        qiandao_spec_id_expert: qiandaoSpecIdExpert,
        luosi_season_id_normal: luosiSeasonIdNormal,
        luosi_season_id_expert: luosiSeasonIdExpert,
        etor_season_id_normal: etorSeasonIdNormal,
        etor_season_id_expert: etorSeasonIdExpert,
    };

    crate::db::repo_season_api::set_season_api_config(&state.db, &seasonId, &config)
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
