import { useEffect, useCallback, useId, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Info, XCircle, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  message: string | React.ReactNode
  confirmText?: string
  cancelText?: string
  variant?: "warning" | "info" | "danger"
  onConfirm?: () => void
  onCancel?: () => void
  loading?: boolean
}

const variantConfig = {
  warning: {
    icon: AlertTriangle,
    iconClass: "text-[var(--color-brand-gold)]",
    bgClass: "border-[rgba(255,184,0,0.28)] bg-[rgba(255,184,0,0.1)]",
    borderClass: "border-[rgba(255,184,0,0.28)]",
    confirmClass: "bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-black hover:brightness-110",
  },
  info: {
    icon: Info,
    iconClass: "text-[var(--color-brand-gold)]",
    bgClass: "border-[rgba(255,184,0,0.28)] bg-[rgba(255,184,0,0.1)]",
    borderClass: "border-[rgba(255,184,0,0.28)]",
    confirmClass: "bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-black hover:brightness-110",
  },
  danger: {
    icon: XCircle,
    iconClass: "text-[var(--color-danger)]",
    bgClass: "border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.1)]",
    borderClass: "border-[rgba(239,68,68,0.32)]",
    confirmClass: "bg-[var(--color-danger)] text-black hover:brightness-110",
  },
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title = "确认操作",
  message,
  confirmText = "确认",
  cancelText = "取消",
  variant = "warning",
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  const config = variantConfig[variant]
  const Icon = config.icon
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  const handleConfirm = useCallback(() => {
    onConfirm?.()
  }, [onConfirm])

  const handleCancel = useCallback(() => {
    onOpenChange(false)
    onCancel?.()
  }, [onOpenChange, onCancel])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const focusTimer = window.requestAnimationFrame(() => cancelButtonRef.current?.focus())
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancel()
      }
      if (e.key !== "Tab" || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", handleEscape)
    return () => {
      window.cancelAnimationFrame(focusTimer)
      window.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [open, handleCancel])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
        >
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleCancel}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "relative z-50 w-full max-w-sm mx-4 rounded-lg border bg-[var(--color-panel)] p-6 shadow-[var(--shadow-lg)]",
              config.borderClass
            )}
          >
            <div className="flex items-start gap-4">
              <div className={cn("flex-shrink-0 w-12 h-12 rounded-lg border flex items-center justify-center", config.bgClass)}>
                <Icon className={cn("w-6 h-6", config.iconClass)} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 id={titleId} className="text-lg font-semibold text-[var(--color-text)] mb-2">{title}</h3>
                <div className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                  {message}
                </div>
              </div>
              <button
                type="button"
                aria-label="关闭对话框"
                onClick={handleCancel}
                className="flex-shrink-0 p-1.5 rounded-lg hover:bg-[rgba(255,184,0,0.1)] transition-colors text-[var(--color-text-subtle)] hover:text-[var(--color-brand-gold)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-[var(--color-text)] bg-[var(--color-panel-soft)] hover:bg-[rgba(255,184,0,0.1)] rounded-lg transition-colors disabled:opacity-50"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className={cn(
                  "flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50",
                  config.confirmClass
                )}
              >
                {loading ? "处理中..." : confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
