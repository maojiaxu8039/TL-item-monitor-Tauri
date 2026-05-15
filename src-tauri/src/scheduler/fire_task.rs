use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::time::{interval, Duration};
use tracing::{error, info};

use crate::core::events::{emit_fire_price_updated, FirePricePayload};
use crate::core::state::{AppState, MarketMode};
use crate::scraper;

const INITIAL_FIRE_SCRAPE_DELAY_SECS: u64 = 0;

pub async fn run_fire_scrape_task(
    app: tauri::AppHandle,
    state: Arc<AppState>,
    mut abort: broadcast::Receiver<()>,
) {
    info!("Fire price scraper task started");

    tokio::select! {
        _ = tokio::time::sleep(Duration::from_secs(INITIAL_FIRE_SCRAPE_DELAY_SECS)) => {}
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

    // Immediately scrape once on startup
    info!("Performing initial fire price scrape on startup");
    if let Err(e) = scrape_and_update_fire(&app, &state).await {
        error!("Initial fire price scrape failed: {}", e);
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
                let config = match crate::core::config::load_config() {
                    Ok(cfg) => cfg,
                    Err(e) => {
                        error!("Failed to load config: {}", e);
                        continue;
                    }
                };

                if !config.scrape.fire_price_scrape_enabled {
                    continue;
                }

                let interval_secs = config.scrape.fire_price_scrape_interval.max(30);
                let ctx = state.active_context.read().clone();
                let season_id = ctx.season_id.clone();
                let api_config =
                    match crate::db::repo_season_api::get_season_api_config(&state.db, &season_id)
                        .await
                    {
                        Ok(config) => config,
                        Err(e) => {
                            error!("Failed to load season API config: {}", e);
                            crate::core::state::SeasonApiConfig::default()
                        }
                    };

                let mut current_mode_fire: Option<FirePricePayload> = None;

                let normal_start = std::time::Instant::now();
                match scraper::qiandao::scrape_by_mode_with_api_config("普通", Some(&api_config)).await {
                    Ok(snapshot) => {
                        let duration_ms = normal_start.elapsed().as_millis() as i64;

                        let _ = crate::db::repo_fire::insert_fire_record(
                            &state.db,
                            &season_id,
                            "season_normal",
                            &snapshot,
                        ).await;

                        let _ = crate::db::repo_source_diagnostics::upsert_diagnostic(
                            &state.db,
                            "qiandao",
                            "api",
                            true,
                            Some("season_normal"),
                            None,
                            true,
                            duration_ms,
                            None,
                            None,
                        ).await;

                        if matches!(ctx.market_mode, MarketMode::SeasonNormal) {
                            current_mode_fire = Some(FirePricePayload {
                                rmb_per_10k_fire: snapshot.rmb_per_10k_fire,
                                fire_per_rmb: snapshot.fire_per_rmb,
                                increase_ratio: snapshot.increase_ratio,
                                trading_volume: snapshot.trading_volume.clone(),
                                source: snapshot.source.clone(),
                                source_time: snapshot.source_time.clone(),
                                scraped_at: snapshot.scraped_at,
                            });
                            let mut fire = state.fire_price.write();
                            *fire = Some(snapshot.clone());
                        }

                        info!("Fire price scraped [normal]: {} RMB/10K", snapshot.rmb_per_10k_fire);
                    }
                    Err(e) => {
                        let duration_ms = normal_start.elapsed().as_millis() as i64;
                        let _ = crate::db::repo_source_diagnostics::upsert_diagnostic(
                            &state.db,
                            "qiandao",
                            "api",
                            true,
                            Some("season_normal"),
                            None,
                            false,
                            duration_ms,
                            None,
                            Some(&e.to_string()),
                        ).await;
                        error!("Fire scrape failed [normal]: {}", e);
                    }
                }

                let expert_start = std::time::Instant::now();
                match scraper::qiandao::scrape_by_mode_with_api_config("专家", Some(&api_config)).await {
                    Ok(snapshot) => {
                        let duration_ms = expert_start.elapsed().as_millis() as i64;

                        let _ = crate::db::repo_fire::insert_fire_record(
                            &state.db,
                            &season_id,
                            "season_expert",
                            &snapshot,
                        ).await;

                        let _ = crate::db::repo_source_diagnostics::upsert_diagnostic(
                            &state.db,
                            "qiandao",
                            "api",
                            true,
                            Some("season_expert"),
                            None,
                            true,
                            duration_ms,
                            None,
                            None,
                        ).await;

                        if matches!(ctx.market_mode, MarketMode::SeasonExpert) {
                            current_mode_fire = Some(FirePricePayload {
                                rmb_per_10k_fire: snapshot.rmb_per_10k_fire,
                                fire_per_rmb: snapshot.fire_per_rmb,
                                increase_ratio: snapshot.increase_ratio,
                                trading_volume: snapshot.trading_volume.clone(),
                                source: snapshot.source.clone(),
                                source_time: snapshot.source_time.clone(),
                                scraped_at: snapshot.scraped_at,
                            });
                            let mut fire = state.fire_price.write();
                            *fire = Some(snapshot.clone());
                        }

                        info!("Fire price scraped [expert]: {} RMB/10K", snapshot.rmb_per_10k_fire);
                    }
                    Err(e) => {
                        let duration_ms = expert_start.elapsed().as_millis() as i64;
                        let _ = crate::db::repo_source_diagnostics::upsert_diagnostic(
                            &state.db,
                            "qiandao",
                            "api",
                            true,
                            Some("season_expert"),
                            None,
                            false,
                            duration_ms,
                            None,
                            Some(&e.to_string()),
                        ).await;
                        error!("Fire scrape failed [expert]: {}", e);
                    }
                }

                if let Some(fire_payload) = current_mode_fire {
                    emit_fire_price_updated(&app, fire_payload);
                }

                {
                    let mut status = state.task_status.write();
                    status.last_fire_scrape = Some(chrono::Utc::now().timestamp());
                }

                ticker = interval(Duration::from_secs(interval_secs));
            }
        }
    }
}

pub async fn scrape_and_update_fire(app: &tauri::AppHandle, state: &Arc<AppState>) -> Result<(), String> {
    let _config = crate::core::config::load_config().map_err(|e| e.to_string())?;
    let ctx = state.active_context.read().clone();
    let season_id = ctx.season_id.clone();
    let api_config = crate::db::repo_season_api::get_season_api_config(&state.db, &season_id)
        .await
        .map_err(|e| e.to_string())?;

    let mode_str = match ctx.market_mode {
        MarketMode::SeasonExpert => "专家",
        _ => "普通",
    };

    let snapshot = scraper::qiandao::scrape_by_mode_with_api_config(mode_str, Some(&api_config))
        .await
        .map_err(|e| e.to_string())?;

    let _ = crate::db::repo_fire::insert_fire_record(
        &state.db,
        &season_id,
        ctx.market_mode.as_str(),
        &snapshot,
    ).await;

    {
        let mut fire = state.fire_price.write();
        *fire = Some(snapshot.clone());
    }

    emit_fire_price_updated(app, FirePricePayload {
        rmb_per_10k_fire: snapshot.rmb_per_10k_fire,
        fire_per_rmb: snapshot.fire_per_rmb,
        increase_ratio: snapshot.increase_ratio,
        trading_volume: snapshot.trading_volume.clone(),
        source: snapshot.source.clone(),
        source_time: snapshot.source_time.clone(),
        scraped_at: snapshot.scraped_at,
    });

    info!("Initial fire price scraped: {} RMB/10K for {}", snapshot.rmb_per_10k_fire, mode_str);
    Ok(())
}