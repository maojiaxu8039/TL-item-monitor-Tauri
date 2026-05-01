import { MoreHorizontal, Trash2, ChevronDown, ChevronRight, RefreshCw, Check, X } from "lucide-react"
import type { Section, SectionItem } from "@/lib/commands"
import { cmd } from "@/lib/commands"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DangerButton } from "@/components/ui/danger-button"
import { motion } from "framer-motion"
import { useState, useEffect, useRef } from "react"
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

  const handleRemoveItem = (itemId: string, itemName: string) => {
    setItemToDelete({ id: itemId, name: itemName })
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = () => {
    if (itemToDelete) {
      removeItem.mutate({ sectionId: section.id, itemId: itemToDelete.id })
    }
    setDeleteDialogOpen(false)
    setItemToDelete(null)
  }

  const handleStartEdit = () => {
    setEditName(displayName)
    setIsEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const handleSaveEdit = () => {
    const trimmedName = editName.trim()
    if (trimmedName && trimmedName !== displayName) {
      updateSectionMutation.mutate(trimmedName)
    }
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditName(displayName)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit()
    } else if (e.key === "Escape") {
      handleCancelEdit()
    }
  }

  const localEditsRef = useRef<Record<string, Record<string, string>>>({})

  const handleItemFieldBlur = (itemId: string, field: string) => {
    const value = localEditsRef.current[itemId]?.[field]
    if (localEditsRef.current[itemId]) {
      delete localEditsRef.current[itemId][field]
    }
    if (value !== undefined && value !== "") {
      const num = parseFloat(value)
      if (!isNaN(num)) {
        updateItemMutation.mutate({ itemId, updates: { [field]: num } })
      }
    }
  }

  const handleItemFieldKeyDown = (e: React.KeyboardEvent, itemId: string, field: string) => {
    if (e.key === "Enter") {
      handleItemFieldBlur(itemId, field)
    }
  }

  const calculateMorePerFire = (item: SectionItem) => {
    const moreValue = item.more_value ?? 0
    const currentPrice = item.current_price ?? 0
    if (currentPrice === 0 || moreValue === 0) return 0
    return (moreValue / currentPrice) * 10
  }

  const getItemEvaluation = (item: SectionItem) => {
    const purchaseFirePrice = item.purchase_fire_price ?? 0
    const currentPrice = item.current_price ?? 0
    
    if (purchaseFirePrice === 0) {
      return { text: "待评估", className: "bg-red-50 text-red-500" }
    }
    if (currentPrice < purchaseFirePrice) {
      return { text: "值的", className: "bg-green-50 text-green-600" }
    }
    return { text: "不值的", className: "bg-slate-100 text-slate-500" }
  }

  const totalFire = items.reduce((sum, item) => sum + (item.current_price ?? 0) * item.count, 0)
  const totalRmb = items.reduce((sum, item) => sum + (item.current_price ?? 0) * item.count * rmbPer10kFire / 10000, 0)

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.35, delay: 0.15 + index * 0.08 }}
        className={`rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-slate-100 overflow-hidden hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-shadow ${isDragging ? "shadow-lg" : ""}`}
      >
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50/60 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            {dragHandleProps && (
              <div
                {...dragHandleProps}
                className="cursor-grab active:cursor-grabbing mr-1"
                style={{ touchAction: "none" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-slate-400 hover:text-slate-600">
                  <circle cx="9" cy="5" r="1.5" />
                  <circle cx="15" cy="5" r="1.5" />
                  <circle cx="9" cy="12" r="1.5" />
                  <circle cx="15" cy="12" r="1.5" />
                  <circle cx="9" cy="19" r="1.5" />
                  <circle cx="15" cy="19" r="1.5" />
                </svg>
              </div>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center gap-1.5 hover:bg-slate-100 rounded-lg px-1.5 py-0.5 transition-colors"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" />
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
                  className="h-6 px-2 text-[13px] font-semibold text-slate-700 bg-white border border-blue-400 rounded-md outline-none w-32"
                  autoFocus
                />
                <button
                  onClick={handleSaveEdit}
                  className="p-1 rounded hover:bg-green-50 transition-colors"
                  disabled={updateSectionMutation.isPending}
                >
                  <Check className="h-3.5 w-3.5 text-green-500" />
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="p-1 rounded hover:bg-red-50 transition-colors"
                >
                  <X className="h-3.5 w-3.5 text-red-400" />
                </button>
              </div>
            ) : (
              <span
                onClick={handleStartEdit}
                className="text-[13px] font-semibold text-slate-700 hover:text-blue-500 cursor-pointer transition-colors"
                title="点击修改名称"
              >
                {displayName}
              </span>
            )}
            <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              {items.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={async () => {
                await refetch()
                toast.success(`${section.name} 已刷新`, { position: 'bottom-right' })
              }}
              className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
              title="刷新分组"
            >
              <RefreshCw className={`h-4 w-4 text-slate-400 hover:text-blue-500 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
            <DangerButton
              onClick={() => onDelete?.()}
              title="删除分组"
            >
              <Trash2 className="h-4 w-4" />
            </DangerButton>
            <button className="p-1.5 rounded-lg hover:bg-slate-200/50 transition-colors">
              <MoreHorizontal className="h-4 w-4 text-slate-400" />
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="overflow-x-auto">
            {items.length === 0 && !isFetching && (
              <div className="text-center py-8 text-slate-400 text-[13px]">
                暂无物品，点击上方搜索框添加
              </div>
            )}
            {items.length > 0 && (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-100 bg-slate-50/30">
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
                      className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors"
                    >
                      <td className="py-3 px-4 text-slate-700 font-medium">{item.item_name || item.item_id}</td>
                      <td className="py-3 px-1 text-center text-slate-400">{item.item_type || "—"}</td>
                      <td className="py-3 px-1 text-center font-bold text-red-500">{item.current_price?.toFixed(1) || "—"}火</td>
                      <td className="py-3 px-1 text-center font-semibold text-blue-600">¥{((item.current_price ?? 0) * rmbPer10kFire / 10000).toFixed(2)}</td>
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
                          className="w-full text-center text-slate-500 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-400 rounded px-1 py-0.5 outline-none transition-colors"
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
                          className="w-full text-center text-slate-400 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-400 rounded px-1 py-0.5 outline-none transition-colors"
                        />
                      </td>
                      <td className="py-3 px-1 text-center text-green-600 font-medium">
                        {calculateMorePerFire(item).toFixed(2)}
                      </td>
                      <td className="py-3 px-1 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${getItemEvaluation(item).className}`}>
                          {getItemEvaluation(item).text}
                        </span>
                      </td>
                      <td className="py-3 px-1 text-center text-slate-400 text-[11px]">
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
                  <tr className="bg-slate-50/60 font-semibold border-t border-slate-100">
                    <td className="py-3 px-4 text-slate-600">总计</td>
                    <td className="py-3 px-1"></td>
                    <td className="py-3 px-1 text-center text-red-500 font-bold">{totalFire.toFixed(1)}火</td>
                    <td className="py-3 px-1 text-center text-blue-600 font-bold">¥{totalRmb.toFixed(2)}</td>
                    <td className="py-3 px-1 text-center text-slate-400">—</td>
                    <td className="py-3 px-1 text-center text-slate-400">—</td>
                    <td className="py-3 px-1 text-center text-slate-400">—</td>
                    <td className="py-3 px-1 text-center text-slate-400">—</td>
                    <td className="py-3 px-3"></td>
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