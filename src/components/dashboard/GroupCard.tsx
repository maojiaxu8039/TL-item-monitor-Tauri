import { MoreHorizontal, Trash2, ChevronDown, ChevronRight, RefreshCw } from "lucide-react"
import type { Section, SectionItem } from "@/lib/commands"
import { cmd } from "@/lib/commands"
import { motion } from "framer-motion"
import { useState, useEffect } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"

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
  const { refreshTrigger, marketContext } = useSectionRefresh()

  const { data: items = [], refetch, isFetching } = useQuery({
    queryKey: ["section-items", marketContext.seasonId, marketContext.marketMode, section.id],
    queryFn: () => cmd.getSectionItems(section.id),
  })

  useEffect(() => {
    if (refreshTrigger > 0) {
      refetch()
    }
  }, [refreshTrigger, refetch])

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
    if (confirm(`确定要从分组中删除 "${itemName}" 吗？`)) {
      removeItem.mutate({ sectionId: section.id, itemId })
    }
  }

  const totalFire = items.reduce((sum, item) => sum + item.purchase_fire_price * item.count, 0)
  const totalRmb = items.reduce((sum, item) => sum + (item.purchase_fire_price * item.count * 61.87 / 10000), 0)

  return (
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
          <span className="text-[13px] font-semibold text-slate-700">{section.name}</span>
          <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-medium text-slate-500">
            {items.length}
          </span>
          {isFetching && (
            <div className="flex items-center gap-1 text-blue-500">
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span className="text-[10px] font-medium">刷新中</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
            title="刷新分组"
          >
            <RefreshCw className={`h-4 w-4 text-slate-400 hover:text-blue-500 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => onDelete?.()}
            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
            title="删除分组"
          >
            <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
          </button>
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
                  <th className="text-center py-3 px-1 font-semibold w-[6%]">类型</th>
                  <th className="text-center py-3 px-1 font-semibold w-[7%]">数量</th>
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
                    <td className="py-3 px-1 text-center text-slate-600">{item.count}</td>
                    <td className="py-3 px-1 text-center font-bold text-red-500">{item.purchase_fire_price.toFixed(1)}火</td>
                    <td className="py-3 px-1 text-center font-semibold text-blue-600">¥{(item.purchase_fire_price * 61.87 / 10000).toFixed(2)}</td>
                    <td className="py-3 px-1 text-center text-slate-500">—</td>
                    <td className="py-3 px-1 text-center text-slate-400">{item.more_value || "—"}</td>
                    <td className="py-3 px-1 text-center text-slate-400">—</td>
                    <td className="py-3 px-1 text-center">
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-500">
                        待评估
                      </span>
                    </td>
                    <td className="py-3 px-1 text-center text-slate-400 text-[11px]">
                      {item.last_time ? new Date(Number(item.last_time) * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "—"}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => handleRemoveItem(item.item_id, item.item_name || item.item_id)}
                        disabled={removeItem.isPending}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors mx-auto"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500 transition-colors" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50/60 font-semibold border-t border-slate-100">
                  <td className="py-3 px-4 text-slate-600">总计</td>
                  <td className="py-3 px-1"></td>
                  <td className="py-3 px-1"></td>
                  <td className="py-3 px-1 text-center text-red-500 font-bold">{totalFire.toFixed(1)}火</td>
                  <td className="py-3 px-1 text-center text-blue-600 font-bold">¥{totalRmb.toFixed(2)}</td>
                  <td className="py-3 px-1 text-center text-slate-400">—</td>
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
  )
}
