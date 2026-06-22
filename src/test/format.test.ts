import { describe, expect, it } from "vitest"
import {
  formatNumber,
  formatPrice,
  formatPercent,
  formatCurrency,
  formatDate,
  formatFileSize,
  truncate,
  formatTimestamp,
} from "@/lib/format"

describe("formatNumber", () => {
  it("returns dash for null/undefined/NaN", () => {
    expect(formatNumber(null)).toBe("—")
    expect(formatNumber(undefined)).toBe("—")
    expect(formatNumber(NaN)).toBe("—")
  })
  it("formats numbers with default options", () => {
    expect(formatNumber(1234.567)).toMatch(/1,?234/)
  })
  it("respects custom options", () => {
    const result = formatNumber(0.5, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    expect(result).toBe("0.50")
  })
})

describe("formatPrice", () => {
  it("returns dash for null/undefined", () => {
    expect(formatPrice(null)).toBe("—")
    expect(formatPrice(undefined)).toBe("—")
  })
  it("formats price with 1 decimal place", () => {
    const result = formatPrice(1234.5)
    expect(result).toMatch(/1,?234\.5/)
  })
})

describe("formatPercent", () => {
  it("returns dash for null/undefined", () => {
    expect(formatPercent(null)).toBe("—")
    expect(formatPercent(undefined)).toBe("—")
  })
  it("adds + sign for positive", () => {
    expect(formatPercent(10)).toBe("+10.0%")
  })
  it("shows negative without +", () => {
    expect(formatPercent(-5)).toBe("-5.0%")
  })
})

describe("formatCurrency", () => {
  it("returns dash for null", () => {
    expect(formatCurrency(null)).toBe("—")
  })
  it("formats as CNY by default", () => {
    const result = formatCurrency(1234.5)
    expect(result).toMatch(/1,?234\.50/)
  })
})

describe("formatDate", () => {
  it("returns dash for null", () => {
    expect(formatDate(null)).toBe("—")
  })
  it("formats timestamp with datetime by default", () => {
    const result = formatDate(1700000000000, "datetime")
    expect(result).toMatch(/2023/)
  })
  it("formats date only", () => {
    const result = formatDate(1700000000000, "date")
    expect(result).toMatch(/2023/)
  })
})

describe("formatFileSize", () => {
  it("returns 0 B for 0", () => {
    expect(formatFileSize(0)).toBe("0 B")
  })
  it("formats bytes", () => {
    expect(formatFileSize(1024)).toMatch(/^1\.00? KB$/)
  })
  it("formats MB", () => {
    expect(formatFileSize(1024 * 1024)).toMatch(/^1\.00? MB$/)
  })
  it("returns dash for null", () => {
    expect(formatFileSize(null)).toBe("—")
  })
})

describe("truncate", () => {
  it("returns empty for null/undefined", () => {
    expect(truncate(null)).toBe("")
    expect(truncate(undefined)).toBe("")
  })
  it("returns as-is when shorter than max", () => {
    expect(truncate("hello", 10)).toBe("hello")
  })
  it("truncates when longer than max", () => {
    expect(truncate("hello world", 5)).toBe("he...")
  })
  it("uses custom suffix", () => {
    expect(truncate("hello world", 5, "…")).toBe("hell…")
  })
})

describe("formatTimestamp", () => {
  it("handles Unix timestamp in seconds", () => {
    const result = formatTimestamp(1700000000)
    expect(result).toMatch(/2023/)
  })
  it("handles millisecond timestamp", () => {
    const result = formatTimestamp(1700000000000)
    expect(result).toMatch(/2023/)
  })
  it("returns dash for null", () => {
    expect(formatTimestamp(null)).toBe("—")
  })
})
