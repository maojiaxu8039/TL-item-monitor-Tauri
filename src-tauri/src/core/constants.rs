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

pub const BATCH_SIZE_SMALL: usize = 500;
pub const BATCH_SIZE_LARGE: usize = 2000;

pub const QUERY_LIMIT_DEFAULT: i64 = 100;
pub const QUERY_LIMIT_MAX: i64 = 99999;

pub const DEFAULT_COOLDOWN_SECONDS: i32 = 600;
pub const DEFAULT_ALERT_COOLDOWN_SECONDS: i32 = 1800;

pub const DEFAULT_STALE_TIME_MS: u64 = 30_000;
pub const DEFAULT_GC_TIME_MS: u64 = 300_000;

/// SS13 opened at 2026-07-17 10:00:00 Asia/Shanghai.
pub const SS13_START_TIMESTAMP: i64 = 1_784_253_600;
/// SS12 opened at 2026-04-17 08:00:00 Asia/Shanghai.
pub const SS12_START_TIMESTAMP: i64 = 1_776_384_000;

#[derive(Debug, Clone, Copy)]
pub struct SeasonInfo {
    pub id: &'static str,
    pub start_timestamp: i64,
    pub name: &'static str,
    pub is_current: bool,
}

pub const SEASONS: &[SeasonInfo] = &[
    SeasonInfo {
        id: "ss13",
        start_timestamp: SS13_START_TIMESTAMP,
        name: "SS13 当前赛季",
        is_current: true,
    },
    SeasonInfo {
        id: "ss12",
        start_timestamp: SS12_START_TIMESTAMP,
        name: "SS12 历史赛季",
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

pub fn get_previous_season_id(current_id: &str) -> Option<&'static str> {
    let current_idx = SEASONS.iter().position(|s| s.id == current_id)?;
    if current_idx >= SEASONS.len() - 1 {
        return None;
    }
    Some(SEASONS[current_idx + 1].id)
}

pub fn get_previous_season_start(current_id: &str) -> Option<i64> {
    let current_idx = SEASONS.iter().position(|s| s.id == current_id)?;
    if current_idx >= SEASONS.len() - 1 {
        return None;
    }
    Some(SEASONS[current_idx + 1].start_timestamp)
}

/// 根据 scraped_at 计算 season_day
///
/// 算法：开服时刻 = day 1 开始，下一个 0:00（按北京时间 0:00）= day 2 开始
///
/// 举例（SS13 开服 7/17 10:00 北京 = UTC 7/17 02:00 = 1784253600）：
/// - 7/17 10:00 北京 (scraped_at = season_start) → day 1
/// - 7/17 23:00 北京                            → day 1
/// - 7/18 00:00 北京                            → day 2  ✅ 关键
/// - 7/18 10:00 北京                            → day 2
/// - 7/19 00:00 北京                            → day 3
///
/// 之前算法 `(scraped_at - season_start) / 86400 + 1` 按 UTC 自然日切，导致 7/18 00:00 还是 day 1
/// 实际应该按"北京自然日"切。
pub fn calculate_season_day(scraped_at: i64, season_start: i64) -> i32 {
    if scraped_at < season_start {
        // scrape 在开服前：算 day 1（开服前调试数据归到 day 1）
        return 1;
    }
    // 把时间换算到北京时间（加 8h），向下取整到当日 0:00
    // 关键：求"北京时间当日 0:00 对应的 UTC timestamp"
    //   beijing_ts = ts + 8*3600
    //   beijing_midnight = (beijing_ts / 86400) * 86400
    //   转换回 UTC ts = beijing_midnight - 8*3600
    const SECS_PER_DAY: i64 = 86400;
    const BJ_OFFSET: i64 = 8 * 3600;

    fn beijing_day_start(ts: i64) -> i64 {
        let beijing_ts = ts + BJ_OFFSET;
        (beijing_ts / SECS_PER_DAY) * SECS_PER_DAY - BJ_OFFSET
    }

    let start_day = beijing_day_start(season_start);
    let scrape_day = beijing_day_start(scraped_at);
    let days = (scrape_day - start_day) / SECS_PER_DAY;
    std::cmp::max(1, days as i32 + 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_season_start_ss12() {
        assert_eq!(get_season_start("ss12"), Some(SS12_START_TIMESTAMP));
    }

    #[test]
    fn test_get_season_start_ss13() {
        assert_eq!(get_season_start("ss13"), Some(SS13_START_TIMESTAMP));
    }

    #[test]
    fn test_get_season_start_unknown() {
        assert_eq!(get_season_start("ss99"), None);
    }

    #[test]
    fn test_calculate_season_day() {
        // SS12 开服：2026-04-17 08:00 北京 = UTC 4/17 00:00
        let ss12_start = SS12_START_TIMESTAMP;
        assert_eq!(calculate_season_day(ss12_start, ss12_start), 1);
        // 开服时刻（4/17 8:00 北京）仍是 day 1
        assert_eq!(calculate_season_day(ss12_start, ss12_start), 1);
        // 4/18 00:00 北京 = day 2（按北京自然日切）
        // = UTC 4/17 16:00 = ss12_start + 16*3600
        assert_eq!(calculate_season_day(ss12_start + 16 * 3600, ss12_start), 2);
        // 4/19 00:00 北京 = day 3
        // = UTC 4/18 16:00 = ss12_start + 40*3600
        assert_eq!(calculate_season_day(ss12_start + 40 * 3600, ss12_start), 3);
        // 4/18 10:00 北京 = day 2
        // = UTC 4/18 02:00 = ss12_start + 26*3600
        assert_eq!(calculate_season_day(ss12_start + 26 * 3600, ss12_start), 2);
        // 开服前的 scrape（4/16）算 day 1
        assert_eq!(calculate_season_day(ss12_start - 86400, ss12_start), 1);

        // SS13 开服：2026-07-17 10:00 北京 = UTC 7/17 02:00
        let ss13_start = SS13_START_TIMESTAMP;
        assert_eq!(calculate_season_day(ss13_start, ss13_start), 1);
        // 7/18 00:00 北京 = day 2
        // = UTC 7/17 16:00 = ss13_start + 14*3600
        assert_eq!(calculate_season_day(ss13_start + 14 * 3600, ss13_start), 2);
        // 7/19 00:00 北京 = day 3
        // = UTC 7/18 16:00 = ss13_start + 38*3600
        assert_eq!(calculate_season_day(ss13_start + 38 * 3600, ss13_start), 3);
    }
}
