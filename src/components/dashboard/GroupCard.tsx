import { Trash2, ChevronDown, ChevronRight, RefreshCw, Check, X, GripVertical } from "lucide-react"
import type { Section, SectionItem } from "@/lib/commands"
import { cmd } from "@/lib/commands"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DangerButton } from "@/components/ui/danger-button"
import { motion } from "framer-motion"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"
import type { DashboardSummary } from "@/lib/commands"

interface GroupCardProps {
  section: Section
  index?: number
  onDelete?: () => void
  onRefetch?: () => void
  isDragging?: boolean
  dragHandleProps?: any
}

export function GroupCard({ section, index = 0, onDelete, onRefetch, isDragging = false, dragHandleProps }: GroupCardProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(section.name)
  const [displayName, setDisplayName] = useState(section.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const { refreshTrigger, marketContext } = useSectionRefresh()
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string } | null>(null)

  const { data: items = [], refetch, isFetching } = useQuery({
    queryKey: ["section-items", marketContext.seasonId, marketContext.marketMode, section.id],
    queryFn: () => cmd.getSectionItems(section.id),
  })

  const { data: dashboardSummary } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary", marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getDashboardSummary(),
    staleTime: 5 * 60 * 1000,
  })

  const rmbPer10kFire = dashboardSummary?.fire?.rmb_per_10k_fire ?? 61.87

  useEffect(() => {
    if (refreshTrigger > 0) {
      refetch()
    }
  }, [refreshTrigger, refetch])

  const updateSectionMutation = useMutation({
    mutationFn: (name: string) => cmd.updateSection(section.id, name),
    onSuccess: (_, name) => {
      setDisplayName(name)
      onRefetch?.()
      toast.success("分组名称已更新")
    },
    onError: () => toast.error("更新失败"),
  })

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, updates }: { itemId: string; updates: Record<string, number> }) => {
      return cmd.updateSectionItem(section.id, itemId, updates)
    },
    onSuccess: () => {
      refetch()
    },
    onError: () => toast.error("更新失败"),
  })

  const removeItem = useMutation({
    mutationFn: ({ sectionId, itemId }: { sectionId: string; itemId: string }) =>
      cmd.removeSectionItem(sectionId, itemId),
    onSuccess: () => {
      refetch()
      toast.success("物品已删除")
    },
    onError: () => toast.error("删除失败"),
  })

  const handleRemoveItem = useCallback((itemId: string, itemName: string) => {
    setItemToDelete({ id: itemId, name: itemName })
    setDeleteDialogOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (itemToDelete) {
      removeItem.mutate({ sectionId: section.id, itemId: itemToDelete.id })
    }
    setDeleteDialogOpen(false)
    setItemToDelete(null)
  }, [itemToDelete, removeItem, section.id])

  const handleStartEdit = useCallback(() => {
    setEditName(displayName)
    setIsEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }, [displayName])

  const handleSaveEdit = useCallback(() => {
    const trimmedName = editName.trim()
    if (trimmedName && trimmedName !== displayName) {
      updateSectionMutation.mutate(trimmedName)
    }
    setIsEditing(false)
  }, [editName, displayName, updateSectionMutation])

  const handleCancelEdit = useCallback(() => {
    setEditName(displayName)
    setIsEditing(false)
  }, [displayName])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit()
    } else if (e.key === "Escape") {
      handleCancelEdit()
    }
  }, [handleSaveEdit, handleCancelEdit])

  const calculateMorePerFire = useCallback((item: SectionItem) => {
    const moreValue = item.more_value ?? 0
    const currentPrice = item.current_price ?? 0
    if (currentPrice === 0 || moreValue === 0) return 0
    return (moreValue / currentPrice) * 10
  }, [])

  const getItemEvaluation = useCallback((item: SectionItem) => {
    const purchaseFirePrice = item.purchase_fire_price ?? 0
    const currentPrice = item.current_price ?? 0
    
    if (purchaseFirePrice === 0) {
      return { text: "待评估", className: "border-[rgba(255,184,0,0.28)] bg-[rgba(255,184,0,0.1)] text-[var(--color-brand-gold)]" }
    }
    if (currentPrice < purchaseFirePrice) {
      return { text: "值的", className: "border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.1)] text-[var(--color-success)]" }
    }
    return { text: "不值的", className: "border-[var(--color-border)] bg-[var(--color-panel-soft)] text-[var(--color-text-muted)]" }
  }, [])

  const { totalFire, totalRmb } = useMemo(() => {
    return items.reduce((acc, item) => {
      const price = item.current_price ?? 0
      const itemTotal = price * item.count
      return {
        totalFire: acc.totalFire + itemTotal,
        totalRmb: acc.totalRmb + itemTotal * rmbPer10kFire / 10000,
      }
    }, { totalFire: 0, totalRmb: 0 })
  }, [items, rmbPer10kFire])

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.35, delay: 0.15 + index * 0.08 }}
        className={`overflow-hidden rounded-lg border bg-[var(--color-panel)] shadow-[var(--shadow-sm)] transition-all hover:border-[rgba(255,184,0,0.34)] hover:shadow-[var(--shadow-glow)] ${isDragging ? "border-[var(--color-brand-gold)] shadow-[var(--shadow-glow)]" : "border-[rgba(255,184,0,0.14)]"}`}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] bg-[rgba(255,184,0,0.035)] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            {dragHandleProps && (
              <div
                {...dragHandleProps}
                className="mr-1 cursor-grab rounded-md p-0.5 text-[var(--color-text-subtle)] transition-colors hover:text-[var(--color-brand-gold)] active:cursor-grabbing"
                style={{ touchAction: "none" }}
                title="拖动排序"
              >
                <GripVertical className="h-4 w-4" />
              </div>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-[var(--color-text-subtle)] transition-colors hover:bg-[rgba(255,184,0,0.08)] hover:text-[var(--color-brand-gold)]"
              title={collapsed ? "展开分组" : "收起分组"}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {isEditing ? (
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleSaveEdit}
                  onKeyDown={handleKeyDown}
                  className="h-7 w-36 rounded-md border border-[var(--color-brand)] bg-[rgba(13,15,18,0.9)] px-2 text-[13px] font-semibold text-[var(--color-text)] outline-none"
                  autoFocus
                />
                <button
                  onClick={handleSaveEdit}
                  className="rounded p-1 text-[var(--color-success)] transition-colors hover:bg-[rgba(34,197,94,0.12)]"
                  disabled={updateSectionMutation.isPending}
                  title="保存"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="rounded p-1 text-[var(--color-danger)] transition-colors hover:bg-[rgba(239,68,68,0.12)]"
                  title="取消"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <span
                onClick={handleStartEdit}
                className="cursor-pointer text-[13px] font-semibold text-[var(--color-text)] transition-colors hover:text-[var(--color-brand-gold)]"
                title="点击修改名称"
              >
                {displayName}
              </span>
            )}
            <span className="rounded-full border border-[rgba(255,184,0,0.18)] bg-[rgba(255,184,0,0.08)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
              {items.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={async () => {
                await refetch()
                toast.success(`${section.name} 已刷新`, { position: 'bottom-right' })
              }}
              className="rounded-lg p-1.5 text-[var(--color-text-subtle)] transition-colors hover:bg-[rgba(255,184,0,0.08)] hover:text-[var(--color-brand-gold)]"
              title="刷新分组"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
            <DangerButton
              onClick={() => onDelete?.()}
              title="删除分组"
            >
              <Trash2 className="h-4 w-4" />
            </DangerButton>
          </div>
        </div>

        {!collapsed && (
          <div className="overflow-x-auto">
            {items.length === 0 && !isFetching && (
              <div className="py-8 text-center text-[13px] text-[var(--color-text-subtle)]">
                暂无物品，点击上方搜索框添加
              </div>
            )}
            {items.length > 0 && (
              <table className="w-full min-w-[980px] text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--color-border-soft)] bg-[rgba(255,255,255,0.025)] text-[var(--color-text-muted)]">
                    <th className="text-left py-3 px-4 font-semibold w-[14%]">物品名称</th>
                    <th className="text-center py-3 px-1 font-semibold w-[8%]">类型</th>
                    <th className="text-center py-3 px-1 font-semibold w-[10%]">当前火价</th>
                    <th className="text-center py-3 px-1 font-semibold w-[10%]">RMB价格</th>
                    <th className="text-center py-3 px-1 font-semibold w-[10%]">购买火价</th>
                    <th className="text-center py-3 px-1 font-semibold w-[10%]">伤害(MORE)</th>
                    <th className="text-center py-3 px-1 font-semibold w-[9%]">10MORE/火</th>
                    <th className="text-center py-3 px-1 font-semibold w-[7%]">评估</th>
                    <th className="text-center py-3 px-1 font-semibold w-[10%]">更新时间</th>
                    <th className="text-center py-3 px-3 font-semibold w-[5%]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-[var(--color-border-soft)] transition-colors hover:bg-[rgba(255,184,0,0.045)]"
                    >
                      <td className="py-3 px-4 font-medium text-[var(--color-text)]">{item.item_name || item.item_id}</td>
                      <td className="py-3 px-1 text-center text-[var(--color-text-subtle)]">{item.item_type || "—"}</td>
                      <td className="py-3 px-1 text-center font-bold text-[var(--color-danger)]">{item.current_price?.toFixed(1) || "—"}火</td>
                      <td className="py-3 px-1 text-center font-semibold text-[var(--color-brand-gold)]">¥{((item.current_price ?? 0) * rmbPer10kFire / 10000).toFixed(2)}</td>
                      <td className="py-3 px-1">
                        <input
                          type="number"
                          defaultValue={item.purchase_fire_price || undefined}
                          placeholder="—"
                          onBlur={(e) => {
                            const value = e.target.value
                            if (value) {
                              const num = parseFloat(value)
                              if (!isNaN(num)) {
                                updateItemMutation.mutate({ itemId: item.item_id, updates: { purchaseFirePrice: num } })
                              }
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const target = e.currentTarget as HTMLInputElement
                              const value = target.value
                              if (value) {
                                const num = parseFloat(value)
                                if (!isNaN(num)) {
                                  updateItemMutation.mutate({ itemId: item.item_id, updates: { purchaseFirePrice: num } })
                                }
                              }
                            }
                          }}
                          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-[var(--color-text-muted)] outline-none transition-colors hover:border-[var(--color-border)] focus:border-[var(--color-brand)] focus:bg-[rgba(13,15,18,0.72)]"
                        />
                      </td>
                      <td className="py-3 px-1">
                        <input
                          type="number"
                          defaultValue={item.more_value || undefined}
                          placeholder="—"
                          onBlur={(e) => {
                            const value = e.target.value
                            if (value) {
                              const num = parseFloat(value)
                              if (!isNaN(num)) {
                                updateItemMutation.mutate({ itemId: item.item_id, updates: { moreValue: num } })
                              }
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const target = e.currentTarget as HTMLInputElement
                              const value = target.value
                              if (value) {
                                const num = parseFloat(value)
                                if (!isNaN(num)) {
                                  updateItemMutation.mutate({ itemId: item.item_id, updates: { moreValue: num } })
                                }
                              }
                            }
                          }}
                          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-[var(--color-text-muted)] outline-none transition-colors hover:border-[var(--color-border)] focus:border-[var(--color-brand)] focus:bg-[rgba(13,15,18,0.72)]"
                        />
                      </td>
                      <td className="py-3 px-1 text-center font-medium text-[var(--color-success)]">
                        {calculateMorePerFire(item).toFixed(2)}
                      </td>
                      <td className="py-3 px-1 text-center">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getItemEvaluation(item).className}`}>
                          {getItemEvaluation(item).text}
                        </span>
                      </td>
                      <td className="py-3 px-1 text-center text-[11px] text-[var(--color-text-subtle)]">
                        {item.last_time ? new Date(Number(item.last_time) * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "—"}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <DangerButton
                          onClick={() => handleRemoveItem(item.item_id, item.item_name || item.item_id)}
                          disabled={removeItem.isPending}
                          size="sm"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </DangerButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[rgba(255,184,0,0.2)] bg-[rgba(255,184,0,0.045)] font-semibold">
                    <td className="py-3 px-4 text-[var(--color-text)]" colSpan={2}>总计</td>
                    <td className="py-3 px-1 text-center text-[var(--color-danger)] font-bold">{totalFire.toFixed(1)}火</td>
                    <td className="py-3 px-1 text-center font-bold text-[var(--color-brand-gold)]">¥{totalRmb.toFixed(2)}</td>
                    <td className="py-3 px-1 text-center text-[var(--color-text-subtle)]" colSpan={6}>—</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </motion.div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="删除物品"
        message={`确定要从分组中删除 "${itemToDelete?.name}" 吗？`}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={handleConfirmDelete}
        loading={removeItem.isPending}
      />
    </>
  )
}
