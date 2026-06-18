use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::time::{interval, Duration};
use tracing::{error, info, warn};

use crate::core::events::{emit_fire_price_updated, FirePricePayload};
use crate::core::state::{AppState, MarketMode};
use crate::scraper;

pub async fn run_fire_scrape_task(
    app: tauri::AppHandle,
    state: Arc<AppState>,
    mut abort: broadcast::Receiver<()>,
) {
    info!("Fire price scraper task started");

    tokio::select! {
        _ = tokio::time::sleep(Duration::from_millis(1)) => {}
        result = abort.recv() => {
            match result {
                Ok(_) | Err(broadcast::error::RecvError::Closed) => {
                    info!("Fire scrape task received abort during startup delay");
                    return;
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {}
            }
        }
    }

    let config = state.config.read().clone();
    if config.scrape.fire_price_scrape_enabled && config.scrape.fire_scrape_normal_enabled {
        match scrape_modes(&app, &state, true, false).await {
            Ok(success_count) if success_count > 0 => {
                let mut status = state.task_status.write();
                status.last_fire_scrape = Some(chrono::Utc::now().timestamp());
            }
            Ok(_) => {
                error!("Initial fire price scrape did not update any modes");
            }
            Err(e) => {
                error!("Initial fire price scrape failed: {}", e);
            }
        }
    } else {
        info!("Initial fire price scrape skipped by config");
    }

    let mut ticker = interval(Duration::from_secs(10));
    ticker.tick().await;

    loop {
        tokio::select! {
            result = abort.recv() => {
                match result {
                    Ok(_) => {
                        info!("Fire scrape task received abort");
                        break;
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        info!("Fire scrape task abort channel closed, exiting");
                        break;
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        continue;
                    }
                }
            }
            _ = ticker.tick() => {
                let config = state.config.read().clone();

                if !config.scrape.fire_price_scrape_enabled {
                    continue;
                }

                let interval_secs = config.scrape.fire_price_scrape_interval.max(30);

                let scrape_normal = config.scrape.fire_scrape_normal_enabled;
                let scrape_expert = config.scrape.fire_scrape_expert_enabled;

                match scrape_modes(&app, &state, scrape_normal, scrape_expert).await {
                    Ok(success_count) if success_count > 0 => {
                        let mut status = state.task_status.write();
                        status.last_fire_scrape = Some(chrono::Utc::now().timestamp());
                    }
                    Ok(_) => {
                        error!("Fire price scrape did not update any modes");
                    }
                    Err(e) => {
                        error!("Fire price scrape failed: {}", e);
                    }
                }

                ticker = interval(Duration::from_secs(interval_secs));
                // Tokio intervals tick immediately after creation; consume that tick
                // so the configured interval elapses before the next scrape.
                ticker.tick().await;
            }
        }
    }
}

async fn scrape_modes(
    app: &tauri::AppHandle,
    state: &Arc<AppState>,
    scrape_normal: bool,
    scrape_expert: bool,
) -> Result<usize, String> {
    let ctx = state.active_context.read().clone();
    let season_id = ctx.season_id.clone();
    let current_mode = ctx.market_mode;

    let api_config = crate::db::repo_season_api::get_season_api_config(&state.db, &season_id)
        .await
        .map_err(|e| e.to_string())?;

    let mut modes: Vec<(&str, MarketMode)> = Vec::new();
    if scrape_normal {
        modes.push(("普通", MarketMode::SeasonNormal));
    }
    if scrape_expert {
        modes.push(("专家", MarketMode::SeasonExpert));
    }

    if modes.is_empty() {
        return Ok(0);
    }

    let mut success_count = 0usize;
    for (mode_str, mode_key) in modes {
        let start = std::time::Instant::now();
        match scraper::qiandao::scrape_by_mode_with_api_config(mode_str, Some(&api_config)).await {
            Ok(snapshot) => {
                let duration_ms = start.elapsed().as_millis() as i64;

                if let Err(e) = crate::db::repo_fire::insert_fire_record(
                    &state.db,
                    &season_id,
                    mode_key.as_str(),
                    &snapshot,
                )
                .await
                {
                    warn!("Failed to insert fire record: {}", e);
                }

                if let Err(e) = crate::db::repo_source_diagnostics::upsert_diagnostic(
                    &state.db,
                    "qiandao",
                    "api",
                    true,
                    Some(mode_key.as_str()),
                    None,
                    true,
                    duration_ms,
                    None,
                    None,
                )
                .await
                {
                    warn!("Failed to upsert diagnostic: {}", e);
                }

                let mut fire_prices = state.fire_prices.write();
                fire_prices.insert(mode_key, snapshot.clone());

                info!(
                    "Fire price scraped [{}]: {} RMB/10K",
                    mode_str, snapshot.rmb_per_10k_fire
                );
                success_count += 1;

                if mode_key == current_mode {
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
            }
            Err(e) => {
                let duration_ms = start.elapsed().as_millis() as i64;
                if let Err(diag_err) = crate::db::repo_source_diagnostics::upsert_diagnostic(
                    &state.db,
                    "qiandao",
                    "api",
                    true,
                    Some(mode_key.as_str()),
                    None,
                    false,
                    duration_ms,
                    None,
                    Some(&e.to_string()),
                )
                .await
                {
                    warn!("Failed to upsert diagnostic: {}", diag_err);
                }
                error!("Fire scrape failed [{}]: {}", mode_str, e);
            }
        }
    }

    Ok(success_count)
}
