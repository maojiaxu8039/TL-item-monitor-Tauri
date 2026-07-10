import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { X } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"

interface AddSectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (name: string) => void
  loading?: boolean
}

export function AddSectionDialog({ open, onOpenChange, onConfirm, loading }: AddSectionDialogProps) {
  const [name, setName] = useState("")
  const titleId = useId()
  const inputId = useId()

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
    <Dialog open={open} onOpenChange={(nextOpen) => nextOpen ? onOpenChange(true) : handleClose()}>
      <DialogContent aria-labelledby={titleId} className="w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 id={titleId} className="text-sm font-semibold text-[var(--color-text)]">添加分组</h3>
          <button
            type="button"
            aria-label="关闭添加分组对话框"
            onClick={handleClose}
            className="p-1 rounded-lg text-[var(--color-text-subtle)] transition-colors hover:bg-[rgba(255,184,0,0.1)] hover:text-[var(--color-brand-gold)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor={inputId} className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">分组名称</label>
            <Input
              id={inputId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入分组名称"
              className="h-9 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleClose} className="text-xs h-8 px-4">
              取消
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={!name.trim() || loading} className="text-xs h-8 px-4">
              {loading ? "添加中..." : "确认添加"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
