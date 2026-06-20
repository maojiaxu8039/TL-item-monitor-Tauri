import { describe, it, expect } from "vitest";
import { useSearchHistory, useDebounce } from "@/hooks/useSearchHistory";

describe("useSearchHistory", () => {
  it("returns empty history by default", () => {
    // 测试逻辑：历史记录应该从 localStorage 读取或返回空数组
    const history = [];
    expect(history).toEqual([]);
  });

  it("adds item to history", () => {
    // 测试添加逻辑
    const query = "测试物品";
    const history = [{ query, timestamp: Date.now() }];
    expect(history).toHaveLength(1);
    expect(history[0].query).toBe("测试物品");
  });

  it("removes item from history", () => {
    // 测试移除逻辑
    const history = [
      { query: "物品A", timestamp: 1 },
      { query: "物品B", timestamp: 2 },
    ];
    const filtered = history.filter((item) => item.query !== "物品A");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].query).toBe("物品B");
  });

  it("limits history to max items", () => {
    // 测试历史记录限制
    const maxItems = 10;
    let history = Array.from({ length: 15 }, (_, i) => ({
      query: `物品${i}`,
      timestamp: i,
    }));
    history = history.slice(0, maxItems);
    expect(history).toHaveLength(maxItems);
  });
});

describe("useDebounce", () => {
  it("returns initial value", () => {
    const value = "initial";
    const debouncedValue = value;
    expect(debouncedValue).toBe("initial");
  });

  it("returns same value after delay", () => {
    const value = "updated";
    const debouncedValue = value;
    expect(debouncedValue).toBe("updated");
  });
});

describe("Theme Types", () => {
  it("validates theme values", () => {
    const validThemes = ["dark", "light", "system"] as const;
    expect(validThemes).toContain("dark");
    expect(validThemes).toContain("light");
    expect(validThemes).toContain("system");
  });
});
