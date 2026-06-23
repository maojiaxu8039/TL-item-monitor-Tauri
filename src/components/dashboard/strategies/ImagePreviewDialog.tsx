import { useCallback, useEffect, useRef, useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { X, ZoomIn, ZoomOut, RotateCcw, Maximize2, Move } from "lucide-react"

interface ImagePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageUrl: string
  alt?: string
  title?: string
}

const MIN_SCALE = 0.2
const MAX_SCALE = 8
const SCALE_STEP = 0.25

export function ImagePreviewDialog({
  open,
  onOpenChange,
  imageUrl,
  alt,
  title,
}: ImagePreviewDialogProps) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setScale(1)
      setOffset({ x: 0, y: 0 })
      setIsDragging(false)
      dragStartRef.current = null
    }
  }, [open])

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))
  }, [])

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))
  }, [])

  const handleReset = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const handleFit = useCallback(() => {
    const container = containerRef.current
    const img = container?.querySelector("img")
    if (!container || !img) return
    const cw = container.clientWidth
    const ch = container.clientHeight
    const iw = img.naturalWidth || img.clientWidth
    const ih = img.naturalHeight || img.clientHeight
    if (!iw || !ih) return
    const fitScale = Math.min(cw / iw, ch / ih, 1)
    setScale(fitScale)
    setOffset({ x: 0, y: 0 })
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 1) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, +(s + delta).toFixed(2))))
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (scale <= 1) return
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)
      setIsDragging(true)
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        ox: offset.x,
        oy: offset.y,
      }
    },
    [scale, offset],
  )

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setOffset({
      x: dragStartRef.current.ox + dx,
      y: dragStartRef.current.oy + dy,
    })
  }, [isDragging])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false)
    dragStartRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }, [])

  const handleDoubleClick = useCallback(() => {
    if (scale > 1.05) {
      handleReset()
    } else {
      setScale(2)
      setOffset({ x: 0, y: 0 })
    }
  }, [scale, handleReset])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") {
        handleZoomIn()
      } else if (e.key === "-") {
        handleZoomOut()
      } else if (e.key === "0") {
        handleReset()
      } else if (e.key === "f" || e.key === "F") {
        handleFit()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, handleZoomIn, handleZoomOut, handleReset, handleFit])

  const cursor = isDragging
    ? "cursor-grabbing"
    : scale > 1
      ? "cursor-grab"
      : "cursor-zoom-in"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-full p-0 overflow-hidden bg-black/90 border-[var(--color-border-soft)]">
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
          <div className="flex items-center gap-2 text-white">
            <span className="text-sm font-medium truncate max-w-[40vw]">
              {title ?? alt ?? "图片预览"}
            </span>
            <span className="text-xs text-white/50 tabular-nums">
              {Math.round(scale * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={handleZoomOut}
              disabled={scale <= MIN_SCALE}
              title="缩小 (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={handleZoomIn}
              disabled={scale >= MAX_SCALE}
              title="放大 (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={handleFit}
              title="适应窗口 (F)"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={handleReset}
              title="重置 (0)"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={() => onOpenChange(false)}
              title="关闭 (Esc)"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div
          ref={containerRef}
          className={`relative flex-1 overflow-hidden flex items-center justify-center select-none ${cursor}`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        >
          <img
            src={imageUrl}
            alt={alt ?? ""}
            draggable={false}
            className="max-w-none transition-transform"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transitionDuration: isDragging ? "0ms" : "120ms",
            }}
          />

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs pointer-events-none">
            <Move className="w-3 h-3" />
            <span>滚轮缩放 · 拖拽移动 · 双击切换</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}