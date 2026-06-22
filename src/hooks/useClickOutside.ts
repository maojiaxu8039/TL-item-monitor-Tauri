import { useEffect, useRef } from "react"

export function useClickOutside<T extends HTMLElement>(
  handler: () => void,
  enabled: boolean = true,
): React.MutableRefObject<T | null> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    if (!enabled) return

    const listener = (event: MouseEvent | TouchEvent) => {
      const el = ref.current
      if (!el || el.contains(event.target as Node)) return
      handler()
    }

    document.addEventListener("mousedown", listener)
    document.addEventListener("touchstart", listener)
    return () => {
      document.removeEventListener("mousedown", listener)
      document.removeEventListener("touchstart", listener)
    }
  }, [handler, enabled])

  return ref
}
