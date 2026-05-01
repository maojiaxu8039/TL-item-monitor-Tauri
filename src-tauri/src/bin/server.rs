//! TL Monitor Server - 独立数据采集服务器
//! 
//! 用于在 NAS 等服务器上 24 小时运行，定时抓取火价和物品价格数据。
//! 
//! 运行方式：
//!   cargo run --bin server
//!   cargo run --bin server -- --season ss12 --mode season_normal

use std::sync::Arc;
use chrono::{Utc, Timelike};
use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use tokio::sync::broadcast;
use tracing::{info, error, Level};
use tracing_subscriber::FmtSubscriber;

mod scraper;
mod db;
mod config;

use config::ServerConfig;
use scraper::{Scraper, FirePriceSnapshot, Item};

const DB_PATH: &str = "/data/tl_monitor.db";
const CONFIG_PATH: &str = "/config/server_config.yaml";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 初始化日志
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .init();

    info!("==============================================");
    info!("TL Monitor Server - 独立数据采集服务器");
    info!("==============================================");

    // 加载配置
    let config = match config::load_config(CONFIG_PATH) {
        Ok(cfg) => {
            info!("配置加载成功: season={}, mode={}", cfg.season_id, cfg.market_mode);
            cfg
        }
        Err(e) => {
            error!("配置加载失败: {}, 使用默认配置", e);
            ServerConfig::default()
        }
    };

    // 解析命令行参数覆盖配置
    let args: Vec<String> = std::env::args().collect();
    let config = parse_args(args, config);

    // 初始化数据库
    let db_path = std::env::var("TL_DB_PATH").unwrap_or_else(|_| DB_PATH.to_string());
    info!("数据库路径: {}", db_path);
    
    // 确保数据目录存在
    if let Some(parent) = std::path::Path::new(&db_path).parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&format!("sqlite:{}?mode=rwc", db_path))
        .await?;

    // 运行数据库迁移
    db::run_migrations(&pool).await?;

    // 创建共享状态
    let state = Arc::new(ServerState {
        config: config.clone(),
        db: pool,
    });

    // 创建广播通道用于优雅关闭
    let (abort_tx, mut abort_rx) = broadcast::channel::<()>(1);

    // 注册信号处理
    let abort_tx_clone = abort_tx.clone();
    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.ok();
        info!("收到关闭信号，正在停止服务器...");
        abort_tx_clone.send(()).ok();
    });

    // 启动服务器
    run_server(state, abort_rx).await;

    info!("服务器已关闭");
    Ok(())
}

#[derive(Clone)]
struct ServerState {
    config: ServerConfig,
    db: SqlitePool,
}

async fn run_server(state: Arc<ServerState>, mut abort_rx: broadcast::Receiver<()>) {
    info!("服务器启动中...");
    
    // 等待到下一个整点
    let now = Utc::now();
    let next_hour = (now + chrono::Duration::hours(1))
        .with_minute(0).unwrap()
        .with_second(0).unwrap()
        .with_nanosecond(0).unwrap();
    let wait_secs = (next_hour - now).num_seconds();
    
    info!("下次采集时间: {} ({} 秒后)", next_hour.format("%Y-%m-%d %H:%M:%S UTC"), wait_secs);

    // 启动时立即执行一次采集
    info!("启动时执行首次采集...");
    if let Err(e) = collect_and_save(&state).await {
        error!("首次采集失败: {}", e);
    }

    // 定时循环
    loop {
        tokio::select! {
            _ = abort_rx.recv() => {
                info!("收到关闭信号，退出定时循环");
                break;
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(3600)) => {
                if let Err(e) = collect_and_save(&state).await {
                    error!("整点采集失败: {}", e);
                }
            }
        }
    }
}

async fn collect_and_save(state: &Arc<ServerState>) -> Result<(), Box<dyn std::error::Error>> {
    let now = Utc::now();
    let timestamp = now.with_minute(0).unwrap()
        .with_second(0).unwrap()
        .with_nanosecond(0).unwrap()
        .timestamp();

    info!("[{}] 开始数据采集...", now.format("%Y-%m-%d %H:%M:%S UTC"));

    // 采集火价
    info!("采集火价数据...");
    let fire_result = Scraper::scrape_fire_price(&state.config.market_mode).await;
    
    match fire_result {
        Ok(fire) => {
            info!("火价采集成功: {} RMB/10K", fire.rmb_per_10k_fire);
            
            // 保存火价记录（新增，不去重）
            if let Err(e) = db::insert_fire_record(
                &state.db,
                &state.config.season_id,
                &state.config.market_mode,
                &fire,
                timestamp,
            ).await {
                error!("火价记录保存失败: {}", e);
            } else {
                info!("火价记录已保存到数据库");
            }
        }
        Err(e) => {
            error!("火价采集失败: {}", e);
        }
    }

    // 采集物品数据
    info!("采集物品数据...");
    let items_result = Scraper::scrape_items(&state.config.season_id, &state.config.market_mode).await;
    
    match items_result {
        Ok(items) => {
            info!("物品采集成功: {} 个物品", items.len());
            
            // 保存物品价格记录（新增）
            if let Err(e) = db::insert_items_record(
                &state.db,
                &state.config.season_id,
                &state.config.market_mode,
                &items,
                timestamp,
            ).await {
                error!("物品记录保存失败: {}", e);
            } else {
                info!("物品记录已保存到数据库");
            }
        }
        Err(e) => {
            error!("物品采集失败: {}", e);
        }
    }

    info!("[{}] 数据采集完成", Utc::now().format("%Y-%m-%d %H:%M:%S UTC"));
    Ok(())
}

fn parse_args(args: Vec<String>, mut config: ServerConfig) -> ServerConfig {
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--season" | "-s" if i + 1 < args.len() => {
                config.season_id = args[i + 1].clone();
                i += 2;
            }
            "--mode" | "-m" if i + 1 < args.len() => {
                config.market_mode = args[i + 1].clone();
                i += 2;
            }
            "--help" | "-h" => {
                println!("TL Monitor Server - 独立数据采集服务器");
                println!();
                println!("用法: server [选项]");
                println!();
                println!("选项:");
                println!("  --season, -s <id>    设置赛季ID (默认: ss12)");
                println!("  --mode, -m <mode>    设置市场模式 (默认: season_normal)");
                println!("  --help, -h           显示帮助");
                println!();
                println!("环境变量:");
                println!("  TL_DB_PATH           数据库路径 (默认: /data/tl_monitor.db)");
                std::process::exit(0);
            }
            _ => i += 1,
        }
    }
    config
}
