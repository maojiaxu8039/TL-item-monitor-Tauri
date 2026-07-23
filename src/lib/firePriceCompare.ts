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
 * - day_offset: 用 season_day 字段（数据库存的），取相对于 min(season_day) 的偏移
 *   例如 SS12 data season_day=91 (开服第 91 天) → day_offset = 90
 *   例如 SS13 data season_day=1 (开服第 1 天) → day_offset = 0
 *   这样两个赛季的"开服第 N 天"会真正对齐
 * - hour: 用 beijingHour (按北京时间算)
 *
 * 不用 seasonStart 算的原因:
 *   SS13 数据采集时间（7/16 ~ 7/23）部分早于 SS13 开服日（7/18），
 *   导致 elapsedHour 出现负数被过滤 → SS13 数据完全丢失
 */
function latestHourlyPrices(rows: FirePricePoint[]) {
  const buckets = new Map<number, { price: number; scrapedAt: number }>();
  if (rows.length === 0) return buckets;
  const minDay = Math.min(...rows.map((r) => r.season_day));
  for (const row of rows) {
    if (row.rmb_per_10k_fire <= 0) continue;
    const dayOffset = row.season_day - minDay; // 0-based
    const hour = beijingHour(row.scraped_at); // 0-23 北京时间
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
