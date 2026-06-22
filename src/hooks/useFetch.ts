import { useCallback, useEffect, useRef, useState } from "react"
import { errorMessage } from "@/lib/utils"

export interface UseFetchOptions<T> {
  enabled?: boolean
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
  retryCount?: number
  retryDelay?: number
  dependencies?: unknown[]
}

export interface UseFetchReturn<T> {
  data: T | null
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
  isStale: boolean
}

export function useFetch<T>(
  fetcher: () => Promise<T>,
  options: UseFetchOptions<T> = {},
): UseFetchReturn<T> {
  const {
    enabled = true,
    onSuccess,
    onError,
    retryCount = 0,
    retryDelay = 1000,
    dependencies = [],
  } = options

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [isStale, setIsStale] = useState(false)
  const mountedRef = useRef(true)
  const fetcherRef = useRef(fetcher)

  useEffect(() => {
    fetcherRef.current = fetcher
  }, [fetcher])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const execute = useCallback(async (attempt: number = 0) => {
    if (!mountedRef.current) return
    setLoading(true)
    setError(null)
    try {
      const result = await fetcherRef.current()
      if (!mountedRef.current) return
      setData(result)
      setIsStale(false)
      onSuccess?.(result)
    } catch (err) {
      if (!mountedRef.current) return
      const errObj = err instanceof Error ? err : new Error(errorMessage(err))
      if (attempt < retryCount) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
        if (mountedRef.current) {
          await execute(attempt + 1)
        }
        return
      }
      setError(errObj)
      onError?.(errObj)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [onSuccess, onError, retryCount, retryDelay])

  useEffect(() => {
    if (enabled) {
      execute()
    }
    setIsStale(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...dependencies])

  return {
    data,
    loading,
    error,
    refetch: execute,
    isStale,
  }
}
