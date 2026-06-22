import { useCallback, useEffect, useState } from "react"

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((val: T) => T)) => void, () => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue
    try {
      const item = window.localStorage.getItem(key)
      return item ? (JSON.parse(item) as T) : initialValue
    } catch (error) {
      console.error(`useLocalStorage: 读取 ${key} 失败`, error)
      return initialValue
    }
  })

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      setStoredValue((prev) => {
        const valueToStore = value instanceof Function ? value(prev) : value
        try {
          window.localStorage.setItem(key, JSON.stringify(valueToStore))
        } catch (error) {
          console.error(`useLocalStorage: 写入 ${key} 失败`, error)
        }
        return valueToStore
      })
    },
    [key],
  )

  const remove = useCallback(() => {
    setStoredValue(initialValue)
    try {
      window.localStorage.removeItem(key)
    } catch (error) {
      console.error(`useLocalStorage: 删除 ${key} 失败`, error)
    }
  }, [key, initialValue])

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue) as T)
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [key])

  return [storedValue, setValue, remove]
}
