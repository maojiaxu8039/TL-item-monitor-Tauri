use crate::commands::types::{DashboardSummary, FirePriceUI, ImportResp, OkResponse};
use crate::core::events::{
    emit_fire_price_updated, emit_items_updated, emit_task_status_changed, FirePricePayload,
    ItemsUpdatedPayload, TaskStatusPayload,
};
use crate::core::state::{AppState, FirePriceSnapshot, MarketMode};
use crate::db::repo_arbitrage;
use crate::db::repo_fire;
use crate::db::repo_history;
use crate::db::repo_inventory;
use crate::db::repo_item_realtime_prices;
use crate::db::repo_items;
use crate::db::repo_sections;
use crate::db::table_resolver::TableResolver;
use crate::scraper;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn get_dashboard_summary(
    state: State<'_, Arc<AppState>>,
) -> Result<DashboardSummary, String> {
    let ctx = state.active_context.read().clone();
    let fire_prices = state.fire_prices.read().clone();
    let fire = fire_prices.get(&ctx.market_mode).cloned();
    let status = state.task_status.read().clone();

    let (item_count, db_count, totals) = tokio::join!(
        repo_items::get_items_count(&state.db, &ctx.season_id, ctx.market_mode.as_str()),
        repo_items::get_db_record_count(&state.db),
        repo_sections::get_totals(&state.db, &ctx.season_id, ctx.market_mode.as_str())
    );

    let (total_fire, total_rmb) = totals.unwrap_or((0.0, 0.0));

    let last_fire_at = status
        .last_fire_scrape
        .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0))
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());

    let last_items_at = status
        .last_items_reload
        .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0))
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());

    let history_fire = if let Some(ref current_fire) = fire {
        let season_start = repo_fire::get_season_start(&state.db, &ctx.season_id)
            .await
            .unwrap_or(crate::core::constants::SS12_START_TIMESTAMP);
        let current_season_day =
            crate::core::constants::calculate_season_day(current_fire.scraped_at, season_start);
        let current_hour = ((current_fire.scraped_at % 86400) / 3600) as i32;

        repo_fire::get_previous_season_fire_by_season_day(
            &state.db,
            &ctx.season_id,
            ctx.market_mode.as_str(),
            current_season_day,
            current_hour,
        )
        .await
        .ok()
        .flatten()
        .map(|record| {
            FirePriceUI::from(FirePriceSnapshot {
                price_per_wan: record.rmb_per_10k_fire,
                rmb_per_10k_fire: record.rmb_per_10k_fire,
                fire_per_rmb: record.fire_per_rmb,
                increase_ratio: record.increase_ratio,
                trading_volume: record.trading_volume,
                source: record.source,
                source_time: record.source_time,
                scraped_at: record.scraped_at,
            })
        })
    } else {
        None
    };

    let profitable_arbitrage_count = repo_arbitrage::count_profitable_arbitrage(
        &state.db,
        &ctx.season_id,
        ctx.market_mode.as_str(),
    )
    .await
    .unwrap_or(0);

    let positions =
        repo_inventory::list_positions(&state.db, &ctx.season_id, ctx.market_mode.as_str())
            .await
            .unwrap_or_default();

    let mut position_cost_fire = 0.0;
    let mut position_current_value_fire = 0.0;
    for p in &positions {
        position_cost_fire += p.buy_price * p.quantity as f64;
    }

    let position_views = repo_inventory::list_positions_with_current_price(
        &state.db,
        &ctx.season_id,
        ctx.market_mode.as_str(),
    )
    .await
    .unwrap_or_default();
    for v in &position_views {
        if let Some(cp) = v.current_price {
            position_current_value_fire += cp * v.position.quantity as f64;
        }
    }

    let rmb_per_10k = fire.as_ref().map(|f| f.rmb_per_10k_fire).unwrap_or(0.0);
    let position_cost_rmb = if rmb_per_10k > 0.0 {
        position_cost_fire * rmb_per_10k / 10000.0
    } else {
        0.0
    };
    let position_current_value_rmb = if rmb_per_10k > 0.0 {
        position_current_value_fire * rmb_per_10k / 10000.0
    } else {
        0.0
    };

    Ok(DashboardSummary {
        fire: fire.map(FirePriceUI::from),
        history_fire,
        total_fire,
        total_rmb,
        season_name: ctx.season_id.clone(),
        market_mode: ctx.market_mode.as_str().to_string(),
        item_count: item_count.unwrap_or(0),
        db_record_count: db_count.unwrap_or(0),
        last_fire_at,
        last_items_at,
        task_running: status.fire_scrape_running || status.items_reload_running,
        profitable_arbitrage_count,
        position_cost_fire,
        position_cost_rmb,
        position_current_value_fire,
        position_current_value_rmb,
    })
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn set_active_market_context(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] seasonId: String,
    #[allow(non_snake_case)] marketMode: String,
) -> Result<OkResponse, String> {
    tracing::info!(
        "set_active_market_context called with: seasonId={:?}, marketMode={:?}",
        seasonId,
        marketMode
    );

    let mode = match marketMode.as_str() {
        "season_expert" => MarketMode::SeasonExpert,
        _ => MarketMode::SeasonNormal,
    };

    {
        let mut ctx = state.active_context.write();
        ctx.season_id = seasonId.clone();
        ctx.market_mode = mode;
    }

    // Sync config
    if let Ok(mut cfg) = crate::core::config::load_config() {
        cfg.app.season_id = seasonId.clone();
        cfg.scrape.fire_price_mode = mode.as_str().to_string();
        if let Err(e) = crate::core::config::save_config(&cfg) {
            tracing::warn!("Failed to save config after context switch: {}", e);
        }
    }

    // Context switching should be light: use local snapshots immediately and leave
    // network refreshes to the scheduled/manual refresh paths.
    load_fire_from_db(&state, &app, &seasonId, mode.as_str()).await;

    // Emit context changed event
    crate::core::events::emit_market_context_changed(
        &app,
        crate::core::events::MarketContextPayload {
            season_id: seasonId.clone(),
            market_mode: mode.as_str().to_string(),
        },
    );

    // Refresh in-memory items cache from local DB for the new context.
    let mode_str = mode.as_str().to_string();
    let season_for_cache = seasonId.clone();
    let state_clone = Arc::clone(&state);
    let app_for_items = app.clone();
    tokio::spawn(async move {
        match repo_items::get_items_from_realtime_table(
            &state_clone.db,
            &season_for_cache,
            &mode_str,
        )
        .await
        {
            Ok(items) => {
                let count = items.len() as i64;
                let mut cache = state_clone.items_cache.write();
                *cache = Arc::new(items);
                emit_items_updated(
                    &app_for_items,
                    ItemsUpdatedPayload {
                        count,
                        updated_at: chrono::Utc::now(),
                    },
                );
                tracing::info!(
                    "Items cache loaded from DB for season={}, mode={}, count={}",
                    season_for_cache,
                    mode_str,
                    count
                );
            }
            Err(e) => {
                tracing::warn!("Failed to load items from DB: {}", e);
            }
        }
    });

    Ok(OkResponse::success("Market context updated"))
}

async fn load_fire_from_db(
    state: &State<'_, Arc<AppState>>,
    app: &tauri::AppHandle,
    season_id: &str,
    market_mode: &str,
) {
    let mode = match market_mode {
        "season_expert" => MarketMode::SeasonExpert,
        _ => MarketMode::SeasonNormal,
    };

    match repo_fire::get_latest_fire(&state.db, season_id, market_mode).await {
        Ok(Some(record)) => {
            let snapshot = FirePriceSnapshot {
                price_per_wan: record.rmb_per_10k_fire,
                rmb_per_10k_fire: record.rmb_per_10k_fire,
                fire_per_rmb: record.fire_per_rmb,
                increase_ratio: record.increase_ratio,
                trading_volume: record.trading_volume,
                source: record.source,
                source_time: record.source_time,
                scraped_at: record.scraped_at,
            };
            let mut fire_prices = state.fire_prices.write();
            fire_prices.insert(mode, snapshot.clone());
            drop(fire_prices);
            emit_fire_price_updated(
                app,
                FirePricePayload {
                    rmb_per_10k_fire: snapshot.rmb_per_10k_fire,
                    fire_per_rmb: snapshot.fire_per_rmb,
                    increase_ratio: snapshot.increase_ratio,
                    trading_volume: snapshot.trading_volume.clone(),
                    source: snapshot.source.clone(),
                    source_time: snapshot.source_time.clone(),
                    scraped_at: snapshot.scraped_at,
                },
            );
        }
        _ => {
            let mut fire_prices = state.fire_prices.write();
            fire_prices.remove(&mode);
        }
    }
}

#[tauri::command]
pub async fn refresh_fire_price(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<FirePriceUI, String> {
    let ctx = state.active_context.read().clone();
    let mode_str = match ctx.market_mode {
        MarketMode::SeasonExpert => "专家",
        _ => "普通",
    };
    let api_config = crate::db::repo_season_api::get_season_api_config(&state.db, &ctx.season_id)
        .await
        .map_err(|e| e.to_string())?;

    let snapshot =
        scraper::qiandao::scrape_by_mode_with_api_config(mode_str, Some(&api_config)).await?;

    if let Err(e) = repo_fire::insert_fire_record(
        &state.db,
        &ctx.season_id,
        ctx.market_mode.as_str(),
        &snapshot,
    )
    .await
    {
        tracing::warn!("Failed to insert fire record: {}", e);
    }

    {
        let mut fire_prices = state.fire_prices.write();
        fire_prices.insert(ctx.market_mode, snapshot.clone());
    }
    let last_fire_scrape = chrono::Utc::now().timestamp();
    let last_items_reload = {
        let mut status = state.task_status.write();
        status.last_fire_scrape = Some(last_fire_scrape);
        status.last_items_reload
    };
    emit_fire_price_updated(
        &app,
        FirePricePayload {
            rmb_per_10k_fire: snapshot.rmb_per_10k_fire,
            fire_per_rmb: snapshot.fire_per_rmb,
            increase_ratio: snapshot.increase_ratio,
            trading_volume: snapshot.trading_volume.clone(),
            source: snapshot.source.clone(),
            source_time: snapshot.source_time.clone(),
            scraped_at: snapshot.scraped_at,
        },
    );
    emit_task_status_changed(
        &app,
        TaskStatusPayload {
            fire_scrape_running: false,
            items_reload_running: false,
            last_fire_scrape: Some(last_fire_scrape),
            last_items_reload,
        },
    );

    Ok(FirePriceUI::from(snapshot))
}

#[tauri::command]
pub async fn refresh_items(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<OkResponse, String> {
    let Some(_refresh_guard) = state.try_begin_items_refresh() else {
        return Ok(OkResponse::success(
            "物品刷新正在进行中，已跳过重复刷新请求",
        ));
    };

    let ctx = state.active_context.read().clone();
    let items_source = state.config.read().scrape.items_source.clone();

    tracing::info!(
        "[REFRESH] items_source={}, season={}, mode={}",
        items_source,
        ctx.season_id,
        ctx.market_mode.as_str()
    );

    let api_config = crate::db::repo_season_api::get_season_api_config(&state.db, &ctx.season_id)
        .await
        .map_err(|e| format!("Failed to get season API config: {}", e))?;

    let items = scraper::scrape_items_by_source(
        &ctx.season_id,
        ctx.market_mode.as_str(),
        &items_source,
        "",
        &api_config,
    )
    .await
    .map_err(|e| format!("Scrape failed: {}", e))?;

    let count = items.len() as i64;

    let ctx = state.active_context.read().clone();
    crate::db::repo_items::bulk_insert_items(
        &state.db,
        &ctx.season_id,
        ctx.market_mode.as_str(),
        &items,
    )
    .await
    .map_err(|e| format!("Bulk insert failed: {}", e))?;
    repo_item_realtime_prices::record_item_prices(
        &state.db,
        &items,
        &ctx.season_id,
        ctx.market_mode.as_str(),
    )
    .await
    .map_err(|e| format!("Realtime price insert failed: {}", e))?;
    if let Err(e) = repo_item_realtime_prices::cleanup_old_records(&state.db).await {
        tracing::warn!("[REFRESH] Failed to cleanup old realtime prices: {}", e);
    }

    {
        let mut cache = state.items_cache.write();
        *cache = Arc::new(items);
    }
    let last_fire_scrape = {
        let status = state.task_status.read();
        status.last_fire_scrape
    };
    let last_items_reload = chrono::Utc::now().timestamp();
    {
        let mut status = state.task_status.write();
        status.last_items_reload = Some(last_items_reload);
    }
    emit_items_updated(
        &app,
        ItemsUpdatedPayload {
            count,
            updated_at: chrono::Utc::now(),
        },
    );
    emit_task_status_changed(
        &app,
        TaskStatusPayload {
            fire_scrape_running: false,
            items_reload_running: false,
            last_fire_scrape,
            last_items_reload: Some(last_items_reload),
        },
    );

    Ok(OkResponse::success(&format!(
        "Items refreshed: {} items",
        count
    )))
}

#[tauri::command]
pub async fn get_fire_history(
    state: State<'_, Arc<AppState>>,
    hours: i64,
) -> Result<Vec<serde_json::Value>, String> {
    let ctx = state.active_context.read().clone();
    let result =
        repo_fire::get_fire_history(&state.db, &ctx.season_id, ctx.market_mode.as_str(), hours)
            .await?;
    // If no data found in time range, return all data for the season
    if result.is_empty() {
        Ok(repo_fire::get_fire_history_all(
            &state.db,
            &ctx.season_id,
            ctx.market_mode.as_str(),
            10000,
            0,
        )
        .await?)
    } else {
        Ok(result)
    }
}

#[tauri::command]
pub async fn get_fire_history_by_season(
    state: State<'_, Arc<AppState>>,
    season_id: String,
    market_mode: String,
    _hours: i64,
) -> Result<Vec<serde_json::Value>, String> {
    if let Err(e) = crate::db::table_resolver::TableResolver::validate(&season_id, &market_mode) {
        return Err(e.to_string());
    }
    // The analysis page compares seasons at hourly granularity. Collapse any
    // higher-frequency legacy/server samples to the latest sample per hour.
    Ok(repo_fire::get_fire_history_hourly(&state.db, &season_id, &market_mode).await?)
}

#[tauri::command]
pub async fn export_fire_history_csv(
    state: State<'_, Arc<AppState>>,
    hours: i64,
) -> Result<String, String> {
    let ctx = state.active_context.read().clone();
    let records =
        repo_fire::get_fire_history(&state.db, &ctx.season_id, ctx.market_mode.as_str(), hours)
            .await?;
    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record([
        "rmb_per_10k_fire",
        "fire_per_rmb",
        "increase_ratio",
        "scraped_at",
    ])
    .map_err(|e| e.to_string())?;
    for r in records {
        let rmb_per_10k_fire = r
            .get("rmb_per_10k_fire")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let fire_per_rmb = r
            .get("fire_per_rmb")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let increase_ratio = r.get("increase_ratio").and_then(|v| v.as_f64());
        let scraped_at = r.get("scraped_at").and_then(|v| v.as_i64()).unwrap_or(0);
        wtr.write_record([
            rmb_per_10k_fire.to_string(),
            fire_per_rmb.to_string(),
            increase_ratio.map(|v| v.to_string()).unwrap_or_default(),
            scraped_at.to_string(),
        ])
        .map_err(|e| e.to_string())?;
    }
    let data = wtr.into_inner().map_err(|e| e.to_string())?;
    String::from_utf8(data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_fire_history_csv(
    state: State<'_, Arc<AppState>>,
    content: String,
) -> Result<ImportResp, String> {
    let ctx = state.active_context.read().clone();
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(content.as_bytes());

    let mut imported_count = 0;
    let mut error_list: Vec<String> = Vec::new();

    let table = TableResolver::fire_price_table(&ctx.season_id, ctx.market_mode.as_str());

    for (idx, result) in reader.records().enumerate() {
        let record = match result {
            Ok(r) => r,
            Err(e) => {
                error_list.push(format!("行 {}: 解析失败: {}", idx + 2, e));
                continue;
            }
        };

        let rmb_per_10k_fire: f64 = match record.get(0).unwrap_or("0").parse() {
            Ok(v) if v > 0.0 => v,
            _ => {
                error_list.push(format!("行 {}: 无效的火价", idx + 2));
                continue;
            }
        };
        let fire_per_rmb: f64 = record.get(1).unwrap_or("0").parse().unwrap_or(0.0);
        let increase_ratio: Option<f64> =
            record
                .get(2)
                .and_then(|s| if s.is_empty() { None } else { s.parse().ok() });
        let scraped_at: i64 = record
            .get(3)
            .and_then(|s| s.parse().ok())
            .unwrap_or_else(|| chrono::Utc::now().timestamp());

        let now = chrono::Utc::now().timestamp();

        let result = sqlx::query(&format!(
            r#"INSERT INTO {} (rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume, source, source_time, scraped_at, created_at)
               VALUES (?, ?, ?, NULL, 'import', NULL, ?, ?)
               ON CONFLICT(scraped_at) DO UPDATE SET
                   rmb_per_10k_fire = excluded.rmb_per_10k_fire,
                   fire_per_rmb = excluded.fire_per_rmb,
                   increase_ratio = excluded.increase_ratio,
                   created_at = excluded.created_at"#,
            table
        ))
        .bind(rmb_per_10k_fire)
        .bind(fire_per_rmb)
        .bind(increase_ratio)
        .bind(scraped_at)
        .bind(now)
        .execute(&state.db)
        .await;

        match result {
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
pub async fn get_season_summary(
    state: State<'_, Arc<AppState>>,
) -> Result<repo_history::SeasonSummary, String> {
    let ctx = state.active_context.read().clone();
    repo_history::get_season_summary(&state.db, &ctx.season_id, ctx.market_mode.as_str())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_season_trends(
    state: State<'_, Arc<AppState>>,
    hours: Option<i64>,
) -> Result<Vec<repo_history::SeasonTrendHour>, String> {
    let ctx = state.active_context.read().clone();
    repo_history::get_season_trends(
        &state.db,
        &ctx.season_id,
        ctx.market_mode.as_str(),
        hours.unwrap_or(24),
    )
    .await
    .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct SyncFireRecordParams {
    pub season_id: String,
    pub market_mode: String,
    pub rmb_per_10k_fire: f64,
    pub fire_per_rmb: f64,
    pub increase_ratio: f64,
    pub trading_volume: String,
    pub source: String,
    pub source_time: String,
    pub recorded_at: i64,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct SyncFireBatchParams {
    pub season_id: String,
    pub market_mode: String,
    pub records: Vec<SyncFireRecordParams>,
}

#[tauri::command]
pub async fn sync_fire_record(
    state: State<'_, Arc<AppState>>,
    params: SyncFireRecordParams,
) -> Result<OkResponse, String> {
    repo_history::insert_fire_snapshot(
        &state.db,
        &params.season_id,
        &params.market_mode,
        &FirePriceSnapshot {
            price_per_wan: params.rmb_per_10k_fire,
            rmb_per_10k_fire: params.rmb_per_10k_fire,
            fire_per_rmb: params.fire_per_rmb,
            increase_ratio: Some(params.increase_ratio),
            trading_volume: Some(params.trading_volume),
            source: params.source,
            source_time: Some(params.source_time),
            scraped_at: params.recorded_at,
        },
        params.recorded_at,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(OkResponse::success("Fire record synced"))
}

#[tauri::command]
pub async fn sync_fire_batch(
    state: State<'_, Arc<AppState>>,
    params: SyncFireBatchParams,
) -> Result<OkResponse, String> {
    if params.records.is_empty() {
        return Ok(OkResponse::success("No records to sync"));
    }

    let target_season = params.season_id.clone();
    let target_mode = params.market_mode.clone();
    let batch_items: Vec<repo_history::FireSnapshotBatchItem> = params
        .records
        .into_iter()
        .map(|r| repo_history::FireSnapshotBatchItem {
            snapshot: FirePriceSnapshot {
                price_per_wan: r.rmb_per_10k_fire,
                rmb_per_10k_fire: r.rmb_per_10k_fire,
                fire_per_rmb: r.fire_per_rmb,
                increase_ratio: Some(r.increase_ratio),
                trading_volume: Some(r.trading_volume),
                source: r.source,
                source_time: Some(r.source_time),
                scraped_at: r.recorded_at.div_euclid(3600) * 3600,
            },
            scraped_at: r.recorded_at.div_euclid(3600) * 3600,
        })
        .collect();

    let active_context = state.active_context.read().clone();
    let inserted = if active_context.season_id == target_season
        && active_context.market_mode.as_str() == target_mode
    {
        repo_history::insert_fire_snapshots_batch(
            &state.db,
            &target_season,
            &target_mode,
            batch_items,
        )
        .await
    } else {
        repo_history::insert_fire_history_snapshots_batch(
            &state.db,
            &target_season,
            &target_mode,
            batch_items,
        )
        .await
    }
    .map_err(|e| e.to_string())?;

    Ok(OkResponse::success(&format!(
        "Batch synced: {} records",
        inserted
    )))
}

#[tauri::command]
pub async fn get_fire_price_compare(
    state: State<'_, Arc<AppState>>,
    history_season: String,
) -> Result<repo_history::FirePriceCompareResult, String> {
    let ctx = state.active_context.read().clone();
    repo_history::get_fire_price_compare(
        &state.db,
        &ctx.season_id,
        &history_season,
        ctx.market_mode.as_str(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_fire_price_insight(
    state: State<'_, Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    let ctx = state.active_context.read().clone();
    let history =
        repo_fire::get_fire_history(&state.db, &ctx.season_id, ctx.market_mode.as_str(), 168)
            .await?;

    if history.is_empty() {
        return Ok(serde_json::json!({
            "current_fire_price": 0.0,
            "avg_fire_price": 0.0,
            "fire_trend": "stable",
            "fire_trend_percent": 0.0,
            "best_buy_time": "暂无数据",
            "best_sell_time": "暂无数据",
        }));
    }

    let prices: Vec<f64> = history
        .iter()
        .map(|r| {
            r.get("rmb_per_10k_fire")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0)
        })
        .filter(|&p| p > 0.0)
        .collect();

    let current = prices.first().copied().unwrap_or(0.0);
    let avg = prices.iter().sum::<f64>() / prices.len() as f64;
    let min = prices.iter().copied().fold(f64::INFINITY, f64::min);
    let max = prices.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let trend_percent = if avg > 0.0 {
        ((current - avg) / avg) * 100.0
    } else {
        0.0
    };
    let trend = if trend_percent > 5.0 {
        "up"
    } else if trend_percent < -5.0 {
        "down"
    } else {
        "stable"
    };

    let best_buy_time = if current > avg * 1.1 {
        "火价处于高位，建议等待火价回落至均价附近再购入"
    } else if current < avg * 0.9 {
        "火价处于低位，是购入火的好时机"
    } else {
        "火价处于正常区间，可按需交易"
    };

    let best_sell_time = if current > avg * 1.1 {
        "火价处于高位，适合出售物品换取RMB"
    } else if current < avg * 0.9 {
        "火价处于低位，建议等待上涨后再出售"
    } else {
        "火价处于正常区间，可按需交易"
    };

    Ok(serde_json::json!({
        "current_fire_price": current,
        "avg_fire_price": avg,
        "min_fire_price": min,
        "max_fire_price": max,
        "fire_trend": trend,
        "fire_trend_percent": trend_percent,
        "best_buy_time": best_buy_time,
        "best_sell_time": best_sell_time,
    }))
}
