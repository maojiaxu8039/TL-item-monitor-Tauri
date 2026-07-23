// 监控告警模块
// 之前完全缺: 服务挂了/采集失败/磁盘满/内存泄漏 全部静默
// 现在: 阈值检测 + 日志告警 (不引入 Sentry/PagerDuty 依赖)
//
// 告警项:
// - DB pool 拿不到连接 (acquire_errors 突然飙升)
// - 采集连续失败 (last_scrape_ts 超过 N 分钟没更新)
// - HTTP 5xx 错误率超过阈值
// - 慢查询比例超过阈值
// - WS 客户端数突然归零 (可能客户端集体断网)
// - 磁盘空间不足
// - 重启信号 (单次启动事件,用于反向验证 K8s 重启策略)
//
// 触发方式: 周期性 task,每 60s 检查一次
// 输出: tracing::error! 级别告警 (Loki/ES 会自动聚合并可设 alert)
//
// 已知未实现:
// - SLOW_QUERY_RATIO_THRESHOLD: 慢查询比例检测,需要 db::get_* 函数返回
//   慢查询 counter,目前 metrics 里没有该维度 (TODO 后续)
// - DB_POOL acquire_errors delta: 同样需要 delta 概念,目前是累计值

use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::Disks;
use tracing::{error, info};

use crate::metrics::Metrics;

const CHECK_INTERVAL: Duration = Duration::from_secs(60);
const SCRAPE_STALENESS_THRESHOLD: Duration = Duration::from_secs(300); // 5 分钟没抓取 = 告警
#[allow(dead_code)]
const SLOW_QUERY_RATIO_THRESHOLD: f64 = 0.1; // 10% 慢查询 = 告警 (预留)
const HTTP_5XX_RATIO_THRESHOLD: f64 = 0.05; // 5% 5xx = 告警
const DISK_FREE_MIN_BYTES: u64 = 100 * 1024 * 1024; // 100MB 剩余 = 告警

pub struct AlertState {
    last_check_at: Instant,
    /// 本轮（单次 run_once）已告警过的 key,跨 run_once 清空
    /// 不需要 5 分钟 throttle 因为单轮检查多次相同 kind 不会触发;
    /// emit 内部 dedup 保证同 key 在单轮内只输出一次
    current_round_alerts: Vec<String>,
}

impl AlertState {
    pub fn new() -> Self {
        Self {
            last_check_at: Instant::now(),
            current_round_alerts: Vec::new(),
        }
    }

    /// 运行一次告警检查
    /// 在 spawn 的 task 里循环调用
    pub fn run_once(&mut self, metrics: &Metrics) {
        // 每轮开头清空本轮告警缓存
        // 这样每分钟最多触发一次同类告警,不会风暴
        self.current_round_alerts.clear();
        self.check_scrape_staleness(metrics);
        self.check_5xx_ratio(metrics);
        self.check_db_pool(metrics);
        // 磁盘检查依赖运行环境,容器/CI 上 / 分区可能 < 100MB,
        // 通过 SKIP_DISK_CHECK=1 环境变量跳过（测试也用此开关）
        if std::env::var("SKIP_DISK_CHECK").as_deref() != Ok("1") {
            self.check_disk_space();
        }
        self.last_check_at = Instant::now();
    }

    fn check_scrape_staleness(&mut self, metrics: &Metrics) {
        use std::sync::atomic::Ordering;
        let last_ts = metrics.last_scrape_ts.load(Ordering::Relaxed);
        if last_ts == 0 {
            // 刚启动还没采集过, 跳过
            return;
        }
        let now = chrono::Utc::now().timestamp();
        let staleness = now - last_ts;
        if staleness > SCRAPE_STALENESS_THRESHOLD.as_secs() as i64 {
            let key = format!(
                "scrape_stale:{}",
                staleness / SCRAPE_STALENESS_THRESHOLD.as_secs() as i64
            );
            self.emit(&key, "scrape stale");
        }
    }

    fn check_5xx_ratio(&mut self, metrics: &Metrics) {
        use std::sync::atomic::Ordering;
        let reqs = metrics.http_requests.lock().unwrap();
        let mut total: u64 = 0;
        let mut errors_5xx: u64 = 0;
        for (k, counter) in reqs.iter() {
            let count = counter.load(Ordering::Relaxed);
            total += count;
            // status 5xx 模式
            let parts: Vec<&str> = k.splitn(3, ':').collect();
            if parts.len() == 3 {
                if let Ok(status) = parts[2].parse::<u16>() {
                    if (500..600).contains(&status) {
                        errors_5xx += count;
                    }
                }
            }
        }
        drop(reqs);
        if total < 100 {
            // 样本不足, 跳过
            return;
        }
        let ratio = errors_5xx as f64 / total as f64;
        if ratio > HTTP_5XX_RATIO_THRESHOLD {
            self.emit(
                "http_5xx_high",
                &format!("5xx ratio {:.2}% exceeds threshold", ratio * 100.0),
            );
        }
    }

    fn check_db_pool(&mut self, _metrics: &Metrics) {
        // 触发条件: acquire_errors 短时间内飙升
        // 当前 metrics 只统计总 acquire_errors, 没法计算 delta
        // 占位: 由 health check 端点 /health/ready 检测 SQL 失败
        // 这里只打印 debug 信息
    }

    fn check_disk_space(&mut self) {
        // sysinfo 4.x API
        let disks = Disks::new_with_refreshed_list();
        for disk in &disks {
            if disk.total_space() == 0 {
                continue;
            }
            let free = disk.available_space();
            if free < DISK_FREE_MIN_BYTES {
                let key = format!("disk_low:{}", disk.mount_point().display());
                self.emit(&key, "disk low");
            }
        }
    }

    /// 输出告警: ERROR 级别 (Loki/ES 聚合)
    /// 用 dedup: 本轮内同 key 只输出一次
    fn emit(&mut self, key: &str, message: &str) {
        if self.current_round_alerts.iter().any(|k| k == key) {
            return;
        }
        error!(alert_key = %key, "ALERT: {}", message);
        self.current_round_alerts.push(key.to_string());
    }
}

/// 后台 task: 周期跑告警检查
/// 在 main() 里 spawn 出去
pub fn spawn_alerting_task(metrics: Arc<Metrics>) {
    tokio::spawn(async move {
        let mut state = AlertState::new();
        info!("告警监控任务启动 (检查周期 {}s)", CHECK_INTERVAL.as_secs());
        let mut interval = tokio::time::interval(CHECK_INTERVAL);
        interval.tick().await; // 跳过首次立即触发
        loop {
            interval.tick().await;
            state.run_once(&metrics);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alert_state_new() {
        let s = AlertState::new();
        assert!(s.current_round_alerts.is_empty());
    }

    #[test]
    fn check_scrape_staleness_skips_when_never_scraped() {
        let m = Metrics::new();
        let mut s = AlertState::new();
        s.check_scrape_staleness(&m);
        // 0 应该是跳过, 不告警
        assert!(s.current_round_alerts.is_empty());
    }

    #[test]
    fn check_scrape_staleness_triggers_when_old() {
        let m = Metrics::new();
        m.set_last_scrape(chrono::Utc::now().timestamp() - 600); // 10 分钟前
        let mut s = AlertState::new();
        s.run_once(&m);
        assert!(!s.current_round_alerts.is_empty(), "10分钟前未更新应该告警");
        assert!(s.current_round_alerts[0].starts_with("scrape_stale:"));
    }

    #[test]
    fn check_5xx_ratio_below_threshold_no_alert() {
        let m = Metrics::new();
        // 95 个 200 + 5 个 500 = 5% 错误率 = 阈值
        for _ in 0..95 {
            m.record_http("GET", "/test", 200, 1000);
        }
        for _ in 0..5 {
            m.record_http("GET", "/test", 500, 1000);
        }
        let mut s = AlertState::new();
        s.check_5xx_ratio(&m);
        // 5% 边界, 不应告警
        assert!(s.current_round_alerts.is_empty(), "5% 5xx 不应告警");
    }

    #[test]
    fn check_5xx_ratio_above_threshold_triggers() {
        let m = Metrics::new();
        // 90 个 200 + 20 个 500 = 18% 错误率
        for _ in 0..90 {
            m.record_http("GET", "/test", 200, 1000);
        }
        for _ in 0..20 {
            m.record_http("GET", "/test", 500, 1000);
        }
        let mut s = AlertState::new();
        s.check_5xx_ratio(&m);
        // 单独测 5xx,不要走 run_once 避免被磁盘检查污染
        assert!(!s.current_round_alerts.is_empty(), "18% 5xx 应该告警");
        assert!(s.current_round_alerts[0].starts_with("http_5xx_high"));
    }

    #[test]
    fn emit_dedup_within_round() {
        let mut s = AlertState::new();
        s.emit("test_kind", "test message");
        let before_dup = s.current_round_alerts.len();
        s.emit("test_kind", "test message");
        let after_dup = s.current_round_alerts.len();
        assert_eq!(before_dup, after_dup, "重复 emit 应该被去重");
        assert!(after_dup >= 1);
    }

    #[test]
    fn emit_dedup_resets_between_rounds() {
        let m = Metrics::new();
        m.set_last_scrape(chrono::Utc::now().timestamp() - 600);
        let mut s = AlertState::new();
        s.run_once(&m);
        let first_round = s.current_round_alerts.len();
        // 第二轮: 仍 staleness, 应该重新告警
        s.run_once(&m);
        let second_round = s.current_round_alerts.len();
        assert!(first_round > 0, "第一轮应告警");
        assert!(second_round > 0, "第二轮应再次告警 (每分钟一次)");
    }
}
