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
