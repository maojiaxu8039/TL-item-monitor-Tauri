import { describe, expect, it } from "vitest"
import {
  isValidEmail,
  isValidUrl,
  isPositiveNumber,
  isNonNegativeNumber,
  isValidPrice,
  isValidQuantity,
  isNonEmptyString,
  clampNumber,
  safeParseFloat,
  safeParseInt,
} from "@/lib/validation"

describe("isValidEmail", () => {
  it("returns true for valid email", () => {
    expect(isValidEmail("user@example.com")).toBe(true)
    expect(isValidEmail("a.b+c@sub.example.co.uk")).toBe(true)
  })
  it("returns false for invalid email", () => {
    expect(isValidEmail("")).toBe(false)
    expect(isValidEmail("not-an-email")).toBe(false)
    expect(isValidEmail("@example.com")).toBe(false)
  })
})

describe("isValidUrl", () => {
  it("returns true for valid URL", () => {
    expect(isValidUrl("https://example.com")).toBe(true)
    expect(isValidUrl("http://localhost:3000/path?query=1")).toBe(true)
  })
  it("returns false for invalid URL", () => {
    expect(isValidUrl("")).toBe(false)
    expect(isValidUrl("not a url")).toBe(false)
  })
})

describe("isPositiveNumber", () => {
  it("returns true for positive numbers", () => {
    expect(isPositiveNumber(1)).toBe(true)
    expect(isPositiveNumber(0.5)).toBe(true)
  })
  it("returns false for non-positive", () => {
    expect(isPositiveNumber(0)).toBe(false)
    expect(isPositiveNumber(-1)).toBe(false)
    expect(isPositiveNumber(NaN)).toBe(false)
    expect(isPositiveNumber("1")).toBe(false)
  })
})

describe("isNonNegativeNumber", () => {
  it("returns true for zero and positive", () => {
    expect(isNonNegativeNumber(0)).toBe(true)
    expect(isNonNegativeNumber(1)).toBe(true)
  })
  it("returns false for negative", () => {
    expect(isNonNegativeNumber(-1)).toBe(false)
  })
})

describe("isValidPrice", () => {
  it("returns true for positive numbers", () => {
    expect(isValidPrice(0.01)).toBe(true)
    expect(isValidPrice(1000)).toBe(true)
  })
  it("returns false for zero or negative", () => {
    expect(isValidPrice(0)).toBe(false)
    expect(isValidPrice(-100)).toBe(false)
  })
})

describe("isValidQuantity", () => {
  it("returns true for positive integers", () => {
    expect(isValidQuantity(1)).toBe(true)
    expect(isValidQuantity(100)).toBe(true)
  })
  it("returns false for non-integers or zero", () => {
    expect(isValidQuantity(0)).toBe(false)
    expect(isValidQuantity(1.5)).toBe(false)
    expect(isValidQuantity(-1)).toBe(false)
  })
})

describe("isNonEmptyString", () => {
  it("returns true for non-empty strings", () => {
    expect(isNonEmptyString("hello")).toBe(true)
    expect(isNonEmptyString(" a ")).toBe(true)
  })
  it("returns false for empty/whitespace strings", () => {
    expect(isNonEmptyString("")).toBe(false)
    expect(isNonEmptyString("   ")).toBe(false)
  })
  it("returns false for non-strings", () => {
    expect(isNonEmptyString(null)).toBe(false)
    expect(isNonEmptyString(123)).toBe(false)
  })
})

describe("clampNumber", () => {
  it("clamps value to range", () => {
    expect(clampNumber(5, 0, 10)).toBe(5)
    expect(clampNumber(-1, 0, 10)).toBe(0)
    expect(clampNumber(15, 0, 10)).toBe(10)
  })
})

describe("safeParseFloat", () => {
  it("parses valid string", () => {
    expect(safeParseFloat("3.14")).toBe(3.14)
  })
  it("returns fallback for invalid", () => {
    expect(safeParseFloat("abc", 1.0)).toBe(1.0)
    expect(safeParseFloat(null, 0)).toBe(0)
    expect(safeParseFloat(undefined, 5)).toBe(5)
  })
})

describe("safeParseInt", () => {
  it("parses valid string", () => {
    expect(safeParseInt("42")).toBe(42)
  })
  it("returns fallback for invalid", () => {
    expect(safeParseInt("abc", 0)).toBe(0)
    expect(safeParseInt(null, -1)).toBe(-1)
  })
})
