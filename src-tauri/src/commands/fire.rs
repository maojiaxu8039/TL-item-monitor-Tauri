use crate::commands::types::{FirePriceUI, OkResponse, DashboardSummary};
use crate::core::state::{AppState, MarketMode, FirePriceSnapshot};
use crate::db::repo_fire;
use crate::db::repo_items;
use crate::db::repo_sections;
use crate::db::repo_history;
use crate::scraper;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn get_dashboard_summary(state: State<'_, Arc<AppState>>) -> Result<DashboardSummary, String> {
    let ctx = state.active_context.read().clone();
    let fire = state.fire_price.read().clone();
    let status = state.task_status.read().clone();

    let (item_count, totals) = tokio::join!(
        repo_items::get_items_count(&state.db, &ctx.season_id, ctx.market_mode.as_str()),
        repo_sections::get_totals(&state.db, &ctx.season_id, ctx.market_mode.as_str())
    );

    let (total_fire, total_rmb) = totals.unwrap_or((0.0, 0.0));

    let last_fire_at = status.last_fire_scrape
        .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0))
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());

    let last_items_at = status.last_items_reload
        .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0))
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());

    Ok(DashboardSummary {
        fire: fire.map(FirePriceUI::from),
        total_fire,
        total_rmb,
        season_name: ctx.season_id.clone(),
        market_mode: ctx.market_mode.as_str().to_string(),
        item_count: item_count.unwrap_or(0),
        db_record_count: 0, // TODO: implement for split tables
        last_fire_at,
        last_items_at,
        task_running: status.fire_scrape_running || status.items_reload_running,
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
        seasonId, marketMode
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
        let _ = crate::core::config::save_config(&cfg);
    }

    // Refresh fire price from DB for new context
    match repo_fire::get_latest_fire(&state.db, &seasonId, mode.as_str()).await {
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
            {
                let mut fire = state.fire_price.write();
                *fire = Some(snapshot);
            }
        }
        _ => {
            // Clear fire price if no data for new context
            let mut fire = state.fire_price.write();
            *fire = None;
        }
    }

    // Emit context changed event
    crate::core::events::emit_market_context_changed(
        &app,
        crate::core::events::MarketContextPayload {
            season_id: seasonId,
            market_mode: mode.as_str().to_string(),
        },
    );

    Ok(OkResponse::success("Market context updated"))
}

#[tauri::command]
pub async fn refresh_fire_price(state: State<'_, Arc<AppState>>) -> Result<FirePriceUI, String> {
    let ctx = state.active_context.read().clone();
    let mode_str = match ctx.market_mode {
        MarketMode::SeasonExpert => "专家",
        _ => "普通",
    };

    let snapshot = scraper::qiandao::scrape_by_mode(mode_str).await?;

    let _ = repo_fire::insert_fire_record(
        &state.db,
        &ctx.season_id,
        ctx.market_mode.as_str(),
        &snapshot,
    ).await;

    {
        let mut fire = state.fire_price.write();
        *fire = Some(snapshot.clone());
    }

    Ok(FirePriceUI::from(snapshot))
}

#[tauri::command]
pub async fn refresh_items(state: State<'_, Arc<AppState>>) -> Result<OkResponse, String> {
    let ctx = state.active_context.read().clone();
    let items = crate::scraper::scrape_items(&ctx.season_id, ctx.market_mode.as_str())
        .await
        .map_err(|e| format!("Scrape failed: {}", e))?;
    let count = items.len() as i64;

    let ctx = state.active_context.read().clone();
    crate::db::repo_items::bulk_insert_items(&state.db, &ctx.season_id, ctx.market_mode.as_str(), &items)
        .await
        .map_err(|e| format!("Bulk insert failed: {}", e))?;

    {
        let mut cache = state.items_cache.write();
        *cache = items;
    }
    {
        let mut status = state.task_status.write();
        status.last_items_reload = Some(chrono::Utc::now().timestamp());
    }

    Ok(OkResponse::success(&format!("Items refreshed: {} items", count)))
}

#[tauri::command]
pub async fn get_fire_history(
    state: State<'_, Arc<AppState>>,
    hours: i64,
) -> Result<Vec<serde_json::Value>, String> {
    let ctx = state.active_context.read().clone();
    let result = repo_fire::get_fire_history(&state.db, &ctx.season_id, ctx.market_mode.as_str(), hours).await?;
    // If no data found in time range, return all data for the season
    if result.is_empty() {
        Ok(repo_fire::get_fire_history_all(&state.db, &ctx.season_id, ctx.market_mode.as_str()).await?)
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
    // Always return all data for the season
    // Time filtering is done on the frontend based on user's selected range
    Ok(repo_fire::get_fire_history_all(&state.db, &season_id, &market_mode).await?)
}

#[tauri::command]
pub async fn export_fire_history_csv(state: State<'_, Arc<AppState>>, hours: i64) -> Result<String, String> {
    let ctx = state.active_context.read().clone();
    let records = repo_fire::get_fire_history(&state.db, &ctx.season_id, ctx.market_mode.as_str(), hours).await?;
    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record(["rmb_per_10k_fire", "fire_per_rmb", "increase_ratio", "scraped_at"])
        .map_err(|e| e.to_string())?;
    for r in records {
        let rmb_per_10k_fire = r.get("rmb_per_10k_fire").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let fire_per_rmb = r.get("fire_per_rmb").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let increase_ratio = r.get("increase_ratio").and_then(|v| v.as_f64());
        let scraped_at = r.get("scraped_at").and_then(|v| v.as_i64()).unwrap_or(0);
        wtr.write_record([
            rmb_per_10k_fire.to_string(),
            fire_per_rmb.to_string(),
            increase_ratio.map(|v| v.to_string()).unwrap_or_default(),
            scraped_at.to_string(),
        ]).map_err(|e| e.to_string())?;
    }
    let data = wtr.into_inner().map_err(|e| e.to_string())?;
    String::from_utf8(data).map_err(|e| e.to_string())
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
    repo_history::get_season_trends(&state.db, &ctx.season_id, ctx.market_mode.as_str(), hours.unwrap_or(24))
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
    let history = repo_fire::get_fire_history(&state.db, &ctx.season_id, ctx.market_mode.as_str(), 168).await?;
    
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

    let prices: Vec<f64> = history.iter()
        .map(|r| r.get("rmb_per_10k_fire").and_then(|v| v.as_f64()).unwrap_or(0.0))
        .filter(|&p| p > 0.0)
        .collect();

    let current = prices.first().copied().unwrap_or(0.0);
    let avg = prices.iter().sum::<f64>() / prices.len() as f64;
    let min = prices.iter().copied().fold(f64::INFINITY, f64::min);
    let max = prices.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let trend_percent = if avg > 0.0 { ((current - avg) / avg) * 100.0 } else { 0.0 };
    let trend = if trend_percent > 5.0 { "up" } else if trend_percent < -5.0 { "down" } else { "stable" };

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

#[tauri::command]
pub async fn get_item_price_insights(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<serde_json::Value>, String> {
    let ctx = state.active_context.read().clone();
    let items = repo_items::search_items(&state.db, &ctx.season_id, ctx.market_mode.as_str(), "", 1, 100, None, None).await?;
    let item_history = repo_history::get_all_item_history(&state.db, &ctx.season_id, ctx.market_mode.as_str(), 168).await?;

    let mut insights = Vec::new();

    for (item_id, name, current_price) in items.0.iter().map(|i| (i.item_id.clone(), i.name.clone(), i.price)) {
        let history: Vec<f64> = item_history.iter()
            .filter(|h| h.item_id == item_id)
            .map(|h| h.fire_price)
            .collect();

        if history.len() < 3 {
            continue;
        }

        let avg = history.iter().sum::<f64>() / history.len() as f64;
        let min = history.iter().copied().fold(f64::INFINITY, f64::min);
        let max = history.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        let trend_percent = if avg > 0.0 { ((current_price - avg) / avg) * 100.0 } else { 0.0 };
        let trend = if trend_percent > 5.0 { "up" } else if trend_percent < -5.0 { "down" } else { "stable" };

        let (recommendation, reason) = if current_price < avg * 0.85 {
            ("buy", format!("价格低于均价{}%，处于低位", ((1.0 - current_price / avg) * 100.0).round()))
        } else if current_price > avg * 1.15 {
            ("sell", format!("价格高于均价{}%，处于高位", ((current_price / avg - 1.0) * 100.0).round()))
        } else {
            ("wait", "价格处于正常区间，建议观望".to_string())
        };

        insights.push(serde_json::json!({
            "item_id": item_id,
            "item_name": name,
            "current_price": current_price,
            "avg_price": avg,
            "min_price": min,
            "max_price": max,
            "price_trend": trend,
            "trend_percent": trend_percent,
            "recommendation": recommendation,
            "confidence": 85,
            "reason": reason,
        }));
    }

    // 按推荐排序：buy > wait > sell
    insights.sort_by(|a, b| {
        let a_rec = a.get("recommendation").and_then(|v| v.as_str()).unwrap_or("wait");
        let b_rec = b.get("recommendation").and_then(|v| v.as_str()).unwrap_or("wait");
        let order = |rec: &str| match rec {
            "buy" => 0,
            "wait" => 1,
            "sell" => 2,
            _ => 3,
        };
        order(a_rec).cmp(&order(b_rec))
    });

    Ok(insights.into_iter().take(50).collect())
}
