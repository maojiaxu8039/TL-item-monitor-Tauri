export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key]
    }
  }
  return result
}

export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj }
  for (const key of keys) {
    delete result[key]
  }
  return result
}

export function groupBy<T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K,
): Record<K, T[]> {
  return array.reduce((acc, item) => {
    const key = keyFn(item)
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(item)
    return acc
  }, {} as Record<K, T[]>)
}

export function countBy<T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K,
): Record<K, number> {
  return array.reduce((acc, item) => {
    const key = keyFn(item)
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {} as Record<K, number>)
}

export function sumBy<T>(array: T[], selector: (item: T) => number): number {
  return array.reduce((sum, item) => sum + selector(item), 0)
}

export function averageBy<T>(array: T[], selector: (item: T) => number): number {
  if (array.length === 0) return 0
  return sumBy(array, selector) / array.length
}

export function minBy<T>(array: T[], selector: (item: T) => number): T | undefined {
  if (array.length === 0) return undefined
  return array.reduce((min, item) =>
    selector(item) < selector(min) ? item : min,
  )
}

export function maxBy<T>(array: T[], selector: (item: T) => number): T | undefined {
  if (array.length === 0) return undefined
  return array.reduce((max, item) =>
    selector(item) > selector(max) ? item : max,
  )
}

export function sortBy<T>(
  array: T[],
  selector: (item: T) => string | number,
  direction: "asc" | "desc" = "asc",
): T[] {
  const factor = direction === "asc" ? 1 : -1
  return [...array].sort((a, b) => {
    const aVal = selector(a)
    const bVal = selector(b)
    if (aVal < bVal) return -1 * factor
    if (aVal > bVal) return 1 * factor
    return 0
  })
}

export function uniqBy<T, K>(array: T[], keyFn: (item: T) => K): T[] {
  const seen = new Set<K>()
  return array.filter((item) => {
    const key = keyFn(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) return []
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T
  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as unknown as T
  }
  if (obj instanceof Map) {
    return new Map(
      Array.from(obj.entries()).map(([k, v]) => [k, deepClone(v)]),
    ) as unknown as T
  }
  if (obj instanceof Set) {
    return new Set(Array.from(obj).map((item) => deepClone(item))) as unknown as T
  }
  const result: Record<string, unknown> = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = deepClone((obj as Record<string, unknown>)[key])
    }
  }
  return result as T
}
