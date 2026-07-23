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

  // 防止 (season_day - min_season_day) * 24 + beijingHour 的双重编码 bug
  // 场景：season_day 切日时间不固定，beijingHour 按 0 点切
  // 之前实现：elapsedHour 在 7/18 00:00 (season_day=1 hour=0) 跳到 0
  //           然后在 7/18 01:00 (season_day=2 hour=1) 跳到 25
  //           → elapsedHour=24 永远不存在，图表永远断
  // 正确实现：纯物理时间偏移，elapsedHour 单调递增
  it("produces monotonically increasing elapsed hours across season_day boundaries", () => {
    // 7/17 13:00 北京 = 1784264400 UTC，scrape 时刻按小时+1h
    // season_day 按服务器分配（不一定 0 点切）
    const current: FirePricePoint[] = [
      { scraped_at: 1784264400, rmb_per_10k_fire: 100, season_day: 1 }, // 7/17 13:00
      { scraped_at: 1784268000, rmb_per_10k_fire: 110, season_day: 1 }, // 7/17 14:00
      { scraped_at: 1784300400, rmb_per_10k_fire: 120, season_day: 1 }, // 7/17 23:00
      // 跨日：season_day 没变但 beijingHour=0
      { scraped_at: 1784304000, rmb_per_10k_fire: 130, season_day: 1 }, // 7/18 00:00
      // season_day 切到 2
      { scraped_at: 1784307600, rmb_per_10k_fire: 140, season_day: 2 }, // 7/18 01:00
      { scraped_at: 1784340000, rmb_per_10k_fire: 150, season_day: 2 }, // 7/18 10:00
    ];

    const rows = buildHourlyFireComparison(current, [], 0, 0);
    expect(rows.length).toBe(6);

    // 每个 row 的 sortKey 应该是 0, 1, 10, 11, 12, 21（从 7/17 13:00 起算的小时数）
    expect(rows[0].sortKey).toBe(0);
    expect(rows[1].sortKey).toBe(1);
    expect(rows[2].sortKey).toBe(10);
    expect(rows[3].sortKey).toBe(11);
    expect(rows[4].sortKey).toBe(12);
    expect(rows[5].sortKey).toBe(21);

    // sortKey 必须单调递增
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].sortKey).toBeGreaterThan(rows[i-1].sortKey);
    }
  });
});