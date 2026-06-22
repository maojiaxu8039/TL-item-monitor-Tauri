export function formatNumber(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
  locale: string = "zh-CN",
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  return value.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    ...options,
  })
}

export function formatPrice(
  price: number | null | undefined,
  locale: string = "zh-CN",
): string {
  if (price === null || price === undefined || Number.isNaN(price)) return "—"
  return price.toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

export function formatPercent(
  value: number | null | undefined,
  digits: number = 1,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(digits)}%`
}

export function formatCurrency(
  value: number | null | undefined,
  currency: string = "CNY",
  locale: string = "zh-CN",
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatDate(
  timestamp: number | string | Date | null | undefined,
  format: "date" | "time" | "datetime" | "relative" = "datetime",
  locale: string = "zh-CN",
): string {
  if (timestamp === null || timestamp === undefined) return "—"
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  if (Number.isNaN(date.getTime())) return "—"

  if (format === "relative") {
    return formatRelativeTime(date)
  }

  const options: Intl.DateTimeFormatOptions =
    format === "date"
      ? { year: "numeric", month: "2-digit", day: "2-digit" }
      : format === "time"
        ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
        : {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }
  return new Intl.DateTimeFormat(locale, options).format(date)
}

export function formatRelativeTime(date: Date, locale: string = "zh-CN"): string {
  const now = Date.now()
  const diff = now - date.getTime()
  const absDiff = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })

  if (absDiff < 60_000) return rtf.format(-Math.floor(diff / 1000), "second")
  if (absDiff < 3_600_000) return rtf.format(-Math.floor(diff / 60_000), "minute")
  if (absDiff < 86_400_000) return rtf.format(-Math.floor(diff / 3_600_000), "hour")
  if (absDiff < 2_592_000_000) return rtf.format(-Math.floor(diff / 86_400_000), "day")
  if (absDiff < 31_536_000_000) return rtf.format(-Math.floor(diff / 2_592_000_000), "month")
  return rtf.format(-Math.floor(diff / 31_536_000_000), "year")
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes < 0) return "—"
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(value >= 100 ? 0 : 2)} ${units[i]}`
}

export function truncate(
  text: string | null | undefined,
  maxLength: number = 50,
  suffix: string = "...",
): string {
  if (!text) return ""
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - suffix.length) + suffix
}

/** @deprecated 使用 formatDate 代替 */
export function formatTimestamp(
  timestamp: number | string | Date | null | undefined,
  locale: string = "zh-CN",
): string {
  if (typeof timestamp === "number" && timestamp > 0 && timestamp < 1e12) {
    return formatDate(timestamp * 1000, "datetime", locale)
  }
  return formatDate(timestamp, "datetime", locale)
}
