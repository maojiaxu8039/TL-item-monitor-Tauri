use std::sync::Arc;
use tokio::sync::broadcast;
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
            _ = tokio::time::sleep(std::time::Duration::from_secs(10)) => {
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
                let ctx = state.active_context.read().clone();
                let mode_str = match ctx.market_mode {
                    MarketMode::SeasonExpert => "专家",
                    _ => "普通",
                };

                let start = std::time::Instant::now();
                match scraper::qiandao::scrape_by_mode(mode_str).await {
                    Ok(snapshot) => {
                        let duration_ms = start.elapsed().as_millis() as i64;

                        // Immediately persist to DB with current context
                        let _ = crate::db::repo_fire::insert_fire_record(
                            &state.db,
                            &ctx.season_id,
                            ctx.market_mode.as_str(),
                            &snapshot,
                        ).await;

                        let _ = crate::db::repo_source_diagnostics::upsert_diagnostic(
                            &state.db,
                            "qiandao",
                            "api",
                            true,
                            Some(ctx.market_mode.as_str()),
                            None,
                            true,
                            duration_ms,
                            None,
                            None,
                        ).await;

                        {
                            let mut fire = state.fire_price.write();
                            *fire = Some(snapshot.clone());
                        }
                        {
                            let mut status = state.task_status.write();
                            status.last_fire_scrape = Some(chrono::Utc::now().timestamp());
                        }

                        emit_fire_price_updated(&app, FirePricePayload {
                            rmb_per_10k_fire: snapshot.rmb_per_10k_fire,
                            fire_per_rmb: snapshot.fire_per_rmb,
                            increase_ratio: snapshot.increase_ratio,
                            trading_volume: snapshot.trading_volume.clone(),
                            source: snapshot.source.clone(),
                            source_time: snapshot.source_time.clone(),
                            scraped_at: snapshot.scraped_at,
                        });

                        info!("Fire price scraped [{}]: {} RMB/10K", mode_str, snapshot.rmb_per_10k_fire);

                        tokio::time::sleep(std::time::Duration::from_secs(interval_secs as u64)).await;
                    }
                    Err(e) => {
                        let duration_ms = start.elapsed().as_millis() as i64;
                        let _ = crate::db::repo_source_diagnostics::upsert_diagnostic(
                            &state.db,
                            "qiandao",
                            "api",
                            true,
                            Some(ctx.market_mode.as_str()),
                            None,
                            false,
                            duration_ms,
                            None,
                            Some(&e.to_string()),
                        ).await;
                        error!("Fire scrape failed [{}]: {}", mode_str, e);

                        tokio::time::sleep(std::time::Duration::from_secs(interval_secs as u64)).await;
                    }
                }
            }
        }
    }
}
