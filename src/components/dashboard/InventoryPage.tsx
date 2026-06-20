import { useState, useEffect } from "react"
import { cmd, type InventoryPositionView, type InventoryBuyWatchView, type CreatePositionRequest, type CreateBuyWatchRequest, type UpdatePositionRequest, type UpdateBuyWatchRequest } from "@/lib/commands"

interface ItemSuggestion {
  item_id: string
  item_name: string
}
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { errorMessage } from "@/lib/utils"
import { RefreshCw, Plus, TrendingUp, DollarSign, Check, X, ShoppingCart, Pencil } from "lucide-react"
import { PageShell } from "@/components/ui/PageShell"
import { PageHeader } from "@/components/ui/PageHeader"
import { Surface } from "@/components/ui/Surface"
import { Button } from "@/components/ui/button"
import { queryKeys } from "@/lib/queryKeys"

type Tab = "positions" | "buy-watches"

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "—"
  return price.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
}

function getSignalColor(signal: string): string {
  switch (signal) {
    case "profitable": return "text-[var(--color-success)]"
    case "break_even": return "text-[var(--color-brand-gold)]"
    case "loss": return "text-[var(--color-danger)]"
    default: return "text-[var(--color-text-subtle)]"
  }
}

function getSignalLabel(signal: string): string {
  switch (signal) {
    case "profitable": return "可盈利"
    case "break_even": return "可保本"
    case "loss": return "深亏"
    case "no_price": return "无价格"
    default: return signal
  }
}

function getBuySignalLabel(signal: string): string {
  switch (signal) {
    case "buy_ready": return "可买入"
    case "waiting": return "等待降价"
    case "no_price": return "无价格"
    case "disabled": return "已关闭"
    default: return signal
  }
}

export default function InventoryPage() {
  const { marketContext } = useSectionRefresh()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>("positions")
  const [showAddPosition, setShowAddPosition] = useState(false)
  const [showAddWatch, setShowAddWatch] = useState(false)
  const [editingPosition, setEditingPosition] = useState<InventoryPositionView | null>(null)
  const [editingWatch, setEditingWatch] = useState<InventoryBuyWatchView | null>(null)

  const seasonId = marketContext.seasonId
  const marketMode = marketContext.marketMode

  const positionsQuery = useQuery({
    queryKey: queryKeys.inventory.positions(seasonId, marketMode),
    queryFn: () => cmd.listInventoryPositions(seasonId, marketMode),
    enabled: !!seasonId,
    refetchInterval: 15000,
  })

  const watchesQuery = useQuery({
    queryKey: queryKeys.inventory.buyWatches(seasonId, marketMode),
    queryFn: () => cmd.listInventoryBuyWatches(seasonId, marketMode),
    enabled: !!seasonId,
    refetchInterval: 15000,
  })

  const summaryQuery = useQuery({
    queryKey: queryKeys.inventory.summary(seasonId, marketMode),
    queryFn: () => cmd.getInventorySummary(seasonId, marketMode),
    enabled: !!seasonId,
    refetchInterval: 15000,
  })

  const markSoldMutation = useMutation({
    mutationFn: ({ id, soldPrice }: { id: string; soldPrice: number }) =>
      cmd.markInventorySold(id, soldPrice),
    onSuccess: () => {
      toast.success("已标记为已出货")
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.positions(seasonId, marketMode) })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.summary(seasonId, marketMode) })
    },
    onError: (error) => toast.error(`标记失败: ${errorMessage(error)}`),
  })

  const markIgnoredMutation = useMutation({
    mutationFn: (id: string) => cmd.markInventoryIgnored(id),
    onSuccess: () => {
      toast.success("已标记为已忽略")
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.positions(seasonId, marketMode) })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.summary(seasonId, marketMode) })
    },
    onError: (error) => toast.error(`标记失败: ${errorMessage(error)}`),
  })

  const deletePositionMutation = useMutation({
    mutationFn: (id: string) => cmd.deleteInventoryPosition(id),
    onSuccess: () => {
      toast.success("持仓记录已删除")
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.positions(seasonId, marketMode) })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.summary(seasonId, marketMode) })
    },
    onError: (error) => toast.error(`删除失败: ${errorMessage(error)}`),
  })

  const deleteWatchMutation = useMutation({
    mutationFn: (id: string) => cmd.deleteInventoryBuyWatch(id),
    onSuccess: () => {
      toast.success("买入监控已删除")
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.buyWatches(seasonId, marketMode) })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.summary(seasonId, marketMode) })
    },
    onError: (error) => toast.error(`删除失败: ${errorMessage(error)}`),
  })

  const summary = summaryQuery.data
  const positions = positionsQuery.data || []
  const watches = watchesQuery.data || []

  return (
    <PageShell size="lg" className="space-y-5">
      <PageHeader
        title="囤货出货"
        description="管理持仓记录和买入监控，跟踪盈亏情况"
        iconAsset="deals"
      />

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Surface padding="md" className="bg-[var(--color-panel-soft)]">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-[var(--color-text-subtle)]" />
              <span className="text-xs text-[var(--color-text-subtle)]">持仓成本</span>
            </div>
            <div className="text-lg font-semibold text-[var(--color-text)]">
              {formatPrice(summary.total_cost)}
            </div>
          </Surface>

          <Surface padding="md" className="bg-[var(--color-panel-soft)]">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-[var(--color-text-subtle)]" />
              <span className="text-xs text-[var(--color-text-subtle)]">当前估值</span>
            </div>
            <div className="text-lg font-semibold text-[var(--color-text)]">
              {formatPrice(summary.current_value)}
            </div>
            <div className={`text-sm ${summary.profit >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
              {summary.profit >= 0 ? "+" : ""}{formatPrice(summary.profit)}
            </div>
          </Surface>

          <Surface padding="md" className="bg-[var(--color-panel-soft)]">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-[var(--color-success)]" />
              <span className="text-xs text-[var(--color-text-subtle)]">可出货</span>
            </div>
            <div className="text-lg font-semibold text-[var(--color-success)]">
              {summary.sell_ready_count}
            </div>
            <div className="text-xs text-[var(--color-text-subtle)]">
              {summary.holding_count} 持仓中
            </div>
          </Surface>

          <Surface padding="md" className="bg-[var(--color-panel-soft)]">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className="w-4 h-4 text-[var(--color-brand-gold)]" />
              <span className="text-xs text-[var(--color-text-subtle)]">可买入</span>
            </div>
            <div className="text-lg font-semibold text-[var(--color-brand-gold)]">
              {summary.buy_ready_count}
            </div>
            <div className="text-xs text-[var(--color-danger)]">
              {summary.loss_risk_count} 亏损风险
            </div>
          </Surface>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--color-border)]">
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "positions"
              ? "text-[var(--color-brand)] border-b-2 border-[var(--color-brand)]"
              : "text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
          }`}
          onClick={() => setActiveTab("positions")}
        >
          持仓记录 ({positions.length})
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "buy-watches"
              ? "text-[var(--color-brand)] border-b-2 border-[var(--color-brand)]"
              : "text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
          }`}
          onClick={() => setActiveTab("buy-watches")}
        >
          买入监控 ({watches.length})
        </button>
      </div>

      {/* Positions Tab */}
      {activeTab === "positions" && (
        <Surface padding="md">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-[var(--color-text-subtle)]">
              拍卖手续费 12.5%，保本价 = 买入价 ÷ 0.875
            </div>
            <Button size="sm" onClick={() => setShowAddPosition(true)}>
              <Plus className="w-4 h-4 mr-1" />
              添加持仓
            </Button>
          </div>

          {positionsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin text-[var(--color-text-subtle)]" />
            </div>
          ) : positions.length === 0 ? (
            <div className="text-center py-8 text-[var(--color-text-subtle)]">
              暂无持仓记录
            </div>
          ) : (
            <div className="space-y-2">
              {positions.map((view) => (
                <PositionCard
                  key={view.position.id}
                  view={view}
                  onMarkSold={() => {
                    const price = view.current_price || view.break_even_price
                    markSoldMutation.mutate({ id: view.position.id, soldPrice: price })
                  }}
                  onMarkIgnored={() => markIgnoredMutation.mutate(view.position.id)}
                  onDelete={() => deletePositionMutation.mutate(view.position.id)}
                  onEdit={() => setEditingPosition(view)}
                />
              ))}
            </div>
          )}
        </Surface>
      )}

      {/* Buy Watches Tab */}
      {activeTab === "buy-watches" && (
        <Surface padding="md">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-[var(--color-text-subtle)]">
              当前价低于目标买入价时触发提醒
            </div>
            <Button size="sm" onClick={() => setShowAddWatch(true)}>
              <Plus className="w-4 h-4 mr-1" />
              添加监控
            </Button>
          </div>

          {watchesQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin text-[var(--color-text-subtle)]" />
            </div>
          ) : watches.length === 0 ? (
            <div className="text-center py-8 text-[var(--color-text-subtle)]">
              暂无买入监控
            </div>
          ) : (
            <div className="space-y-2">
              {watches.map((view) => (
                <WatchCard
                  key={view.watch.id}
                  view={view}
                  onDelete={() => deleteWatchMutation.mutate(view.watch.id)}
                  onEdit={() => setEditingWatch(view)}
                />
              ))}
            </div>
          )}
        </Surface>
      )}

      {/* Add Position Dialog */}
      {showAddPosition && (
        <AddPositionDialog
          seasonId={seasonId}
          marketMode={marketMode}
          onClose={() => setShowAddPosition(false)}
          onSuccess={() => {
            setShowAddPosition(false)
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.positions(seasonId, marketMode) })
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.summary(seasonId, marketMode) })
          }}
        />
      )}

      {/* Add Watch Dialog */}
      {showAddWatch && (
        <AddWatchDialog
          seasonId={seasonId}
          marketMode={marketMode}
          onClose={() => setShowAddWatch(false)}
          onSuccess={() => {
            setShowAddWatch(false)
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.buyWatches(seasonId, marketMode) })
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.summary(seasonId, marketMode) })
          }}
        />
      )}

      {/* Edit Position Dialog */}
      {editingPosition && (
        <EditPositionDialog
          position={editingPosition}
          onClose={() => setEditingPosition(null)}
          onSuccess={() => {
            setEditingPosition(null)
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.positions(seasonId, marketMode) })
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.summary(seasonId, marketMode) })
          }}
        />
      )}

      {/* Edit Watch Dialog */}
      {editingWatch && (
        <EditWatchDialog
          watch={editingWatch}
          onClose={() => setEditingWatch(null)}
          onSuccess={() => {
            setEditingWatch(null)
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.buyWatches(seasonId, marketMode) })
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.summary(seasonId, marketMode) })
          }}
        />
      )}
    </PageShell>
  )
}

function PositionCard({
  view,
  onMarkSold,
  onMarkIgnored,
  onDelete,
  onEdit,
}: {
  view: InventoryPositionView
  onMarkSold: () => void
  onMarkIgnored: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  const { position, current_price, break_even_price, profit, profit_ratio, sell_signal } = view

  return (
    <div className="flex items-center justify-between p-3 bg-[var(--color-panel)] rounded-lg border border-[var(--color-border-soft)]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-[var(--color-text)] truncate">{position.item_name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${sell_signal === "profitable" ? "bg-[var(--color-success)]/20 text-[var(--color-success)]" : sell_signal === "break_even" ? "bg-[var(--color-brand-gold)]/20 text-[var(--color-brand-gold)]" : sell_signal === "loss" ? "bg-[var(--color-danger)]/20 text-[var(--color-danger)]" : "bg-[var(--color-text-subtle)]/20 text-[var(--color-text-subtle)]"}`}>
            {getSignalLabel(sell_signal)}
          </span>
        </div>
        <div className="flex gap-4 text-xs text-[var(--color-text-subtle)]">
          <span>买入 {formatPrice(position.buy_price)} × {position.quantity}</span>
          <span>保本 {formatPrice(break_even_price)}</span>
          {current_price && <span>现价 {formatPrice(current_price)}</span>}
        </div>
      </div>

      <div className="flex items-center gap-4 ml-4">
        <div className="text-right">
          <div className={`font-medium ${profit && profit >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
            {profit !== null ? `${profit >= 0 ? "+" : ""}${formatPrice(profit)}` : "—"}
          </div>
          <div className={`text-xs ${getSignalColor(sell_signal)}`}>
            {formatPercent(profit_ratio)}
          </div>
        </div>

        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title="编辑">
            <Pencil className="w-4 h-4 text-[var(--color-text-subtle)]" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMarkSold} title="标记出货">
            <Check className="w-4 h-4 text-[var(--color-success)]" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMarkIgnored} title="标记忽略">
            <X className="w-4 h-4 text-[var(--color-text-subtle)]" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete} title="删除">
            <TrashIcon className="w-4 h-4 text-[var(--color-danger)]" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function WatchCard({
  view,
  onDelete,
  onEdit,
}: {
  view: InventoryBuyWatchView
  onDelete: () => void
  onEdit: () => void
}) {
  const { watch, current_price, discount_to_target, buy_signal } = view

  return (
    <div className="flex items-center justify-between p-3 bg-[var(--color-panel)] rounded-lg border border-[var(--color-border-soft)]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-[var(--color-text)] truncate">{watch.item_name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${buy_signal === "buy_ready" ? "bg-[var(--color-success)]/20 text-[var(--color-success)]" : buy_signal === "waiting" ? "bg-[var(--color-brand-gold)]/20 text-[var(--color-brand-gold)]" : "bg-[var(--color-text-subtle)]/20 text-[var(--color-text-subtle)]"}`}>
            {getBuySignalLabel(buy_signal)}
          </span>
        </div>
        <div className="flex gap-4 text-xs text-[var(--color-text-subtle)]">
          <span>目标 {formatPrice(watch.target_buy_price)}</span>
          {current_price && <span>现价 {formatPrice(current_price)}</span>}
          {discount_to_target !== null && discount_to_target > 0 && (
            <span className="text-[var(--color-success)]">低于目标 {formatPercent(discount_to_target)}</span>
          )}
          {watch.max_quantity && <span>计划 {watch.max_quantity} 个</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 ml-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title="编辑">
          <Pencil className="w-4 h-4 text-[var(--color-text-subtle)]" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete} title="删除">
          <TrashIcon className="w-4 h-4 text-[var(--color-danger)]" />
        </Button>
      </div>
    </div>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function AddPositionDialog({
  seasonId,
  marketMode,
  onClose,
  onSuccess,
}: {
  seasonId: string
  marketMode: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [itemName, setItemName] = useState("")
  const [itemId, setItemId] = useState("")
  const [buyPrice, setBuyPrice] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [targetSellPrice, setTargetSellPrice] = useState("")
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<ItemSuggestion[]>([])

  const searchQuery = useQuery({
    queryKey: ["item-search", itemName],
    queryFn: () => cmd.searchItems(itemName, 1, 10),
    enabled: itemName.length >= 1,
  })

  useEffect(() => {
    if (searchQuery.data?.items && itemName.length >= 1) {
      const items = searchQuery.data.items.slice(0, 8).map(item => ({
        item_id: item.item_id,
        item_name: item.name,
      }))
      setSuggestions(items)
      setShowSuggestions(true)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }, [searchQuery.data, itemName])

  const handleSelectItem = (item: ItemSuggestion) => {
    setItemName(item.item_name)
    setItemId(item.item_id)
    setShowSuggestions(false)
  }

  const handleInputChange = (value: string) => {
    setItemName(value)
    setItemId("")
  }

  const createMutation = useMutation({
    mutationFn: (request: CreatePositionRequest) => cmd.createInventoryPosition(request),
    onSuccess: () => {
      toast.success("持仓记录已添加")
      onSuccess()
    },
    onError: (error) => toast.error(`添加失败: ${errorMessage(error)}`),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemName || !buyPrice || !quantity) {
      toast.error("请填写必填项")
      return
    }

    setLoading(true)
    const breakEvenPrice = parseFloat(buyPrice) / 0.875
    await createMutation.mutateAsync({
      season_id: seasonId,
      market_mode: marketMode,
      item_id: itemId,
      item_name: itemName,
      buy_price: parseFloat(buyPrice),
      quantity: parseInt(quantity),
      target_sell_price: targetSellPrice ? parseFloat(targetSellPrice) : breakEvenPrice,
      note,
    })
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--color-panel)] rounded-lg p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-medium text-[var(--color-text)] mb-4">添加持仓记录</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label className="block text-sm text-[var(--color-text-subtle)] mb-1">物品名称 *</label>
            <input
              type="text"
              value={itemName}
              onChange={e => handleInputChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="输入物品名称搜索"
              className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-[var(--color-panel)] border border-[var(--color-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {suggestions.map(item => (
                  <button
                    key={item.item_id}
                    type="button"
                    onClick={() => handleSelectItem(item)}
                    className="w-full px-3 py-2 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-soft)]"
                  >
                    {item.item_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--color-text-subtle)] mb-1">买入单价 *</label>
              <input
                type="number"
                step="0.01"
                value={buyPrice}
                onChange={e => setBuyPrice(e.target.value)}
                placeholder="买入价格"
                className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-subtle)] mb-1">数量 *</label>
              <input
                type="number"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="数量"
                className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-subtle)] mb-1">目标出货价</label>
            <input
              type="number"
              step="0.01"
              value={targetSellPrice}
              onChange={e => setTargetSellPrice(e.target.value)}
              placeholder={`留空使用保本价 ${buyPrice ? (parseFloat(buyPrice) / 0.875).toFixed(2) : ""}`}
              className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-subtle)] mb-1">备注</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="可选备注"
              className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              取消
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "添加中..." : "添加"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditPositionDialog({
  position,
  onClose,
  onSuccess,
}: {
  position: InventoryPositionView
  onClose: () => void
  onSuccess: () => void
}) {
  const [itemName, setItemName] = useState(position.position.item_name)
  const [buyPrice, setBuyPrice] = useState(position.position.buy_price.toString())
  const [quantity, setQuantity] = useState(position.position.quantity.toString())
  const [targetSellPrice, setTargetSellPrice] = useState(position.position.target_sell_price?.toString() || "")
  const [note, setNote] = useState(position.position.note)
  const [loading, setLoading] = useState(false)

  const updateMutation = useMutation({
    mutationFn: (request: UpdatePositionRequest) => cmd.updateInventoryPosition(request),
    onSuccess: () => {
      toast.success("持仓记录已更新")
      onSuccess()
    },
    onError: (error) => toast.error(`更新失败: ${errorMessage(error)}`),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemName || !buyPrice || !quantity) {
      toast.error("请填写必填项")
      return
    }

    setLoading(true)
    await updateMutation.mutateAsync({
      id: position.position.id,
      item_name: itemName,
      buy_price: parseFloat(buyPrice),
      quantity: parseInt(quantity),
      target_sell_price: targetSellPrice ? parseFloat(targetSellPrice) : undefined,
      note,
    })
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--color-panel)] rounded-lg p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-medium text-[var(--color-text)] mb-4">编辑持仓记录</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-text-subtle)] mb-1">物品名称 *</label>
            <input
              type="text"
              value={itemName}
              onChange={e => setItemName(e.target.value)}
              placeholder="输入物品名称"
              className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--color-text-subtle)] mb-1">买入单价 *</label>
              <input
                type="number"
                step="0.01"
                value={buyPrice}
                onChange={e => setBuyPrice(e.target.value)}
                placeholder="买入价格"
                className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-subtle)] mb-1">数量 *</label>
              <input
                type="number"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="数量"
                className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-subtle)] mb-1">目标出货价</label>
            <input
              type="number"
              step="0.01"
              value={targetSellPrice}
              onChange={e => setTargetSellPrice(e.target.value)}
              placeholder="留空保持不变"
              className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-subtle)] mb-1">备注</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="可选备注"
              className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              取消
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "更新中..." : "保存"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditWatchDialog({
  watch,
  onClose,
  onSuccess,
}: {
  watch: InventoryBuyWatchView
  onClose: () => void
  onSuccess: () => void
}) {
  const [itemName, setItemName] = useState(watch.watch.item_name)
  const [targetBuyPrice, setTargetBuyPrice] = useState(watch.watch.target_buy_price.toString())
  const [maxQuantity, setMaxQuantity] = useState(watch.watch.max_quantity?.toString() || "")
  const [note, setNote] = useState(watch.watch.note)
  const [loading, setLoading] = useState(false)

  const updateMutation = useMutation({
    mutationFn: (request: UpdateBuyWatchRequest) => cmd.updateInventoryBuyWatch(request),
    onSuccess: () => {
      toast.success("买入监控已更新")
      onSuccess()
    },
    onError: (error) => toast.error(`更新失败: ${errorMessage(error)}`),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemName || !targetBuyPrice) {
      toast.error("请填写必填项")
      return
    }

    setLoading(true)
    await updateMutation.mutateAsync({
      id: watch.watch.id,
      item_name: itemName,
      target_buy_price: parseFloat(targetBuyPrice),
      max_quantity: maxQuantity ? parseInt(maxQuantity) : undefined,
      note,
    })
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--color-panel)] rounded-lg p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-medium text-[var(--color-text)] mb-4">编辑买入监控</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-text-subtle)] mb-1">物品名称 *</label>
            <input
              type="text"
              value={itemName}
              onChange={e => setItemName(e.target.value)}
              placeholder="输入物品名称"
              className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-subtle)] mb-1">目标买入价 *</label>
            <input
              type="number"
              step="0.01"
              value={targetBuyPrice}
              onChange={e => setTargetBuyPrice(e.target.value)}
              placeholder="当前价低于此价格时提醒"
              className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-subtle)] mb-1">计划数量</label>
            <input
              type="number"
              value={maxQuantity}
              onChange={e => setMaxQuantity(e.target.value)}
              placeholder="可选"
              className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-subtle)] mb-1">备注</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="可选备注"
              className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              取消
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "更新中..." : "保存"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddWatchDialog({
  seasonId,
  marketMode,
  onClose,
  onSuccess,
}: {
  seasonId: string
  marketMode: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [itemName, setItemName] = useState("")
  const [itemId, setItemId] = useState("")
  const [targetBuyPrice, setTargetBuyPrice] = useState("")
  const [maxQuantity, setMaxQuantity] = useState("")
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<ItemSuggestion[]>([])

  const searchQuery = useQuery({
    queryKey: ["item-search-watch", itemName],
    queryFn: () => cmd.searchItems(itemName, 1, 10),
    enabled: itemName.length >= 1,
  })

  useEffect(() => {
    if (searchQuery.data?.items && itemName.length >= 1) {
      const items = searchQuery.data.items.slice(0, 8).map(item => ({
        item_id: item.item_id,
        item_name: item.name,
      }))
      setSuggestions(items)
      setShowSuggestions(true)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }, [searchQuery.data, itemName])

  const handleSelectItem = (item: ItemSuggestion) => {
    setItemName(item.item_name)
    setItemId(item.item_id)
    setShowSuggestions(false)
  }

  const handleInputChange = (value: string) => {
    setItemName(value)
    setItemId("")
  }

  const createMutation = useMutation({
    mutationFn: (request: CreateBuyWatchRequest) => cmd.createInventoryBuyWatch(request),
    onSuccess: () => {
      toast.success("买入监控已添加")
      onSuccess()
    },
    onError: (error) => toast.error(`添加失败: ${errorMessage(error)}`),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemName || !targetBuyPrice) {
      toast.error("请填写必填项")
      return
    }

    setLoading(true)
    await createMutation.mutateAsync({
      season_id: seasonId,
      market_mode: marketMode,
      item_id: itemId,
      item_name: itemName,
      target_buy_price: parseFloat(targetBuyPrice),
      max_quantity: maxQuantity ? parseInt(maxQuantity) : undefined,
      note,
    })
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--color-panel)] rounded-lg p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-medium text-[var(--color-text)] mb-4">添加买入监控</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label className="block text-sm text-[var(--color-text-subtle)] mb-1">物品名称 *</label>
            <input
              type="text"
              value={itemName}
              onChange={e => handleInputChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="输入物品名称搜索"
              className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-[var(--color-panel)] border border-[var(--color-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {suggestions.map(item => (
                  <button
                    key={item.item_id}
                    type="button"
                    onClick={() => handleSelectItem(item)}
                    className="w-full px-3 py-2 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-soft)]"
                  >
                    {item.item_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-subtle)] mb-1">目标买入价 *</label>
            <input
              type="number"
              step="0.01"
              value={targetBuyPrice}
              onChange={e => setTargetBuyPrice(e.target.value)}
              placeholder="当前价低于此价格时提醒"
              className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-subtle)] mb-1">计划数量</label>
            <input
              type="number"
              value={maxQuantity}
              onChange={e => setMaxQuantity(e.target.value)}
              placeholder="可选"
              className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--color-text-subtle)] mb-1">备注</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="可选备注"
              className="w-full px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              取消
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "添加中..." : "添加"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
