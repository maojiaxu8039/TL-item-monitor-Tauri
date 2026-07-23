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

  // 防止 (scraped_at - baseTs) / 3600 算法把 hour 算成 0
  // 场景：SS13 最早数据 7/17 13:00，baseTs=7/17 13:00
  // 之前：elapsedHour=0 → hour = 0%24 = 0（错，实际应该是 13）
  // 正确：用 beijingHour(scraped_at) 算 hour（13），用 season_day 算 dayOffset
  it("uses beijingHour for hour, not elapsedHour % 24", () => {
    // SS13 最早数据 7/17 13:00 北京 = UTC 7/17 05:00 = 1784264400
    const current: FirePricePoint[] = [
      { scraped_at: 1784264400, rmb_per_10k_fire: 100, season_day: 1 }, // 7/17 13:00 北京
    ];

    const rows = buildHourlyFireComparison(current, [], 0, 0);
    expect(rows.length).toBe(1);
    // 关键：hour 应该是 13（beijingHour），不是 0（elapsedHour%24）
    expect(rows[0].hour).toBe(13);
    expect(rows[0].dayOffset).toBe(1);
    expect(rows[0].label).toBe("第1天 13:00");
  });

  // 验证 season_day 跨日时 dayOffset 正确
  it("uses season_day for dayOffset (so day boundary matches 北京 0:00)", () => {
    // 7/17 13:00 北京 = UTC 7/17 05:00 = 1784264400
    // 7/18 00:00 北京 = UTC 7/17 16:00 = 1784304000
    // 7/18 01:00 北京 = UTC 7/17 17:00 = 1784307600
    // 7/19 00:00 北京 = UTC 7/18 16:00 = 1784390400
    // 7/19 01:00 北京 = UTC 7/18 17:00 = 1784394000
    const current: FirePricePoint[] = [
      { scraped_at: 1784264400, rmb_per_10k_fire: 100, season_day: 1 }, // 7/17 13:00 day=1
      { scraped_at: 1784304000, rmb_per_10k_fire: 130, season_day: 1 }, // 7/18 00:00 day=1
      { scraped_at: 1784307600, rmb_per_10k_fire: 140, season_day: 2 }, // 7/18 01:00 day=2
      { scraped_at: 1784390400, rmb_per_10k_fire: 200, season_day: 2 }, // 7/19 00:00 day=2
      { scraped_at: 1784394000, rmb_per_10k_fire: 210, season_day: 3 }, // 7/19 01:00 day=3
    ];

    const rows = buildHourlyFireComparison(current, [], 0, 0);
    expect(rows.length).toBe(5);

    // rows 按 sortKey (elapsedHour) 升序排
    // sortKey=0 (7/18 00:00, day=1 hour=0) 排第一
    // sortKey=13 (7/17 13:00, day=1 hour=13) 排第二
    // sortKey=24 (7/19 00:00, day=2 hour=0) 排第三
    // sortKey=25 (7/18 01:00, day=2 hour=1) 排第四
    // sortKey=49 (7/19 01:00, day=3 hour=1) 排第五
    expect(rows[0].dayOffset).toBe(1); expect(rows[0].hour).toBe(0);  // 7/18 00:00
    expect(rows[1].dayOffset).toBe(1); expect(rows[1].hour).toBe(13); // 7/17 13:00
    expect(rows[2].dayOffset).toBe(2); expect(rows[2].hour).toBe(0);  // 7/19 00:00
    expect(rows[3].dayOffset).toBe(2); expect(rows[3].hour).toBe(1);  // 7/18 01:00
    expect(rows[4].dayOffset).toBe(3); expect(rows[4].hour).toBe(1);  // 7/19 01:00
  });
});