use crate::core::state::{AppState, SeasonApiConfig};
use crate::db::table_resolver::TableResolver;
use std::sync::Arc;
use tauri::State;

/// 探测结果状态
/// - Live: API 返回了最近 1 小时内的交易数据
/// - NotOpen: API 返回成功（HTTP 200）但数据为空 → 赛季/服尚未开放
/// - Error: HTTP 失败、解析失败或 ID 错误
#[derive(Debug, Clone, Copy, serde::Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProbeStatus {
    Live,
    NotOpen,
    Error,
}

/// 单个 season_id 的探测结果
#[derive(Debug, Clone, serde::Serialize)]
pub struct ProbeEntry {
    pub status: ProbeStatus,
    pub latest: Option<i64>,
    pub message: Option<String>,
}

/// 探测给定 luosi/etor season_id 是否返回实时数据（最近 1 小时有交易）
#[derive(Debug, Clone, serde::Serialize)]
pub struct SeasonProbeResult {
    pub luosi_normal: ProbeEntry,
    pub luosi_expert: ProbeEntry,
    pub etor_normal: ProbeEntry,
    pub etor_expert: ProbeEntry,
    /// 当前赛季是否已开始（任何 luosi normal 实时即视为赛季已开）
    pub season_open: bool,
}

const ETOR_BASE_URL: &str = "https://etor.710421059.xyz";

/// 探测单个螺蛳粉 season_id
async fn probe_luosi_season(client: &reqwest::Client, season_id: i32) -> ProbeEntry {
    let url = crate::scraper::luosi::api_url_for_season(season_id);
    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(_) => {
            return ProbeEntry {
                status: ProbeStatus::Error,
                latest: None,
                message: Some("网络请求失败".into()),
            };
        }
    };
    if !resp.status().is_success() {
        return ProbeEntry {
            status: ProbeStatus::Error,
            latest: None,
            message: Some(format!("HTTP {}", resp.status())),
        };
    }
    let body = match resp.text().await {
        Ok(b) => b,
        Err(_) => {
            return ProbeEntry {
                status: ProbeStatus::Error,
                latest: None,
                message: Some("读取响应失败".into()),
            };
        }
    };
    let map: std::collections::HashMap<String, serde_json::Value> = match serde_json::from_str(&body) {
        Ok(m) => m,
        Err(_) => {
            return ProbeEntry {
                status: ProbeStatus::Error,
                latest: None,
                message: Some("响应非 JSON 格式".into()),
            };
        }
    };
    if map.is_empty() {
        // API 返回 200 但无数据 → 赛季/服未开
        return ProbeEntry {
            status: ProbeStatus::NotOpen,
            latest: None,
            message: Some("API 返回空数据".into()),
        };
    }
    let latest = map
        .values()
        .filter_map(|v| v.get("last_time").and_then(|x| x.as_i64()))
        .max();
    let now = chrono::Utc::now().timestamp();
    if let Some(t) = latest {
        if (now - t) < 3600 {
            ProbeEntry {
                status: ProbeStatus::Live,
                latest: Some(t),
                message: None,
            }
        } else {
            // 数据陈旧（>1 小时）→ 可能赛季未开或暂停
            ProbeEntry {
                status: ProbeStatus::NotOpen,
                latest: Some(t),
                message: Some("数据陈旧（>1 小时）".into()),
            }
        }
    } else {
        ProbeEntry {
            status: ProbeStatus::NotOpen,
            latest: None,
            message: Some("无 last_time 字段".into()),
        }
    }
}

/// 探测单个易火 season_id（用任意已知 item_id 测试）
async fn probe_etor_season(client: &reqwest::Client, season_id: i32) -> ProbeEntry {
    let test_ids = ["5200", "10001", "113335"];
    let url_template = |id: &str| {
        format!(
            "{}/etor-api/api/chart/{}/{}?interval=15m",
            ETOR_BASE_URL, season_id, id
        )
    };
    let mut last_status = ProbeStatus::Error;
    let mut last_message = "所有测试物品都返回空".to_string();
    for item_id in test_ids {
        let url = url_template(item_id);
        let resp = match client
            .get(&url)
            .header("x-frontend-version", "10.5.50")
            .header("playroid", "20")
            .header("platform", "web")
            .header("user-agent", "Mozilla/5.0")
            .header("seasonid", season_id.to_string())
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => {
                last_message = "网络请求失败".into();
                continue;
            }
        };
        if !resp.status().is_success() {
            last_status = ProbeStatus::Error;
            last_message = format!("HTTP {}", resp.status());
            continue;
        }
        let body = match resp.text().await {
            Ok(b) => b,
            Err(_) => {
                last_status = ProbeStatus::Error;
                last_message = "读取响应失败".into();
                continue;
            }
        };
        let parsed: serde_json::Value = match serde_json::from_str(&body) {
            Ok(p) => p,
            Err(_) => {
                last_status = ProbeStatus::Error;
                last_message = "响应非 JSON 格式".into();
                continue;
            }
        };
        if let Some(trend) = parsed.get("trend").and_then(|t| t.as_array()) {
            if !trend.is_empty() {
                let latest_ts = trend
                    .iter()
                    .filter_map(|t| t.get("timestamp").and_then(|x| x.as_i64()))
                    .max();
                let now = chrono::Utc::now().timestamp() * 1000;
                if let Some(t) = latest_ts {
                    if (now - t) < 3600 * 1000 {
                        return ProbeEntry {
                            status: ProbeStatus::Live,
                            latest: Some(t / 1000),
                            message: None,
                        };
                    } else {
                        last_status = ProbeStatus::NotOpen;
                        last_message = "数据陈旧（>1 小时）".into();
                        continue;
                    }
                }
            } else {
                last_status = ProbeStatus::NotOpen;
                last_message = "trend 数组为空".into();
                continue;
            }
        }
    }
    ProbeEntry {
        status: last_status,
        latest: None,
        message: Some(last_message),
    }
}

/// 一次性探测 4 个 API season_id 是否返回实时数据
#[tauri::command]
pub async fn probe_season_api_cmd(
    #[allow(non_snake_case)] luosiSeasonIdNormal: i32,
    #[allow(non_snake_case)] luosiSeasonIdExpert: i32,
    #[allow(non_snake_case)] etorSeasonIdNormal: i32,
    #[allow(non_snake_case)] etorSeasonIdExpert: i32,
) -> Result<SeasonProbeResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| format!("创建赛季探测客户端失败: {}", e))?;
    let (luosi_normal, luosi_expert, etor_normal, etor_expert) = tokio::join!(
        probe_luosi_season(&client, luosiSeasonIdNormal),
        probe_luosi_season(&client, luosiSeasonIdExpert),
        probe_etor_season(&client, etorSeasonIdNormal),
        probe_etor_season(&client, etorSeasonIdExpert),
    );
    // 普通服任一 API 实时 → 赛季已开始
    let season_open = luosi_normal.status == ProbeStatus::Live
        || etor_normal.status == ProbeStatus::Live;
    Ok(SeasonProbeResult {
        luosi_normal,
        luosi_expert,
        etor_normal,
        etor_expert,
        season_open,
    })
}

/// 设置当前活跃赛季：传入 season_id，自动将该赛季标记为 is_current=1，
/// 其他赛季标记为 is_current=0，并切换 active_context。
#[tauri::command]
pub async fn switch_current_season_cmd(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] seasonId: String,
) -> Result<crate::commands::types::OkResponse, String> {
    // 校验赛季存在
    let exists: Option<(i64,)> = sqlx::query_as("SELECT 1 FROM seasons WHERE id = ?")
        .bind(&seasonId)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Err(format!(
            "赛季 {} 不存在，请先在 settings 中初始化",
            seasonId
        ));
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

    sqlx::query(
        "UPDATE seasons SET is_current = 1, updated_at = strftime('%s', 'now') WHERE id = ?",
    )
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
        if let Err(e) = crate::core::config::save_config(&cfg) {
            tracing::warn!("赛季已写入数据库，但桌面配置持久化失败: {}", e);
        }
    }

    let market_mode = state.active_context.read().market_mode.as_str().to_string();
    crate::core::events::emit_market_context_changed(
        &app,
        crate::core::events::MarketContextPayload {
            season_id: seasonId.clone(),
            market_mode,
        },
    );

    tracing::info!("[SEASON] 已切换当前赛季为 {}", seasonId);

    Ok(crate::commands::types::OkResponse::success(&format!(
        "已切换到赛季 {}",
        seasonId
    )))
}

/// 创建或更新目标赛季、保存 API 配置并切换为当前赛季。
/// 赛季记录和快照表初始化都是幂等操作；只有全部准备完成后才切换当前标记。
#[tauri::command]
pub async fn apply_season_switch_cmd(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] seasonId: String,
    #[allow(non_snake_case)] seasonName: String,
    #[allow(non_snake_case)] startedAt: i64,
    config: SeasonApiConfig,
) -> Result<crate::commands::types::OkResponse, String> {
    TableResolver::validate(&seasonId, "season_normal").map_err(|e| e.to_string())?;
    let season_name = seasonName.trim();
    if season_name.is_empty() {
        return Err("赛季名称不能为空".to_string());
    }
    if startedAt <= 0 {
        return Err("赛季开始时间必须有效".to_string());
    }
    if [
        config.luosi_season_id_normal,
        config.luosi_season_id_expert,
        config.etor_season_id_normal,
        config.etor_season_id_expert,
    ]
    .iter()
    .any(|value| *value <= 0)
    {
        return Err("API season_id 必须为正整数".to_string());
    }

    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        "INSERT INTO seasons (id, name, code, is_current, started_at, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             code = excluded.code,
             started_at = excluded.started_at,
             updated_at = excluded.updated_at",
    )
    .bind(&seasonId)
    .bind(season_name)
    .bind(&seasonId)
    .bind(startedAt)
    .bind(now)
    .bind(now)
    .execute(&state.db)
    .await
    .map_err(|e| format!("保存目标赛季失败: {}", e))?;

    // 先为所有已登记赛季补齐动态快照表。失败时不会改变当前赛季。
    crate::app::ensure_split_tables(&state.db).await?;

    let mut tx = state
        .db
        .begin()
        .await
        .map_err(|e| format!("开启赛季切换事务失败: {}", e))?;
    sqlx::query("UPDATE seasons SET is_current = 0, updated_at = ?")
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("重置当前赛季失败: {}", e))?;
    sqlx::query("UPDATE seasons SET is_current = 1, updated_at = ? WHERE id = ?")
        .bind(now)
        .bind(&seasonId)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("切换目标赛季失败: {}", e))?;
    sqlx::query(
        "INSERT INTO season_api_configs (
            season_id, qiandao_tag_id_normal, qiandao_spec_id_normal,
            qiandao_tag_id_expert, qiandao_spec_id_expert,
            luosi_season_id_normal, luosi_season_id_expert,
            etor_season_id_normal, etor_season_id_expert, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(season_id) DO UPDATE SET
            qiandao_tag_id_normal = excluded.qiandao_tag_id_normal,
            qiandao_spec_id_normal = excluded.qiandao_spec_id_normal,
            qiandao_tag_id_expert = excluded.qiandao_tag_id_expert,
            qiandao_spec_id_expert = excluded.qiandao_spec_id_expert,
            luosi_season_id_normal = excluded.luosi_season_id_normal,
            luosi_season_id_expert = excluded.luosi_season_id_expert,
            etor_season_id_normal = excluded.etor_season_id_normal,
            etor_season_id_expert = excluded.etor_season_id_expert,
            updated_at = excluded.updated_at",
    )
    .bind(&seasonId)
    .bind(&config.qiandao_tag_id_normal)
    .bind(&config.qiandao_spec_id_normal)
    .bind(&config.qiandao_tag_id_expert)
    .bind(&config.qiandao_spec_id_expert)
    .bind(config.luosi_season_id_normal)
    .bind(config.luosi_season_id_expert)
    .bind(config.etor_season_id_normal)
    .bind(config.etor_season_id_expert)
    .bind(now)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("保存赛季 API 配置失败: {}", e))?;
    tx.commit()
        .await
        .map_err(|e| format!("提交赛季切换事务失败: {}", e))?;

    let market_mode = {
        let mut ctx = state.active_context.write();
        ctx.season_id = seasonId.clone();
        ctx.market_mode.as_str().to_string()
    };
    {
        let mut cfg = state.config.write();
        cfg.app.season_id = seasonId.clone();
        if let Err(e) = crate::core::config::save_config(&cfg) {
            tracing::warn!("赛季已写入数据库，但桌面配置持久化失败: {}", e);
        }
    }
    crate::core::events::emit_market_context_changed(
        &app,
        crate::core::events::MarketContextPayload {
            season_id: seasonId.clone(),
            market_mode,
        },
    );

    tracing::info!("[SEASON] 已创建/更新并切换当前赛季为 {}", seasonId);
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
    /// 当前赛季开服至今的天数（按北京自然日）。
    /// 对于已结束的赛季，返回最大 season_day；当前赛季实时计算。
    pub current_season_day: i32,
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

        // 计算 current_season_day：
        //   当前赛季：now - started_at（按北京自然日）
        //   历史赛季：item_snapshots 表里 MAX(season_day)
        let current_season_day = compute_season_day(&state.db, &id, started_at, is_current_season, &item_table_normal).await;

        seasons.push(SeasonInfo {
            season_id: id,
            name,
            is_current: is_current_season,
            started_at,
            ended_at,
            item_count,
            fire_record_count: fire_count,
            current_season_day,
        });
    }

    Ok(seasons)
}

/// 计算赛季天数（用于前端显示）
async fn compute_season_day(
    db: &sqlx::SqlitePool,
    _season_id: &str,
    started_at: Option<i64>,
    is_current_season: bool,
    item_table_normal: &str,
) -> i32 {
    use crate::core::constants::SECONDS_PER_DAY;

    const BEIJING_OFFSET_SECS: i64 = 8 * 3600;

    if is_current_season {
        // 当前赛季：实时计算 now - started_at（按北京自然日）
        if let Some(start) = started_at {
            let now = chrono::Utc::now().timestamp();
            let days = ((now + BEIJING_OFFSET_SECS) / SECONDS_PER_DAY)
                - ((start + BEIJING_OFFSET_SECS) / SECONDS_PER_DAY);
            return ((days + 1).max(1)) as i32;
        }
        return 1;
    }

    // 历史赛季：从快照表里取 MAX(season_day)
    let sql = format!("SELECT COALESCE(MAX(season_day), 0) FROM {}", item_table_normal);
    let max_day: (i64,) = sqlx::query_as(&sql)
        .fetch_one(db)
        .await
        .unwrap_or((0,));
    if max_day.0 > 0 {
        return max_day.0 as i32;
    }

    // 如果快照表为空，返回 1（占位）
    1
}
