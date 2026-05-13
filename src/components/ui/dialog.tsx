import * as React from "react"
import { cn } from "@/lib/utils"

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onOpenChange) {
      onOpenChange(false)
    }
  }

  if (!open) return null
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative z-10 w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, children, ...props }, ref) => (
  <div 
    ref={ref} 
    className={cn(
      "rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] shadow-[var(--shadow-lg)] animate-slide-up",
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
