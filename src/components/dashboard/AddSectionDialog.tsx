import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"

interface AddSectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (name: string) => void
  loading?: boolean
}

export function AddSectionDialog({ open, onOpenChange, onConfirm, loading }: AddSectionDialogProps) {
  const [name, setName] = useState("")

  const handleConfirm = () => {
    if (name.trim()) {
      onConfirm(name.trim())
      setName("")
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setName("")
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative z-50 w-full max-w-sm mx-4"
          >
            <div className="rounded-lg border border-[rgba(255,184,0,0.24)] bg-[var(--color-panel)] p-5 shadow-[var(--shadow-lg)]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[var(--color-text)]">添加分组</h3>
                <button
                  onClick={handleClose}
                  className="p-1 rounded-lg text-[var(--color-text-subtle)] transition-colors hover:bg-[rgba(255,184,0,0.1)] hover:text-[var(--color-brand-gold)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">分组名称</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="请输入分组名称"
                    className="h-9 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClose}
                    className="text-xs h-8 px-4"
                  >
                    取消
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleConfirm}
                    disabled={!name.trim() || loading}
                    className="text-xs h-8 px-4"
                  >
                    {loading ? "添加中..." : "确认添加"}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
