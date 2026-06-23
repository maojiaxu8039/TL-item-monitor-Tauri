use crate::commands::types::OkResponse;
use crate::core::state::AppState;
use crate::db::models_arbitrage::ArbitrageCalculationResult;
use crate::db::repo_arbitrage;
use crate::db::repo_inventory;
use crate::db::repo_sections;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State, WebviewWindow};

const MINI_DEFAULT_WIDTH: i32 = 360;
const MINI_DEFAULT_HEIGHT: i32 = 540;
const MINI_MIN_WIDTH: i32 = 320;
const MINI_MIN_HEIGHT: i32 = 400;
const MAIN_DEFAULT_WIDTH: i32 = 1280;
const MAIN_DEFAULT_HEIGHT: i32 = 720;
const MAIN_MIN_WIDTH: i32 = 900;
const MAIN_MIN_HEIGHT: i32 = 600;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct WindowModeState {
    pub mini_mode: bool,
    pub opacity: f64,
    pub always_on_top: bool,
    pub width: i32,
    pub height: i32,
    pub x: Option<i32>,
    pub y: Option<i32>,
}

impl Default for WindowModeState {
    fn default() -> Self {
        Self {
            mini_mode: false,
            opacity: 0.92,
            always_on_top: true,
            width: MINI_DEFAULT_WIDTH,
            height: MINI_DEFAULT_HEIGHT,
            x: None,
            y: None,
        }
    }
}

#[tauri::command]
pub async fn get_window_mode_state(
    state: State<'_, Arc<AppState>>,
) -> Result<WindowModeState, String> {
    let config = state.config.read();
    let desktop = &config.desktop;

    Ok(WindowModeState {
        mini_mode: desktop.mini_mode,
        opacity: desktop.mini_opacity,
        always_on_top: desktop.mini_always_on_top,
        width: desktop.mini_width,
        height: desktop.mini_height,
        x: desktop.mini_x,
        y: desktop.mini_y,
    })
}

#[tauri::command]
pub async fn set_mini_window_mode(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    enabled: bool,
) -> Result<OkResponse, String> {
    let current_position = app.get_webview_window("main").and_then(|window| {
        let position = window.outer_position().ok()?;
        Some((position.x, position.y))
    });

    {
        let mut config = state.config.write();
        if !enabled && config.desktop.mini_mode {
            if let Some((x, y)) = current_position {
                config.desktop.mini_x = Some(x);
                config.desktop.mini_y = Some(y);
            }
        }
        config.desktop.mini_mode = enabled;
        if let Err(e) = crate::core::config::save_config(&config) {
            tracing::warn!("Failed to save config after mini mode change: {}", e);
        }
    }

    if let Some(window) = app.get_webview_window("main") {
        if enabled {
            let opacity = state.config.read().desktop.mini_opacity;
            let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize {
                width: MINI_MIN_WIDTH as f64,
                height: MINI_MIN_HEIGHT as f64,
            })));
            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: MINI_DEFAULT_WIDTH as f64,
                height: MINI_DEFAULT_HEIGHT as f64,
            }));
            let _ = window.set_always_on_top(true);
            let _ = apply_opacity(&window, opacity);
            tracing::info!("[WINDOW] Switched to mini mode: {}x{}", MINI_DEFAULT_WIDTH, MINI_DEFAULT_HEIGHT);
        } else {
            let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize {
                width: MAIN_MIN_WIDTH as f64,
                height: MAIN_MIN_HEIGHT as f64,
            })));
            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: MAIN_DEFAULT_WIDTH as f64,
                height: MAIN_DEFAULT_HEIGHT as f64,
            }));
            let _ = window.center();
            let _ = window.set_always_on_top(false);
            let _ = apply_opacity(&window, 1.0);
            tracing::info!(
                "[WINDOW] Switched to main mode: {}x{}",
                MAIN_DEFAULT_WIDTH,
                MAIN_DEFAULT_HEIGHT
            );
        }
    }

    Ok(OkResponse::success(if enabled {
        "已切换到小窗口模式"
    } else {
        "已切换到主窗口模式"
    }))
}

#[tauri::command]
pub async fn set_window_opacity(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    opacity: f64,
) -> Result<OkResponse, String> {
    let clamped_opacity = (opacity.clamp(0.4, 1.0) * 100.0).round() / 100.0;

    let config = &mut *state.config.write();
    config.desktop.mini_opacity = clamped_opacity;

    if let Err(e) = crate::core::config::save_config(config) {
        tracing::warn!("Failed to save config after opacity change: {}", e);
    }

    if let Some(window) = app.get_webview_window("main") {
        let _ = apply_opacity(&window, clamped_opacity);
    }

    tracing::info!("[WINDOW] Opacity set to {}", clamped_opacity);

    Ok(OkResponse::success(&format!(
        "透明度已设置为 {:.0}%",
        clamped_opacity * 100.0
    )))
}

#[tauri::command]
pub async fn save_window_layout(
    state: State<'_, Arc<AppState>>,
    x: Option<i32>,
    y: Option<i32>,
    width: Option<i32>,
    height: Option<i32>,
) -> Result<OkResponse, String> {
    let config = &mut *state.config.write();

    if let Some(v) = x {
        config.desktop.mini_x = Some(v);
    }
    if let Some(v) = y {
        config.desktop.mini_y = Some(v);
    }
    if let Some(v) = width {
        config.desktop.mini_width = v.max(MINI_MIN_WIDTH);
    }
    if let Some(v) = height {
        config.desktop.mini_height = v.max(MINI_MIN_HEIGHT);
    }

    if let Err(e) = crate::core::config::save_config(config) {
        tracing::warn!("Failed to save window layout: {}", e);
        return Err(format!("保存窗口布局失败: {}", e));
    }

    tracing::info!(
        "[WINDOW] Layout saved: {}x{} at ({}, {})",
        config.desktop.mini_width,
        config.desktop.mini_height,
        config.desktop.mini_x.unwrap_or(-1),
        config.desktop.mini_y.unwrap_or(-1)
    );

    Ok(OkResponse::success("窗口布局已保存"))
}

fn apply_opacity(window: &WebviewWindow, opacity: f64) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri::window::EffectsBuilder;
        if opacity < 1.0 {
            window
                .set_effects(EffectsBuilder::new().build())
                .map_err(|e| e.to_string())?;
        } else {
            window.set_effects(None).map_err(|e| e.to_string())?;
        }
    }

    #[cfg(target_os = "windows")]
    {
        if opacity < 1.0 {
            use tauri::window::EffectsBuilder;
            window
                .set_effects(EffectsBuilder::new().build())
                .map_err(|e| e.to_string())?;
        } else {
            window.set_effects(None).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MiniWindowFeed {
    pub worth_items: Vec<MiniWorthItem>,
    pub profitable_arbitrage: Vec<ArbitrageCalculationResult>,
    pub buy_ready_watches: Vec<repo_inventory::InventoryBuyWatchView>,
    pub sell_ready_positions: Vec<repo_inventory::InventoryPositionView>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MiniWorthItem {
    pub item_id: String,
    pub item_name: String,
    pub section_name: String,
    pub current_price: Option<f64>,
    pub purchase_fire_price: f64,
    pub count: i32,
    pub profit: Option<f64>,
    pub is_worth: bool,
}

#[tauri::command]
pub async fn get_mini_window_feed(
    state: State<'_, Arc<AppState>>,
    season_id: Option<String>,
    market_mode: Option<String>,
) -> Result<MiniWindowFeed, String> {
    let ctx = state.active_context.read().clone();
    let effective_season_id = season_id.unwrap_or(ctx.season_id.clone());
    let effective_market_mode = market_mode.unwrap_or_else(|| ctx.market_mode.as_str().to_string());

    let section_items = repo_sections::get_section_items_for_context(
        &state.db,
        &effective_season_id,
        &effective_market_mode,
    )
    .await
    .map_err(|e| e.to_string())?;

    let worth_items: Vec<MiniWorthItem> = section_items
        .into_iter()
        .filter(|item| item.purchase_fire_price > 0.0)
        .filter_map(|item| {
            let is_worth = match item.current_price {
                Some(cp) if cp > 0.0 => cp < item.purchase_fire_price,
                _ => false,
            };
            if !is_worth {
                return None;
            }
            let profit = match item.current_price {
                Some(cp) if cp < item.purchase_fire_price => {
                    Some((item.purchase_fire_price - cp) * item.count as f64)
                }
                _ => None,
            };
            Some(MiniWorthItem {
                item_id: item.item_id,
                item_name: item.item_name,
                section_name: item.section_name,
                current_price: item.current_price,
                purchase_fire_price: item.purchase_fire_price,
                count: item.count,
                profit,
                is_worth,
            })
        })
        .take(20)
        .collect();

    let arbitrage_results = match repo_arbitrage::calculate_arbitrage_for_all_recipes(
        &state.db,
        &effective_season_id,
        &effective_market_mode,
    )
    .await
    {
        Ok(results) => results,
        Err(e) => {
            tracing::warn!(
                "Failed to calculate mini window arbitrage for season={}, mode={}: {}",
                effective_season_id,
                effective_market_mode,
                e
            );
            Vec::new()
        }
    };

    let profitable_arbitrage: Vec<ArbitrageCalculationResult> = arbitrage_results
        .into_iter()
        .filter(|r| r.is_profitable && r.profit > 0.0)
        .take(20)
        .collect();

    let buy_ready_watches = match repo_inventory::get_buy_ready_watches(
        &state.db,
        &effective_season_id,
        &effective_market_mode,
    )
    .await
    {
        Ok(watches) => watches,
        Err(e) => {
            tracing::warn!(
                "Failed to load mini window buy watches for season={}, mode={}: {}",
                effective_season_id,
                effective_market_mode,
                e
            );
            Vec::new()
        }
    };

    let sell_ready_positions = match repo_inventory::get_sell_ready_positions(
        &state.db,
        &effective_season_id,
        &effective_market_mode,
    )
    .await
    {
        Ok(positions) => positions,
        Err(e) => {
            tracing::warn!(
                "Failed to load mini window sell positions for season={}, mode={}: {}",
                effective_season_id,
                effective_market_mode,
                e
            );
            Vec::new()
        }
    };

    Ok(MiniWindowFeed {
        worth_items,
        profitable_arbitrage,
        buy_ready_watches,
        sell_ready_positions,
        updated_at: chrono::Utc::now().timestamp(),
    })
}
