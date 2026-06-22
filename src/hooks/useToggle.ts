import { useCallback, useState } from "react"

export function useToggle(
  initialValue: boolean = false,
): [boolean, () => void, (value: boolean) => void] {
  const [value, setValue] = useState(initialValue)
  const toggle = useCallback(() => setValue((v) => !v), [])
  const setExplicit = useCallback((v: boolean) => setValue(v), [])
  return [value, toggle, setExplicit]
}
