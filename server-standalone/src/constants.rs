// 集中所有可调参数,避免散落各处
// 之前散落在 scraper.rs / main.rs / config.rs 等多处
// 改这些参数时,只用改这里一处

// 部分常量在某个迭代引入,后续可能还没用上(预留)
// 加 #[allow(dead_code)] 避免 clippy 噪音
#![allow(dead_code)]

use std::time::Duration;

/// 服务版本号（cargo build 时通过环境变量覆盖）
pub const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION", "1.0.1");

// ==================== 网络超时 ====================

/// 通用 HTTP flush 超时（响应写回客户端的最长等待）
pub const HTTP_FLUSH_TIMEOUT: Duration = Duration::from_secs(10);

/// 错误响应写回超时
pub const ERROR_RESPONSE_TIMEOUT: Duration = Duration::from_secs(5);

/// WebSocket 鉴权首条消息的最长等待
/// 之前: 10s 散落在 main.rs:3268
pub const WS_AUTH_TIMEOUT: Duration = Duration::from_secs(10);

/// HTTP reqwest 客户端 TCP keepalive
/// 之前: Duration::from_secs(60) 散落在 scraper.rs:42
pub const HTTP_TCP_KEEPALIVE: Duration = Duration::from_secs(60);

/// 通用 reqwest connect timeout
pub const HTTP_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

/// 通用 reqwest request timeout（采集 API 调用）
pub const HTTP_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

// ==================== 限流 ====================

/// RateLimiter GC 周期（清理过期条目）
/// 之前: Duration::from_secs(60) 散落在 main.rs:247
pub const RATE_LIMITER_GC_INTERVAL: Duration = Duration::from_secs(60);

/// RateLimiter 滑动窗口长度
pub const RATE_LIMITER_WINDOW: Duration = Duration::from_secs(60);

// ==================== 数据库 ====================

/// PRAGMA busy_timeout：写冲突等待时间
pub const SQLITE_BUSY_TIMEOUT_MS: i32 = 5000;

/// PRAGMA cache_size：负数 = KiB（-20000 = 20MB）
pub const SQLITE_CACHE_SIZE_KB: i32 = -20000;

// ==================== 赛季 / 业务 ====================

/// 赛季最大天数（90 天后自动归档）
pub const SEASON_MAX_DAYS: i64 = 90;

/// 单个物品单日最大历史条目数（防御恶意数据）
pub const MAX_DAILY_ENTRIES_PER_ITEM: i64 = 1000;

/// 单个 season 累积最大记录数
pub const MAX_SEASON_RECORDS: i64 = 100_000_000;
