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
 * 把每个赛季的数据按 (dayOffset, hour) 分桶
 *
 * 关键：用数据库里已经计算好的 season_day 字段 + beijingHour(scraped_at)
 * - season_day 数据库已经按"北京自然日 0:00 切"算好（开服=day 1，下个 0:00=day 2）
 * - dayOffset = season_day - min_season_day + 1 = 1-based day（每个赛季从 1 开始）
 * - hour = beijingHour(scraped_at) = 0-23 北京时间
 *
 * 之前 (scraped_at - baseTs) / 3600 + baseTs%24 算法：
 *   假设 SS13 最早数据 7/17 13:00，baseTs=7/17 13:00
 *   7/17 13:00 → elapsedHour=0, hour = 0%24 = 0 ❌（实际 hour 应该是 13）
 *   → 图表显示"第1天 00:00"，但实际数据是 13:00
 *
 * 正确算法：用 season_day 算 dayOffset，用 beijingHour 算 hour
 */
function latestHourlyPrices(rows: FirePricePoint[]) {
  const buckets = new Map<number, { price: number; scrapedAt: number }>();
  if (rows.length === 0) return buckets;
  const minDay = Math.min(...rows.map((r) => r.season_day));
  for (const row of rows) {
    if (row.rmb_per_10k_fire <= 0) continue;
    const dayOffset = row.season_day - minDay; // 0-based
    const hour = beijingHour(row.scraped_at); // 0-23
    const elapsedHour = dayOffset * 24 + hour;
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
