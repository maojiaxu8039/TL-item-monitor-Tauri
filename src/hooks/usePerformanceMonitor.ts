import { useEffect, useRef } from "react"

export interface PerformanceMark {
  label: string
  startTime: number
  duration: number
  metadata?: Record<string, unknown>
}

export function usePerformanceMonitor(label: string, enabled: boolean = true) {
  const startTimeRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    startTimeRef.current = performance.now()
    return () => {
      if (startTimeRef.current !== null) {
        const duration = performance.now() - startTimeRef.current
        if (duration > 100) {
          console.warn(
            `[Performance] ${label} took ${duration.toFixed(2)}ms`,
          )
        }
      }
    }
  }, [label, enabled])
}

export function measureAsync<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now()
  return fn().finally(() => {
    const duration = performance.now() - start
    if (duration > 100) {
      console.warn(`[Performance] ${label} took ${duration.toFixed(2)}ms`)
    }
  })
}
