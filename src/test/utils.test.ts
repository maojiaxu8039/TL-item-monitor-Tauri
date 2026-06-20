import { describe, it, expect } from "vitest";
import { formatTimestamp } from "@/lib/format";

describe("formatTimestamp", () => {
  it("formats Unix timestamp to local string", () => {
    const result = formatTimestamp(1700000000);
    expect(result).toBeTruthy();
    expect(result).toContain("2023");
  });

  it("handles current timestamp", () => {
    const now = Math.floor(Date.now() / 1000);
    const result = formatTimestamp(now);
    expect(result).toBeTruthy();
  });
});

describe("Price Calculations", () => {
  it("calculates break-even correctly when buy equals sell", () => {
    const buyPrice = 1000.0;
    const sellPrice = 1142.86;
    const feeRate = 0.125;

    const totalBuy = buyPrice;
    const totalSell = sellPrice * (1 - feeRate);

    expect(Math.abs(totalBuy - totalSell) < 1).toBe(true);
  });

  it("calculates break-even price correctly", () => {
    const buyPrice = 1000;
    const feeRate = 0.125;

    const breakEvenPrice = buyPrice / (1 - feeRate);

    expect(Math.abs(breakEvenPrice - 1142.86) < 0.1).toBe(true);
  });

  it("calculates profit correctly", () => {
    const buyPrice = 1000;
    const sellPrice = 1200;
    const feeRate = 0.125;

    const totalSell = sellPrice * (1 - feeRate);
    const profit = totalSell - buyPrice;

    expect(Math.abs(profit - 50) < 1).toBe(true);
  });
});

describe("Number Formatting", () => {
  it("formats large numbers with toLocaleString", () => {
    const num = 1234567.89;
    const result = num.toLocaleString("zh-CN");
    expect(result).toBe("1,234,567.89");
  });

  it("formats percentage correctly", () => {
    const percent = 5.5;
    const result = `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
    expect(result).toBe("+5.5%");
  });

  it("handles null price display", () => {
    const price: number | null = null;
    const displayValue = price === null ? "—" : String(price);
    expect(displayValue).toBe("—");
  });
});
