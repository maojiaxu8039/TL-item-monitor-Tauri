import { useCallback, useMemo, useState } from "react"

export interface UsePaginationOptions {
  defaultPage?: number
  defaultPageSize?: number
}

export interface UsePaginationReturn {
  page: number
  pageSize: number
  total: number
  setTotal: (total: number) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  next: () => void
  prev: () => void
  reset: () => void
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
  offset: number
}

export function usePagination(
  options: UsePaginationOptions = {},
): UsePaginationReturn {
  const { defaultPage = 1, defaultPageSize = 20 } = options
  const [page, setPage] = useState(defaultPage)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [total, setTotal] = useState(0)

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize],
  )

  const hasNext = page < totalPages
  const hasPrev = page > 1

  const next = useCallback(() => {
    setPage((p) => (p < totalPages ? p + 1 : p))
  }, [totalPages])

  const prev = useCallback(() => {
    setPage((p) => (p > 1 ? p - 1 : p))
  }, [])

  const reset = useCallback(() => {
    setPage(defaultPage)
  }, [defaultPage])

  const offset = (page - 1) * pageSize

  return {
    page,
    pageSize,
    total,
    setTotal,
    setPage,
    setPageSize,
    next,
    prev,
    reset,
    totalPages,
    hasNext,
    hasPrev,
    offset,
  }
}
