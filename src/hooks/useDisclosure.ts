import { useCallback, useState } from "react"

export interface UseDisclosureReturn {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  setOpen: (value: boolean) => void
}

export function useDisclosure(initialState: boolean = false): UseDisclosureReturn {
  const [isOpen, setIsOpen] = useState(initialState)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])
  return { isOpen, open, close, toggle, setOpen: setIsOpen }
}
