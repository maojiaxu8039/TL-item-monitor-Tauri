//! 火价快照自动补全任务
//!
//! 每小时跑一次：扫描所有 `fire_price_snapshots_<season>_<mode>` 表，
//! 检测最近的整点小时是否缺失，若缺失则用前后两个真实数据点线性插值补全。
//!
//! 目的：scrape 任务在整点窗口偶发失败时（API 抖动、应用重启、网络断开），
//! 自动补全缺口，避免图表断点。
//!
//! **限制**：
//! - 只补"最近 24 小时"的缺失点（避免给老数据乱插）
//! - 只在前后都有真实数据时才插值（不会用插值再去插值）
//! - 一次最多补 6 个连续缺失点（避免大批量异常数据被覆盖）

use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tokio::time::interval;
use tracing::{debug, info, warn};

use crate::db::table_resolver::TableResolver;
use crate::core::state::AppState;
use crate::core::constants::calculate_season_day;

/// 跑任务的时间间隔（1 小时跑一次）
const CHECK_INTERVAL_SECS: u64 = 3600;

/// 启动后延迟多久第一次跑（等 scrape 任务先跑一次）
const INITIAL_DELAY_SECS: u64 = 90;

/// 补全窗口：只补最近 N 秒内的缺失点（避免给老数据乱插）
const RECENT_WINDOW_SECS: i64 = 24 * 3600;

/// 一次扫描最多补几个连续缺失点（避免大批量异常数据被覆盖）
const MAX_GAPS_PER_SCAN: usize = 6;

pub async fn run_fire_gap_filler_task(
    state: Arc<AppState>,
    mut abort: broadcast::Receiver<()>,
) {
    info!("Fire gap filler task started");

    // 启动延迟：等 scrape 任务先跑
    tokio::select! {
        _ = tokio::time::sleep(Duration::from_secs(INITIAL_DELAY_SECS)) => {}
        result = abort.recv() => {
            match result {
                Ok(_) | Err(broadcast::error::RecvError::Closed) => {
                    info!("Fire gap filler aborted during startup delay");
                    return;
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {}
            }
        }
    }

    let mut ticker = interval(Duration::from_secs(CHECK_INTERVAL_SECS));
    ticker.tick().await; // 跳过首次立即触发

    loop {
        tokio::select! {
            result = abort.recv() => {
                match result {
                    Ok(_) => {
                        info!("Fire gap filler received abort");
                        break;
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        info!("Fire gap filler abort channel closed");
                        break;
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                }
            }
            _ = ticker.tick() => {
                if let Err(e) = scan_and_fill_gaps(&state).await {
                    warn!("Fire gap filler scan failed: {}", e);
                }
            }
        }
    }
}

/// 扫描所有 season × mode 组合，补全最近窗口内的整点缺失点
async fn scan_and_fill_gaps(state: &Arc<AppState>) -> Result<(), String> {
    let ctx = state.active_context.read().clone();
    let season_id = ctx.season_id.clone();
    let market_mode = ctx.market_mode.as_str().to_string();

    // 1. 取所有 seasons + 模式组合（不仅当前激活的）
    let combos = list_season_mode_combos(state).await?;
    debug!("Fire gap filler scanning {} combinations", combos.len());

    let mut total_filled = 0usize;
    for (season, mode) in combos {
        match fill_gaps_for(&state.db, &season, &mode).await {
            Ok(n) => {
                if n > 0 {
                    info!("Filled {} gaps in {}/{}", n, season, mode);
                }
                total_filled += n;
            }
            Err(e) => {
                warn!("Failed to fill gaps for {}/{}: {}", season, mode, e);
            }
        }
    }

    if total_filled > 0 {
        info!(
            "Fire gap filler: total {} gaps filled across all seasons/modes",
            total_filled
        );
    }

    // 抑制 unused warning
    let _ = (season_id, market_mode);
    Ok(())
}

/// 列出所有需要扫描的 (season, mode) 组合
async fn list_season_mode_combos(
    state: &Arc<AppState>,
) -> Result<Vec<(String, String)>, String> {
    let mut combos = Vec::new();

    // 从数据库读所有赛季
    let rows: Vec<(String,)> = sqlx::query_as("SELECT id FROM seasons")
        .fetch_all(&state.db)
        .await
        .map_err(|e| format!("query seasons: {}", e))?;

    for (season,) in rows {
        for mode in ["season_normal", "season_expert"] {
            if TableResolver::is_supported(&season, mode) {
                combos.push((season.clone(), mode.to_string()));
            }
        }
    }

    Ok(combos)
}

/// 对单个 (season, mode) 表扫描缺失点并插值补全
async fn fill_gaps_for(
    pool: &sqlx::SqlitePool,
    season_id: &str,
    market_mode: &str,
) -> Result<usize, String> {
    TableResolver::validate(season_id, market_mode).map_err(|e| e.to_string())?;
    let table = TableResolver::fire_price_snapshots_table(season_id, market_mode);

    let now_ts = chrono::Utc::now().timestamp();
    let window_start = now_ts - RECENT_WINDOW_SECS;

    // 1. 取最近 24 小时所有数据点（按 scraped_at 排序）
    // 排除 source = '插值' 的行（避免对插值再插值）
    let rows: Vec<(i64, f64, f64, String)> = sqlx::query_as(&format!(
        "SELECT scraped_at, rmb_per_10k_fire, fire_per_rmb, source FROM {}
         WHERE scraped_at >= ? AND source != '插值'
         ORDER BY scraped_at",
        table
    ))
    .bind(window_start)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("query snapshots: {}", e))?;

    if rows.len() < 2 {
        return Ok(0); // 没有足够数据点来插值
    }

    // 2. 找出窗口内缺失的整点
    let existing_hours: std::collections::HashSet<i64> = rows.iter().map(|(ts, _, _, _)| *ts).collect();
    let first_ts = rows.first().unwrap().0;
    let last_ts = rows.last().unwrap().0;

    let mut missing: Vec<i64> = Vec::new();
    let mut ts = first_ts + 3600;
    while ts < last_ts {
        if !existing_hours.contains(&ts) {
            missing.push(ts);
        }
        ts += 3600;
    }

    // 限制最大缺口数（避免大量异常）
    if missing.len() > MAX_GAPS_PER_SCAN {
        warn!(
            "Too many missing hours in {}/{} ({}), skipping (max {})",
            table, market_mode, missing.len(), MAX_GAPS_PER_SCAN
        );
        return Ok(0);
    }

    if missing.is_empty() {
        return Ok(0);
    }

    // 3. 对每个缺失点找前后最近的两个真实数据点，线性插值
    let mut filled = 0usize;
    for ts in missing {
        // 找前一个点
        let prev = rows.iter().rev().find(|(t, _, _, _)| *t < ts);
        let next = rows.iter().find(|(t, _, _, _)| *t > ts);

        if let (Some((prev_ts, prev_rmb, _prev_fpr, _)), Some((next_ts, next_rmb, _next_fpr, _))) =
            (prev, next)
        {
            // 线性插值（按时间比例）
            let total_span = (next_ts - prev_ts) as f64;
            if total_span <= 0.0 {
                continue;
            }
            let ratio = (ts - prev_ts) as f64 / total_span;
            let avg_rmb = prev_rmb + (next_rmb - prev_rmb) * ratio;
            // fire_per_rmb 强制 = 10000 / rmb 满足数学关系
            let avg_fpr = 10000.0 / avg_rmb;

            // 写入数据库（INSERT OR IGNORE 避免覆盖已有真实数据）
            let result = sqlx::query(&format!(
                "INSERT OR IGNORE INTO {}
                 (rmb_per_10k_fire, fire_per_rmb, increase_ratio, trading_volume,
                  source, source_time, scraped_at, season_day)
                 VALUES (?, ?, 0, '', '插值', '', ?, ?)",
                table
            ))
            .bind(avg_rmb)
            .bind(avg_fpr)
            .bind(ts)
            .bind(calculate_season_day(
                ts,
                crate::core::constants::get_season_start(season_id).unwrap_or(ts),
            ))
            .execute(pool)
            .await;

            match result {
                Ok(_) => {
                    debug!(
                        "Filled gap in {}: ts={} rmb={:.4} (prev={:.4}, next={:.4})",
                        table, ts, avg_rmb, prev_rmb, next_rmb
                    );
                    filled += 1;
                }
                Err(e) => {
                    warn!("Failed to insert gap fill for ts={}: {}", ts, e);
                }
            }
        } else {
            // 缺失点在边界（首尾），没有前后两个真实数据点 → 跳过
            debug!("Skipping gap ts={} in {}: no surrounding real points", ts, table);
        }
    }

    Ok(filled)
}