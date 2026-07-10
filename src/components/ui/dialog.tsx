import * as React from "react"
import { cn } from "@/lib/utils"

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onOpenChange) {
      onOpenChange(false)
    }
  }

  React.useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const focusDialog = window.requestAnimationFrame(() => {
      const dialog = containerRef.current?.querySelector<HTMLElement>('[role="dialog"]')
      const firstFocusable = dialog?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )
      ;(firstFocusable ?? dialog)?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onOpenChange?.(false)
        return
      }
      if (event.key !== "Tab") return
      const dialog = containerRef.current?.querySelector<HTMLElement>('[role="dialog"]')
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusDialog)
      window.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [open, onOpenChange])

  if (!open) return null
  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      data-mini-no-drag
      onClick={handleBackdropClick}
    >
      <div className="relative z-10 w-full max-w-md animate-fade-in" data-mini-no-drag onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, children, role = "dialog", "aria-label": ariaLabel, ...props }, ref) => (
  <div 
    ref={ref} 
    role={role}
    aria-modal="true"
    aria-label={ariaLabel ?? "对话框"}
    tabIndex={-1}
    data-mini-no-drag
    className={cn(
      "animate-slide-up rounded-lg border border-[rgba(255,184,0,0.24)] bg-[var(--color-panel)] shadow-[var(--shadow-lg)]",
      className
    )} 
    onClick={e => e.stopPropagation()}
    {...props}
  >
    {children}
  </div>
))
DialogContent.displayName = "DialogContent"

export { Dialog, DialogContent }
