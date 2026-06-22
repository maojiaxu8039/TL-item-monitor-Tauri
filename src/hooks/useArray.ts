import { useCallback, useState } from "react"

export interface UseArrayReturn<T> {
  value: T[]
  set: (value: T[]) => void
  push: (item: T) => void
  pushMany: (items: T[]) => void
  remove: (predicate: (item: T, index: number) => boolean) => void
  removeAt: (index: number) => void
  update: (index: number, item: T) => void
  clear: () => void
  filter: (predicate: (item: T, index: number) => boolean) => void
  sort: (compareFn: (a: T, b: T) => number) => void
  contains: (item: T) => boolean
  isEmpty: boolean
  length: number
}

export function useArray<T>(initialValue: T[] = []): UseArrayReturn<T> {
  const [value, setValue] = useState<T[]>(initialValue)

  const set = useCallback((newValue: T[]) => setValue(newValue), [])
  const push = useCallback((item: T) => setValue((v) => [...v, item]), [])
  const pushMany = useCallback(
    (items: T[]) => setValue((v) => [...v, ...items]),
    [],
  )
  const remove = useCallback(
    (predicate: (item: T, index: number) => boolean) =>
      setValue((v) => v.filter((item, i) => !predicate(item, i))),
    [],
  )
  const removeAt = useCallback(
    (index: number) =>
      setValue((v) => v.filter((_, i) => i !== index)),
    [],
  )
  const update = useCallback(
    (index: number, item: T) =>
      setValue((v) => v.map((existing, i) => (i === index ? item : existing))),
    [],
  )
  const clear = useCallback(() => setValue([]), [])
  const filter = useCallback(
    (predicate: (item: T, index: number) => boolean) =>
      setValue((v) => v.filter(predicate)),
    [],
  )
  const sort = useCallback(
    (compareFn: (a: T, b: T) => number) =>
      setValue((v) => [...v].sort(compareFn)),
    [],
  )
  const contains = useCallback(
    (item: T) => value.includes(item),
    [value],
  )

  return {
    value,
    set,
    push,
    pushMany,
    remove,
    removeAt,
    update,
    clear,
    filter,
    sort,
    contains,
    isEmpty: value.length === 0,
    length: value.length,
  }
}
