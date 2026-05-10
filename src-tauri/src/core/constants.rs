pub const FIRE_PRICE_DIVISOR: f64 = 10000.0;

pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const SERVER_VERSION: &str = "3.3";

pub const SECONDS_PER_MINUTE: i64 = 60;
pub const SECONDS_PER_HOUR: i64 = 3600;
pub const SECONDS_PER_DAY: i64 = 86400;

pub const DEFAULT_CONSIDER_RATIO: f64 = 1.15;
pub const DEFAULT_PRICE_CHANGE_THRESHOLD: f64 = 5.0;
pub const DEFAULT_BARGAIN_THRESHOLD: f64 = -10.0;
pub const DEFAULT_SELL_THRESHOLD: f64 = 15.0;

pub const BATCH_SIZE_SMALL: usize = 200;
pub const BATCH_SIZE_LARGE: usize = 500;

pub const QUERY_LIMIT_DEFAULT: i64 = 100;
pub const QUERY_LIMIT_MAX: i64 = 99999;

pub const DEFAULT_COOLDOWN_SECONDS: i32 = 600;
pub const DEFAULT_ALERT_COOLDOWN_SECONDS: i32 = 1800;

pub const DEFAULT_STALE_TIME_MS: u64 = 30_000;
pub const DEFAULT_GC_TIME_MS: u64 = 300_000;

#[derive(Debug, Clone, Copy)]
pub struct SeasonInfo {
    pub id: &'static str,
    pub start_timestamp: i64,
    pub name: &'static str,
    pub is_current: bool,
}

pub const SEASONS: &[SeasonInfo] = &[
    SeasonInfo {
        id: "ss12",
        start_timestamp: 1776384000,
        name: "SS12 当前赛季",
        is_current: true,
    },
    SeasonInfo {
        id: "ss11",
        start_timestamp: 1768521600,
        name: "SS11 历史赛季",
        is_current: false,
    },
    SeasonInfo {
        id: "ss10",
        start_timestamp: 1699392000,
        name: "SS10 历史赛季",
        is_current: false,
    },
];

pub fn get_season_start(season_id: &str) -> Option<i64> {
    SEASONS
        .iter()
        .find(|s| s.id == season_id)
        .map(|s| s.start_timestamp)
}

pub fn get_current_season_id() -> &'static str {
    SEASONS
        .iter()
        .find(|s| s.is_current)
        .map(|s| s.id)
        .unwrap_or("ss12")
}

pub fn calculate_season_day(scraped_at: i64, season_start: i64) -> i32 {
    let days_since_start = (scraped_at - season_start) / SECONDS_PER_DAY;
    std::cmp::max(1, days_since_start as i32 + 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_season_start_ss12() {
        assert_eq!(get_season_start("ss12"), Some(1776384000));
    }

    #[test]
    fn test_get_season_start_unknown() {
        assert_eq!(get_season_start("ss99"), None);
    }

    #[test]
    fn test_calculate_season_day() {
        let ss12_start = 1776384000i64;
        assert_eq!(calculate_season_day(ss12_start, ss12_start), 1);
        assert_eq!(calculate_season_day(ss12_start + 86400, ss12_start), 2);
        assert_eq!(calculate_season_day(ss12_start - 86400, ss12_start), 1);
    }
}
