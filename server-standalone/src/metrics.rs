// 轻量级 Prometheus metrics 端点
// 不引入 prometheus crate（避免 200KB rustls 体积）
// 只实现基础 Counter/Gauge + text-format 导出
//
// 暴露指标:
// - http_requests_total{method, path, status}
// - http_request_duration_sum_seconds{method, path}
// - http_request_duration_count{method, path}
// - ws_clients（在线 WS 数）
// - scrape_errors_total
// - last_scrape_timestamp_seconds
// - server_uptime_seconds
// - db_pool_acquired_total / db_pool_acquire_errors_total

use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::Mutex;

pub struct Metrics {
    pub http_requests: Mutex<HashMap<String, AtomicU64>>,
    pub http_duration_sum_us: Mutex<HashMap<String, AtomicU64>>,
    pub http_duration_count: Mutex<HashMap<String, AtomicU64>>,
    pub ws_clients: AtomicU64,
    pub scrape_errors: AtomicU64,
    pub last_scrape_ts: AtomicI64,
    pub server_start_ts: i64,
    pub db_pool_acquired: AtomicU64,
    pub db_pool_acquire_errors: AtomicU64,
}

impl Metrics {
    pub fn new() -> Self {
        Self {
            http_requests: Mutex::new(HashMap::new()),
            http_duration_sum_us: Mutex::new(HashMap::new()),
            http_duration_count: Mutex::new(HashMap::new()),
            ws_clients: AtomicU64::new(0),
            scrape_errors: AtomicU64::new(0),
            last_scrape_ts: AtomicI64::new(0),
            server_start_ts: chrono::Utc::now().timestamp(),
            db_pool_acquired: AtomicU64::new(0),
            db_pool_acquire_errors: AtomicU64::new(0),
        }
    }

    pub fn record_http(&self, method: &str, path: &str, status: u16, duration_us: u64) {
        let key = format!("{}:{}:{}", method, path, status);
        self.http_requests
            .lock()
            .unwrap()
            .entry(key)
            .or_insert(AtomicU64::new(0))
            .fetch_add(1, Ordering::Relaxed);

        let latency_key = format!("{}:{}", method, path);
        self.http_duration_sum_us
            .lock()
            .unwrap()
            .entry(latency_key.clone())
            .or_insert(AtomicU64::new(0))
            .fetch_add(duration_us, Ordering::Relaxed);
        self.http_duration_count
            .lock()
            .unwrap()
            .entry(latency_key)
            .or_insert(AtomicU64::new(0))
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_ws_clients(&self) {
        self.ws_clients.fetch_add(1, Ordering::Relaxed);
    }

    pub fn dec_ws_clients(&self) {
        self.ws_clients.fetch_sub(1, Ordering::Relaxed);
    }

    pub fn inc_scrape_errors(&self) {
        self.scrape_errors.fetch_add(1, Ordering::Relaxed);
    }

    pub fn set_last_scrape(&self, ts: i64) {
        self.last_scrape_ts.store(ts, Ordering::Relaxed);
    }

    /// 导出 Prometheus 文本格式
    pub fn export_prometheus(&self) -> String {
        let mut out = String::with_capacity(4096);

        // # HELP / # TYPE 行
        out.push_str("# HELP http_requests_total Total HTTP requests by method/path/status\n");
        out.push_str("# TYPE http_requests_total counter\n");
        let reqs = self.http_requests.lock().unwrap();
        let mut keys: Vec<_> = reqs.keys().collect();
        keys.sort();
        for k in keys {
            let v = reqs[k].load(Ordering::Relaxed);
            let parts: Vec<&str> = k.splitn(3, ':').collect();
            if parts.len() == 3 {
                out.push_str(&format!(
                    "http_requests_total{{method=\"{}\",path=\"{}\",status=\"{}\"}} {}\n",
                    parts[0], parts[1], parts[2], v
                ));
            }
        }
        drop(reqs);

        out.push_str("# HELP http_request_duration_avg_seconds Average HTTP request latency\n");
        out.push_str("# TYPE http_request_duration_avg_seconds gauge\n");
        let sum = self.http_duration_sum_us.lock().unwrap();
        let cnt = self.http_duration_count.lock().unwrap();
        let mut latency_keys: Vec<_> = sum.keys().collect();
        latency_keys.sort();
        for k in latency_keys {
            let s = sum[k].load(Ordering::Relaxed) as f64 / 1_000_000.0;
            let c = cnt[k].load(Ordering::Relaxed);
            let avg = if c > 0 { s / c as f64 } else { 0.0 };
            let parts: Vec<&str> = k.splitn(2, ':').collect();
            if parts.len() == 2 {
                out.push_str(&format!(
                    "http_request_duration_avg_seconds{{method=\"{}\",path=\"{}\"}} {:.6}\n",
                    parts[0], parts[1], avg
                ));
            }
        }
        drop(sum);
        drop(cnt);

        out.push_str("# HELP ws_clients Current WebSocket client count\n");
        out.push_str("# TYPE ws_clients gauge\n");
        out.push_str(&format!(
            "ws_clients {}\n",
            self.ws_clients.load(Ordering::Relaxed)
        ));

        out.push_str("# HELP scrape_errors_total Total scraper errors\n");
        out.push_str("# TYPE scrape_errors_total counter\n");
        out.push_str(&format!(
            "scrape_errors_total {}\n",
            self.scrape_errors.load(Ordering::Relaxed)
        ));

        out.push_str("# HELP last_scrape_timestamp_seconds Unix timestamp of last successful scrape\n");
        out.push_str("# TYPE last_scrape_timestamp_seconds gauge\n");
        out.push_str(&format!(
            "last_scrape_timestamp_seconds {}\n",
            self.last_scrape_ts.load(Ordering::Relaxed)
        ));

        out.push_str("# HELP server_uptime_seconds Server uptime in seconds\n");
        out.push_str("# TYPE server_uptime_seconds gauge\n");
        let uptime = chrono::Utc::now().timestamp() - self.server_start_ts;
        out.push_str(&format!("server_uptime_seconds {}\n", uptime.max(0)));

        out.push_str("# HELP db_pool_acquired_total Total DB pool acquisitions\n");
        out.push_str("# TYPE db_pool_acquired_total counter\n");
        out.push_str(&format!(
            "db_pool_acquired_total {}\n",
            self.db_pool_acquired.load(Ordering::Relaxed)
        ));

        out.push_str("# HELP db_pool_acquire_errors_total DB pool acquire timeouts\n");
        out.push_str("# TYPE db_pool_acquire_errors_total counter\n");
        out.push_str(&format!(
            "db_pool_acquire_errors_total {}\n",
            self.db_pool_acquire_errors.load(Ordering::Relaxed)
        ));

        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metrics_record_http_and_export() {
        let m = Metrics::new();
        m.record_http("GET", "/health", 200, 1500);
        m.record_http("GET", "/health", 200, 2500);
        m.record_http("POST", "/admin", 401, 3000);

        let text = m.export_prometheus();
        assert!(text.contains("http_requests_total{method=\"GET\",path=\"/health\",status=\"200\"} 2"));
        assert!(text.contains("http_requests_total{method=\"POST\",path=\"/admin\",status=\"401\"} 1"));
        assert!(text.contains("http_request_duration_avg_seconds"));
    }

    #[test]
    fn metrics_ws_clients_increment() {
        let m = Metrics::new();
        m.inc_ws_clients();
        m.inc_ws_clients();
        m.dec_ws_clients();
        assert_eq!(m.ws_clients.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn metrics_scrape_errors_and_timestamp() {
        let m = Metrics::new();
        m.inc_scrape_errors();
        m.inc_scrape_errors();
        assert_eq!(m.scrape_errors.load(Ordering::Relaxed), 2);
        m.set_last_scrape(1776384000);
        assert_eq!(m.last_scrape_ts.load(Ordering::Relaxed), 1776384000);
    }

    #[test]
    fn metrics_export_contains_all_gauges() {
        let m = Metrics::new();
        m.set_last_scrape(1234567890);
        m.inc_ws_clients();
        let text = m.export_prometheus();
        assert!(text.contains("ws_clients 1"));
        assert!(text.contains("last_scrape_timestamp_seconds 1234567890"));
        assert!(text.contains("server_uptime_seconds"));
        assert!(text.contains("db_pool_acquired_total 0"));
    }
}
