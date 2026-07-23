import { describe, expect, it } from "vitest";
import { buildHourlyFireComparison, type FirePricePoint } from "@/lib/firePriceCompare";

describe("buildHourlyFireComparison", () => {
  // 防止 SS13 数据因 elapsedHour 负数被过滤掉的回归 bug
  // 场景：SS13 开服 7/18，但采集数据从 7/16 开始（开服前数据）
  it("keeps current-season data scraped before season start (negative elapsed hour)", () => {
    // SS13 开服日 2026-07-18 08:00 北京 = UTC 2026-07-18 00:00
    const ss13Start = 1784332800;
    // 采集于 2026-07-16 15:00 北京 (UTC 07:00) → season_day=1（数据库里是这个值）
    const earlyTs = 1784185200;

    const current: FirePricePoint[] = [
      { scraped_at: earlyTs, rmb_per_10k_fire: 100, season_day: 1 },
    ];

    const rows = buildHourlyFireComparison(current, [], ss13Start, ss13Start);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].current).toBe(100);
  });

  // SS12 数据 season_day=91，对齐到 day_offset=0（基于 min）
  it("normalizes history season_day to start from day_offset 0", () => {
    const ss12Start = 1776384000;
    const ss13Start = 1784332800;

    const current: FirePricePoint[] = [
      { scraped_at: 1784185200, rmb_per_10k_fire: 100, season_day: 1 }, // SS13 day 1
    ];
    const history: FirePricePoint[] = [
      // SS12 day 91 同物理时间（采集的最近一条）
      { scraped_at: 1784185200, rmb_per_10k_fire: 200, season_day: 91 },
    ];

    const rows = buildHourlyFireComparison(current, history, ss13Start, ss12Start);
    // 应该只有一行，current=100, history=200 对齐
    expect(rows.length).toBe(1);
    expect(rows[0].current).toBe(100);
    expect(rows[0].history).toBe(200);
    expect(rows[0].dayOffset).toBe(1);
  });

  // 排序：day_offset 1 在前，2 在后
  it("sorts rows by elapsed hour (chronological order)", () => {
    const current: FirePricePoint[] = [
      { scraped_at: 1784185200, rmb_per_10k_fire: 100, season_day: 1 }, // day 1 hour 15
      { scraped_at: 1784271600, rmb_per_10k_fire: 200, season_day: 2 }, // day 2 hour 15
      { scraped_at: 1784358000, rmb_per_10k_fire: 300, season_day: 3 }, // day 3 hour 15
    ];

    const rows = buildHourlyFireComparison(current, [], 0, 0);
    expect(rows.map((r) => r.dayOffset)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.current)).toEqual([100, 200, 300]);
  });

  // 0 值过滤
  it("skips rows with rmb_per_10k_fire = 0 (异常数据)", () => {
    const current: FirePricePoint[] = [
      { scraped_at: 1784185200, rmb_per_10k_fire: 100, season_day: 1 },
      { scraped_at: 1784188800, rmb_per_10k_fire: 0, season_day: 1 }, // 0 应该过滤
      { scraped_at: 1784192400, rmb_per_10k_fire: 200, season_day: 1 },
    ];

    const rows = buildHourlyFireComparison(current, [], 0, 0);
    expect(rows.length).toBe(2);
    expect(rows[0].current).toBe(100);
    expect(rows[1].current).toBe(200);
  });

  // 同一小时桶多条数据取最新
  it("takes the most recent price within the same hour bucket", () => {
    // 两个时间戳都落在北京时间 hour=15（UTC 7:00 北京 15:00, UTC 8:00 北京 16:00）
    // 实际上 hour 16 不等于 15，所以会分成两桶
    // 用同 hour 的两个时间戳：UTC 07:00 (15:00 北京) 和 UTC 07:30 (15:30 北京)
    const current: FirePricePoint[] = [
      { scraped_at: 1784185200, rmb_per_10k_fire: 100, season_day: 1 }, // 15:00 北京
      { scraped_at: 1784187000, rmb_per_10k_fire: 200, season_day: 1 }, // 15:30 北京（同一小时桶）
    ];

    const rows = buildHourlyFireComparison(current, [], 0, 0);
    expect(rows.length).toBe(1);
    expect(rows[0].current).toBe(200); // 取最新的
  });
});