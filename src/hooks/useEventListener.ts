import { useEffect, useRef } from "react"

type EventName = keyof WindowEventMap

export function useEventListener<K extends EventName>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  element?: Window | HTMLElement,
): void {
  const savedHandler = useRef(handler)

  useEffect(() => {
    savedHandler.current = handler
  }, [handler])

  useEffect(() => {
    const targetElement: Window | HTMLElement = element ?? window
    const eventListener = (event: Event) => {
      savedHandler.current(event as WindowEventMap[K])
    }
    targetElement.addEventListener(eventName, eventListener)
    return () => {
      targetElement.removeEventListener(eventName, eventListener)
    }
  }, [eventName, element])
}
