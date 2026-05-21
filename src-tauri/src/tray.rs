use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tokio::sync::Mutex;
use tracing::info;

use crate::core::events::{emit_fire_price_updated, FirePricePayload};
use crate::db::repo_fire;
use crate::scraper;

/// Shared mutable state for tray tooltip updates.
#[derive(Clone)]
pub struct TrayState {
    #[allow(dead_code)]
    pub tooltip: Arc<Mutex<String>>,
}

fn get_fire_price_display(app: &AppHandle) -> String {
    let state = app.state::<Arc<crate::core::state::AppState>>();
    let ctx = state.active_context.read().clone();
    let fire_price = state.fire_prices.read().get(&ctx.market_mode).cloned();

    fire_price
        .map(|s| format!("{:.2}", s.price_per_wan))
        .unwrap_or_else(|| "无".to_string())
}

fn graceful_shutdown(app: &tauri::AppHandle) {
    info!("Initiating graceful shutdown...");

    if let Some(state) = app.try_state::<Arc<crate::core::state::AppState>>() {
        if let Some(handle) = state.scheduler_handle.read().as_ref() {
            handle.shutdown();
        }
    }

    info!("Graceful shutdown complete, exiting");
    app.exit(0);
}

/// Refresh fire price from web and update tray tooltip.
async fn refresh_and_sync_fire_price(app: AppHandle) {
    let snapshot = match scraper::scrape_fire_price().await {
        Ok(s) => s,
        Err(e) => {
            tracing::error!("Tray refresh fire price failed: {}", e);
            return;
        }
    };

    // Persist to DB
    {
        let state = app.state::<Arc<crate::core::state::AppState>>();
        let ctx = state.active_context.read().clone();
        if let Err(e) = repo_fire::insert_fire_record(
            &state.db,
            &ctx.season_id,
            ctx.market_mode.as_str(),
            &snapshot,
        )
        .await
        {
            tracing::error!("Failed to persist fire record: {}", e);
        }
        // Update in-memory state
        {
            let mut fire_prices = state.fire_prices.write();
            fire_prices.insert(ctx.market_mode, snapshot.clone());
        }
        {
            let mut status = state.task_status.write();
            status.last_fire_scrape = Some(chrono::Utc::now().timestamp());
        }
    }

    // Emit event to frontend
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

    // Update tray tooltip
    let tooltip = format!("火价: {:.2}元/万火", snapshot.price_per_wan);
    tracing::info!("Tray synced fire price: {}", tooltip);
}

pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle().clone();

    let initial_price = get_fire_price_display(&app_handle);
    let initial_tooltip = format!("TorchScan · 火价: {}元/万火", initial_price);

    let show_item = MenuItemBuilder::with_id("show", "打开 TorchScan").build(app)?;
    let refresh_item = MenuItemBuilder::with_id("refresh", "刷新火价").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let fire_text = format!("火价: {}元/万火", initial_price);
    let fire_item = MenuItemBuilder::with_id("fire_price", &fire_text)
        .enabled(false)
        .build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .separator()
        .item(&fire_item)
        .item(&refresh_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let tray_state = TrayState {
        tooltip: Arc::new(Mutex::new(initial_tooltip.clone())),
    };
    app.manage(tray_state);

    // 1x1 transparent PNG as ultimate fallback
    const TRANSPARENT_PNG: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F,
        0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60,
        0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];

    let tray_icon = match Image::from_bytes(include_bytes!("../icons/tray.png")) {
        Ok(icon) => icon,
        Err(e1) => {
            tracing::warn!("Failed to load tray icon, trying fallback: {}", e1);
            match Image::from_bytes(include_bytes!("../icons/32x32.png")) {
                Ok(icon) => icon,
                Err(e2) => {
                    tracing::error!(
                        "Fallback tray icon also failed: {}. Using transparent placeholder.",
                        e2
                    );
                    Image::from_bytes(TRANSPARENT_PNG)
                        .expect("Built-in transparent PNG must be valid")
                }
            }
        }
    };

    let _tray = TrayIconBuilder::new()
        .icon(tray_icon)
        .menu(&menu)
        .tooltip(&initial_tooltip)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "refresh" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    refresh_and_sync_fire_price(app).await;
                });
            }
            "quit" => {
                graceful_shutdown(app);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
