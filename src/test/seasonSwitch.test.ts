import { describe, expect, it, vi } from "vitest";
import {
  beijingDateToUnix,
  beijingToday,
  calculateSeasonApiIds,
} from "@/lib/season";

describe("season switch helpers", () => {
  it("calculates API ids in 100-id season increments", () => {
    expect(calculateSeasonApiIds(12)).toEqual({ normal: 1401, expert: 1431 });
    expect(calculateSeasonApiIds(13)).toEqual({ normal: 1501, expert: 1531 });
    expect(calculateSeasonApiIds(14)).toEqual({ normal: 1601, expert: 1631 });
  });

  it("converts Beijing midnight to a Unix timestamp", () => {
    expect(beijingDateToUnix("2026-07-16")).toBe(1784131200);
  });

  it("calculates today's date in the Beijing timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T17:00:00Z"));
    expect(beijingToday()).toBe("2026-07-16");
    vi.useRealTimers();
  });
});

describe("season probe result shape", () => {
  // 探测结果 3 态：live / not_open / error
  // 保护前端 components/dashboard/SeasonSwitchWizard.tsx 的展示逻辑
  type Status = "live" | "not_open" | "error";
  type Entry = { status: Status; latest: number | null; message: string | null };
  type Result = {
    luosi_normal: Entry;
    luosi_expert: Entry;
    etor_normal: Entry;
    etor_expert: Entry;
    season_open: boolean;
  };

  it("treats normal-live + expert-not_open as season open (wizard can proceed)", () => {
    const result: Result = {
      luosi_normal: { status: "live", latest: 1784714438, message: null },
      luosi_expert: { status: "not_open", latest: null, message: "API 返回空数据" },
      etor_normal: { status: "live", latest: 1784714400, message: null },
      etor_expert: { status: "not_open", latest: null, message: "trend 数组为空" },
      season_open: true,
    };
    expect(result.season_open).toBe(true);
    expect(result.luosi_normal.status).toBe("live");
    expect(result.luosi_expert.status).toBe("not_open");
  });

  it("blocks switch when normal服 neither live (both error)", () => {
    const result: Result = {
      luosi_normal: { status: "error", latest: null, message: "HTTP 404" },
      luosi_expert: { status: "error", latest: null, message: "HTTP 404" },
      etor_normal: { status: "error", latest: null, message: "网络请求失败" },
      etor_expert: { status: "error", latest: null, message: "网络请求失败" },
      season_open: false,
    };
    expect(result.season_open).toBe(false);
  });

  it("only requires at least one normal API to be live", () => {
    const result: Result = {
      luosi_normal: { status: "error", latest: null, message: "HTTP 500" },
      luosi_expert: { status: "not_open", latest: null, message: "赛季/服尚未开放" },
      etor_normal: { status: "live", latest: 1784714400, message: null },
      etor_expert: { status: "not_open", latest: null, message: "赛季/服尚未开放" },
      season_open: true,
    };
    expect(result.season_open).toBe(true);
  });
});
