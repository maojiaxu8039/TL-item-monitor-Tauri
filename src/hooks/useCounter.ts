import { useCallback, useState } from "react"

export interface UseCounterReturn {
  count: number
  increment: (delta?: number) => void
  decrement: (delta?: number) => void
  reset: () => void
  set: (value: number) => void
}

export function useCounter(
  initialValue: number = 0,
  options: { min?: number; max?: number } = {},
): UseCounterReturn {
  const { min = -Infinity, max = Infinity } = options
  const [count, setCount] = useState(initialValue)

  const clamp = useCallback(
    (value: number) => Math.min(Math.max(value, min), max),
    [min, max],
  )

  const increment = useCallback(
    (delta: number = 1) => setCount((c) => clamp(c + delta)),
    [clamp],
  )

  const decrement = useCallback(
    (delta: number = 1) => setCount((c) => clamp(c - delta)),
    [clamp],
  )

  const reset = useCallback(() => setCount(initialValue), [initialValue])
  const set = useCallback((value: number) => setCount(clamp(value)), [clamp])

  return { count, increment, decrement, reset, set }
}
