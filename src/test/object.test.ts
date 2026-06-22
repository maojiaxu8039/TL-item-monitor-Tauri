import { describe, expect, it } from "vitest"
import {
  pick,
  omit,
  groupBy,
  countBy,
  sumBy,
  averageBy,
  minBy,
  maxBy,
  sortBy,
  uniqBy,
  chunk,
  deepClone,
} from "@/lib/object"

describe("pick", () => {
  it("picks specified keys", () => {
    const obj = { a: 1, b: 2, c: 3 }
    expect(pick(obj, ["a", "c"])).toEqual({ a: 1, c: 3 })
  })
})

describe("omit", () => {
  it("omits specified keys", () => {
    const obj = { a: 1, b: 2, c: 3 }
    expect(omit(obj, ["b"])).toEqual({ a: 1, c: 3 })
  })
})

describe("groupBy", () => {
  it("groups items by key", () => {
    const items = [
      { type: "a", value: 1 },
      { type: "b", value: 2 },
      { type: "a", value: 3 },
    ]
    const result = groupBy(items, (item) => item.type)
    expect(result.a).toHaveLength(2)
    expect(result.b).toHaveLength(1)
  })
})

describe("countBy", () => {
  it("counts items by key", () => {
    const items = ["a", "b", "a", "c", "a"]
    const result = countBy(items, (item) => item)
    expect(result).toEqual({ a: 3, b: 1, c: 1 })
  })
})

describe("sumBy", () => {
  it("sums values", () => {
    const items = [{ n: 1 }, { n: 2 }, { n: 3 }]
    expect(sumBy(items, (item) => item.n)).toBe(6)
  })
})

describe("averageBy", () => {
  it("calculates average", () => {
    const items = [{ n: 1 }, { n: 2 }, { n: 3 }]
    expect(averageBy(items, (item) => item.n)).toBe(2)
  })
  it("returns 0 for empty array", () => {
    expect(averageBy([], (item: { n: number }) => item.n)).toBe(0)
  })
})

describe("minBy", () => {
  it("finds item with minimum value", () => {
    const items = [{ n: 3 }, { n: 1 }, { n: 2 }]
    expect(minBy(items, (item) => item.n)).toEqual({ n: 1 })
  })
  it("returns undefined for empty", () => {
    expect(minBy([], (item: { n: number }) => item.n)).toBeUndefined()
  })
})

describe("maxBy", () => {
  it("finds item with maximum value", () => {
    const items = [{ n: 1 }, { n: 3 }, { n: 2 }]
    expect(maxBy(items, (item) => item.n)).toEqual({ n: 3 })
  })
})

describe("sortBy", () => {
  it("sorts ascending by default", () => {
    const items = [{ n: 3 }, { n: 1 }, { n: 2 }]
    const result = sortBy(items, (item) => item.n)
    expect(result).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
  })
  it("sorts descending", () => {
    const items = [{ n: 1 }, { n: 3 }, { n: 2 }]
    const result = sortBy(items, (item) => item.n, "desc")
    expect(result).toEqual([{ n: 3 }, { n: 2 }, { n: 1 }])
  })
})

describe("uniqBy", () => {
  it("removes duplicates by key", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 1 }, { id: 3 }]
    const result = uniqBy(items, (item) => item.id)
    expect(result).toHaveLength(3)
  })
})

describe("chunk", () => {
  it("splits array into chunks", () => {
    const result = chunk([1, 2, 3, 4, 5], 2)
    expect(result).toEqual([[1, 2], [3, 4], [5]])
  })
  it("returns empty for invalid size", () => {
    expect(chunk([1, 2, 3], 0)).toEqual([])
  })
})

describe("deepClone", () => {
  it("clones primitive", () => {
    expect(deepClone(1)).toBe(1)
    expect(deepClone("str")).toBe("str")
    expect(deepClone(null)).toBe(null)
  })
  it("clones array", () => {
    const arr = [1, [2, 3]]
    const cloned = deepClone(arr)
    expect(cloned).toEqual(arr)
    expect(cloned).not.toBe(arr)
  })
  it("clones object", () => {
    const obj = { a: 1, b: { c: 2 } }
    const cloned = deepClone(obj)
    expect(cloned).toEqual(obj)
    expect(cloned.b).not.toBe(obj.b)
  })
  it("clones Date", () => {
    const date = new Date()
    const cloned = deepClone(date)
    expect(cloned).toEqual(date)
    expect(cloned).not.toBe(date)
  })
  it("clones Map", () => {
    const map = new Map([["a", 1]])
    const cloned = deepClone(map)
    expect(cloned.get("a")).toBe(1)
    expect(cloned).not.toBe(map)
  })
  it("clones Set", () => {
    const set = new Set([1, 2, 3])
    const cloned = deepClone(set)
    expect(cloned.has(1)).toBe(true)
    expect(cloned).not.toBe(set)
  })
})
