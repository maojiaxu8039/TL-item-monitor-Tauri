export function daysBetween(start: Date | number, end: Date | number): number {
  const startMs = typeof start === "number" ? start : start.getTime()
  const endMs = typeof end === "number" ? end : end.getTime()
  const diff = Math.abs(endMs - startMs)
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function hoursBetween(start: Date | number, end: Date | number): number {
  const startMs = typeof start === "number" ? start : start.getTime()
  const endMs = typeof end === "number" ? end : end.getTime()
  return Math.abs(endMs - startMs) / (1000 * 60 * 60)
}

export function minutesBetween(start: Date | number, end: Date | number): number {
  const startMs = typeof start === "number" ? start : start.getTime()
  const endMs = typeof end === "number" ? end : end.getTime()
  return Math.abs(endMs - startMs) / (1000 * 60)
}

export function isToday(date: Date | number): boolean {
  const target = typeof date === "number" ? new Date(date) : date
  const now = new Date()
  return (
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate()
  )
}

export function isYesterday(date: Date | number): boolean {
  const target = typeof date === "number" ? new Date(date) : date
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return (
    target.getFullYear() === yesterday.getFullYear() &&
    target.getMonth() === yesterday.getMonth() &&
    target.getDate() === yesterday.getDate()
  )
}

export function isThisWeek(date: Date | number): boolean {
  const target = typeof date === "number" ? new Date(date) : date
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setHours(0, 0, 0, 0)
  startOfWeek.setDate(now.getDate() - now.getDay())
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)
  return target >= startOfWeek && target < endOfWeek
}

export function isThisMonth(date: Date | number): boolean {
  const target = typeof date === "number" ? new Date(date) : date
  const now = new Date()
  return (
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth()
  )
}

export function startOfDay(date: Date | number): Date {
  const result = typeof date === "number" ? new Date(date) : new Date(date.getTime())
  result.setHours(0, 0, 0, 0)
  return result
}

export function endOfDay(date: Date | number): Date {
  const result = typeof date === "number" ? new Date(date) : new Date(date.getTime())
  result.setHours(23, 59, 59, 999)
  return result
}

export function addDays(date: Date | number, days: number): Date {
  const result = typeof date === "number" ? new Date(date) : new Date(date.getTime())
  result.setDate(result.getDate() + days)
  return result
}

export function addHours(date: Date | number, hours: number): Date {
  const result = typeof date === "number" ? new Date(date) : new Date(date.getTime())
  result.setHours(result.getHours() + hours)
  return result
}

export function addMinutes(date: Date | number, minutes: number): Date {
  const result = typeof date === "number" ? new Date(date) : new Date(date.getTime())
  result.setMinutes(result.getMinutes() + minutes)
  return result
}
