import { useCallback, useEffect, useRef } from "react"

export function useThrottle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number = 300,
): T {
  const lastRunRef = useRef<number>(0)
  const timeoutRef = useRef<number | null>(null)
  const fnRef = useRef(fn)

  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return useCallback(
    ((...args: Parameters<T>) => {
      const now = Date.now()
      const elapsed = now - lastRunRef.current

      if (elapsed >= delay) {
        lastRunRef.current = now
        fnRef.current(...args)
      } else {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = window.setTimeout(() => {
          lastRunRef.current = Date.now()
          fnRef.current(...args)
        }, delay - elapsed)
      }
    }) as T,
    [delay],
  )
}
