export function isValidEmail(email: string): boolean {
  if (!email) return false
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return pattern.test(email)
}

export function isValidUrl(url: string): boolean {
  if (!url) return false
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value) && value > 0
}

export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value) && value >= 0
}

export function isValidPrice(value: unknown): value is number {
  return isPositiveNumber(value)
}

export function isValidQuantity(value: unknown): value is number {
  return Number.isInteger(value) && isPositiveNumber(value)
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function safeParseFloat(value: string | null | undefined, fallback: number = 0): number {
  if (!value) return fallback
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? fallback : parsed
}

export function safeParseInt(value: string | null | undefined, fallback: number = 0): number {
  if (!value) return fallback
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}
