export interface FirePricePoint {
  scraped_at: number;
  rmb_per_10k_fire: number;
  season_day: number;
}

export interface HourlyFireComparePoint {
  label: string;
  sortKey: number;
  dayOffset: number;
  hour: number;
  current: number | null;
  history: number | null;
}

export function beijingHour(timestampSeconds: number): number {
  return Math.floor(
    (((timestampSeconds + 8 * 3600) % 86400) + 86400) % 86400 / 3600,
  );
}

/**
 * 把每个赛季的数据按 (day_offset, hour) 分桶
 *
 * day_offset = (scraped_at - earliest_scraped_at) / 86400  // 从最早数据点算起
 * hour = beijingHour(scraped_at)                            // 北京时间 0-23
 *
 * 之前用 (season_day - min_season_day) * 24 + beijingHour 有一个 bug:
 * season_day 是按服务器/数据库逻辑切日（不一定 0 点切），beijingHour 是按北京 0 点切。
 * 两者不是线性叠加，会出现：
 *   season_day=1 hour=23 → elapsedHour=23
 *   season_day=1 hour=0  → elapsedHour=0   （跳回 0）
 *   season_day=2 hour=1  → elapsedHour=25  （跳到 25）
 * elapsedHour=24 永远不存在 → 图表永远断
 *
 * 正确做法：elapsedHour = (scraped_at - earliest_in_this_data) / 3600
 * 用纯物理时间偏移计算，单调递增，不存在跳号。
 */
function latestHourlyPrices(rows: FirePricePoint[]) {
  const buckets = new Map<number, { price: number; scrapedAt: number }>();
  if (rows.length === 0) return buckets;
  const baseTs = Math.min(...rows.map((r) => r.scraped_at));
  for (const row of rows) {
    if (row.rmb_per_10k_fire <= 0) continue;
    // elapsedHour = 真实经过的小时数（从最早数据点起算，单调递增）
    const elapsedHour = Math.floor((row.scraped_at - baseTs) / 3600);
    const existing = buckets.get(elapsedHour);
    if (!existing || row.scraped_at > existing.scrapedAt) {
      buckets.set(elapsedHour, {
        price: row.rmb_per_10k_fire,
        scrapedAt: row.scraped_at,
      });
    }
  }
  return buckets;
}

export function buildHourlyFireComparison(
  currentRows: FirePricePoint[],
  historyRows: FirePricePoint[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _currentSeasonStart: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _historySeasonStart: number,
): HourlyFireComparePoint[] {
  // seasonStart 参数现在不用了（保留签名以兼容调用方）
  const current = latestHourlyPrices(currentRows);
  const history = latestHourlyPrices(historyRows);
  const keys = Array.from(new Set([...current.keys(), ...history.keys()])).sort((a, b) => a - b);

  return keys.map((elapsedHour) => {
    const dayOffset = Math.floor(elapsedHour / 24) + 1; // 1-based day
    const hour = elapsedHour % 24;
    return {
      label: `第${dayOffset}天 ${String(hour).padStart(2, "0")}:00`,
      sortKey: elapsedHour,
      dayOffset,
      hour,
      current: current.get(elapsedHour)?.price ?? null,
      history: history.get(elapsedHour)?.price ?? null,
    };
  });
}
