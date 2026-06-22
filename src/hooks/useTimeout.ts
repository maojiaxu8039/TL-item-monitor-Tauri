import { useCallback, useEffect, useRef } from "react"

export function useTimeout(
  callback: () => void,
  delay: number | null,
): () => void {
  const savedCallback = useRef(callback)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  const clear = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    if (delay === null) return
    timeoutRef.current = window.setTimeout(() => {
      savedCallback.current()
      timeoutRef.current = null
    }, delay)
    return clear
  }, [delay, clear])

  return clear
}
