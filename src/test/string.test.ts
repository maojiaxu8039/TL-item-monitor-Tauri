import { describe, expect, it } from "vitest"
import {
  camelToSnake,
  snakeToCamel,
  kebabToCamel,
  camelToKebab,
  capitalize,
  titleCase,
  escapeHtml,
  stripHtml,
  slugify,
  containsChinese,
  isEmail,
  isUrl,
  randomString,
  hashCode,
} from "@/lib/string"

describe("camelToSnake", () => {
  it("converts camelCase to snake_case", () => {
    expect(camelToSnake("helloWorld")).toBe("hello_world")
    expect(camelToSnake("userId")).toBe("user_id")
  })
})

describe("snakeToCamel", () => {
  it("converts snake_case to camelCase", () => {
    expect(snakeToCamel("hello_world")).toBe("helloWorld")
    expect(snakeToCamel("user_id")).toBe("userId")
  })
})

describe("kebabToCamel", () => {
  it("converts kebab-case to camelCase", () => {
    expect(kebabToCamel("hello-world")).toBe("helloWorld")
  })
})

describe("camelToKebab", () => {
  it("converts camelCase to kebab-case", () => {
    expect(camelToKebab("helloWorld")).toBe("hello-world")
  })
})

describe("capitalize", () => {
  it("capitalizes first letter", () => {
    expect(capitalize("hello")).toBe("Hello")
    expect(capitalize("HELLO")).toBe("Hello")
  })
  it("handles empty string", () => {
    expect(capitalize("")).toBe("")
  })
})

describe("titleCase", () => {
  it("converts to title case", () => {
    expect(titleCase("hello world")).toBe("Hello World")
  })
})

describe("escapeHtml", () => {
  it("escapes HTML entities", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;")
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;")
    expect(escapeHtml("'world'")).toBe("&#39;world&#39;")
  })
})

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    expect(stripHtml("<p>hello</p>")).toBe("hello")
    expect(stripHtml("<div>test</div>")).toBe("test")
  })
})

describe("slugify", () => {
  it("converts to slug", () => {
    expect(slugify("Hello World")).toBe("hello-world")
    expect(slugify("Hello, World!")).toBe("hello-world")
  })
})

describe("containsChinese", () => {
  it("detects Chinese characters", () => {
    expect(containsChinese("hello")).toBe(false)
    expect(containsChinese("你好")).toBe(true)
    expect(containsChinese("hello你好")).toBe(true)
  })
})

describe("isEmail", () => {
  it("validates email", () => {
    expect(isEmail("user@example.com")).toBe(true)
    expect(isEmail("not-email")).toBe(false)
  })
})

describe("isUrl", () => {
  it("validates URL", () => {
    expect(isUrl("https://example.com")).toBe(true)
    expect(isUrl("not a url")).toBe(false)
  })
})

describe("randomString", () => {
  it("generates string of specified length", () => {
    expect(randomString(10)).toHaveLength(10)
    expect(randomString(20)).toHaveLength(20)
  })
})

describe("hashCode", () => {
  it("returns consistent hash for same input", () => {
    expect(hashCode("hello")).toBe(hashCode("hello"))
  })
  it("returns different hash for different input", () => {
    expect(hashCode("hello")).not.toBe(hashCode("world"))
  })
})
