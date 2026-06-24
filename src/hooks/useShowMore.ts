import { useCallback, useEffect, useState } from "react"

export interface UseShowMoreOptions {
  initialCount?: number
  step?: number
}

export interface UseShowMoreResult {
  visibleCount: number
  hasMore: boolean
  remaining: number
  showMore: () => void
  collapse: () => void
  reset: () => void
}

export function useShowMore(
  total: number,
  { initialCount = 10, step = 10 }: UseShowMoreOptions = {},
): UseShowMoreResult {
  const [visibleCount, setVisibleCount] = useState(initialCount)

  useEffect(() => {
    setVisibleCount((prev) => Math.min(prev, total))
  }, [total])

  const showMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + step, total))
  }, [step, total])

  const collapse = useCallback(() => {
    setVisibleCount(Math.min(initialCount, total))
  }, [initialCount, total])

  const reset = useCallback(() => {
    setVisibleCount(Math.min(initialCount, total))
  }, [initialCount, total])

  const hasMore = visibleCount < total
  const remaining = Math.max(0, total - visibleCount)

  return { visibleCount, hasMore, remaining, showMore, collapse, reset }
}
