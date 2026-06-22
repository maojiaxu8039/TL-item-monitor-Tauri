import { useCallback, useMemo, useState } from "react"

export interface UseMapReturn<K, V> {
  value: Map<K, V>
  set: (key: K, value: V) => void
  setAll: (entries: Iterable<[K, V]>) => void
  remove: (key: K) => void
  clear: () => void
  get: (key: K) => V | undefined
  has: (key: K) => boolean
  size: number
  entries: [K, V][]
  keys: K[]
  valuesList: V[]
}

export function useMap<K, V>(
  initialValue: Iterable<[K, V]> = [],
): UseMapReturn<K, V> {
  const [value, setValue] = useState<Map<K, V>>(() => new Map(initialValue))

  const set = useCallback((key: K, val: V) => {
    setValue((prev) => {
      const next = new Map(prev)
      next.set(key, val)
      return next
    })
  }, [])

  const setAll = useCallback((entries: Iterable<[K, V]>) => {
    setValue(() => new Map(entries))
  }, [])

  const remove = useCallback((key: K) => {
    setValue((prev) => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [])

  const clear = useCallback(() => setValue(new Map()), [])

  const get = useCallback((key: K) => value.get(key), [value])
  const has = useCallback((key: K) => value.has(key), [value])

  const entries = useMemo(() => Array.from(value.entries()), [value])
  const keys = useMemo(() => Array.from(value.keys()), [value])
  const valuesList = useMemo(() => Array.from(value.values()), [value])

  return {
    value,
    set,
    setAll,
    remove,
    clear,
    get,
    has,
    size: value.size,
    entries,
    keys,
    valuesList,
  }
}
