import { useEffect, useRef, useState } from "react"

export interface UseHoverReturn {
  hovered: boolean
  ref: React.RefObject<HTMLElement>
}

export function useHover<T extends HTMLElement = HTMLElement>(): UseHoverReturn {
  const [hovered, setHovered] = useState(false)
  const ref = useRef<T>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const handleMouseEnter = () => setHovered(true)
    const handleMouseLeave = () => setHovered(false)

    node.addEventListener("mouseenter", handleMouseEnter)
    node.addEventListener("mouseleave", handleMouseLeave)
    return () => {
      node.removeEventListener("mouseenter", handleMouseEnter)
      node.removeEventListener("mouseleave", handleMouseLeave)
    }
  }, [])

  return { hovered, ref: ref as React.RefObject<HTMLElement> }
}
