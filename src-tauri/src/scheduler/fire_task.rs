use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::time::{interval, Duration};
use tracing::{error, info};

use crate::core::events::{emit_fire_price_updated, FirePricePayload};
use crate::core::state::{AppState, MarketMode};
use crate::scraper;

pub async fn run_fire_scrape_task(
    app: tauri::AppHandle,
    state: Arc<AppState>,
    mut abort: broadcast::Receiver<()>,
) {
    info!("Fire price scraper task started");

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

                let interval_secs = config.scrape.fire_price_scrape_interval.max(60);
                let expert_enabled = config.scrape.expert_enabled;
                let ctx = state.active_context.read().clone();
                let season_id = ctx.season_id.clone();

                // Scrape normal mode fire price (always)
                let normal_start = std::time::Instant::now();
                match scraper::qiandao::scrape_by_mode("普通").await {
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

                        // Update state fire price if current mode is normal
                        if matches!(ctx.market_mode, MarketMode::SeasonNormal) {
                            let mut fire = state.fire_price.write();
                            *fire = Some(snapshot.clone());
                            drop(fire);
                            emit_fire_price_updated(&app, FirePricePayload {
                                rmb_per_10k_fire: snapshot.rmb_per_10k_fire,
                                fire_per_rmb: snapshot.fire_per_rmb,
                                increase_ratio: snapshot.increase_ratio,
                                trading_volume: snapshot.trading_volume.clone(),
                                source: snapshot.source.clone(),
                                source_time: snapshot.source_time.clone(),
                                scraped_at: snapshot.scraped_at,
                            });
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

                // Scrape expert mode fire price if expert_enabled
                if expert_enabled {
                    let expert_start = std::time::Instant::now();
                    match scraper::qiandao::scrape_by_mode("专家").await {
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

                            // Update state fire price if current mode is expert
                            if matches!(ctx.market_mode, MarketMode::SeasonExpert) {
                                let mut fire = state.fire_price.write();
                                *fire = Some(snapshot.clone());
                                drop(fire);
                                emit_fire_price_updated(&app, FirePricePayload {
                                    rmb_per_10k_fire: snapshot.rmb_per_10k_fire,
                                    fire_per_rmb: snapshot.fire_per_rmb,
                                    increase_ratio: snapshot.increase_ratio,
                                    trading_volume: snapshot.trading_volume.clone(),
                                    source: snapshot.source.clone(),
                                    source_time: snapshot.source_time.clone(),
                                    scraped_at: snapshot.scraped_at,
                                });
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
                } else {
                    info!("Expert mode disabled, skipping expert fire price scrape");
                }

                // Update last fire scrape time
                {
                    let mut status = state.task_status.write();
                    status.last_fire_scrape = Some(chrono::Utc::now().timestamp());
                }

                ticker = interval(Duration::from_secs(interval_secs));
            }
        }
    }
}
