import { useEffect, useCallback } from "react"
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
    iconClass: "text-amber-500",
    bgClass: "bg-amber-50",
    borderClass: "border-amber-200",
    confirmClass: "bg-amber-500 hover:bg-amber-600 text-white",
  },
  info: {
    icon: Info,
    iconClass: "text-blue-500",
    bgClass: "bg-blue-50",
    borderClass: "border-blue-200",
    confirmClass: "bg-blue-500 hover:bg-blue-600 text-white",
  },
  danger: {
    icon: XCircle,
    iconClass: "text-red-500",
    bgClass: "bg-red-50",
    borderClass: "border-red-200",
    confirmClass: "bg-red-500 hover:bg-red-600 text-white",
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

  const handleConfirm = useCallback(() => {
    onConfirm?.()
  }, [onConfirm])

  const handleCancel = useCallback(() => {
    onOpenChange(false)
    onCancel?.()
  }, [onOpenChange, onCancel])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        handleCancel()
      }
    }
    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
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
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "relative z-50 w-full max-w-sm mx-4 rounded-2xl border-2 bg-white p-6 shadow-2xl",
              config.borderClass
            )}
          >
            <div className="flex items-start gap-4">
              <div className={cn("flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center", config.bgClass)}>
                <Icon className={cn("w-6 h-6", config.iconClass)} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
                <div className="text-sm text-slate-600 leading-relaxed">
                  {message}
                </div>
              </div>
              <button
                onClick={handleCancel}
                className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                {cancelText}
              </button>
              <button
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