import { useEffect, useState } from "react"

function getDocumentVisible(): boolean {
  if (typeof document === "undefined") return true
  return !document.hidden
}

export function useVisiblePolling(intervalMs: number): number | false {
  const [visible, setVisible] = useState(getDocumentVisible)

  useEffect(() => {
    const handleVisibilityChange = () => setVisible(getDocumentVisible())
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [])

  return visible ? intervalMs : false
}
