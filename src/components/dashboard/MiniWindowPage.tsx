import { useEffect, useRef, useState, type PointerEvent } from "react"
import {
  cmd,
  type ArbitrageCalculationResult,
  type InventoryBuyWatchView,
  type InventoryPositionView,
  type MiniWorthItem,
} from "@/lib/commands"
import { useQuery } from "@tanstack/react-query"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { RefreshCw, Copy, Check, Settings2, Plus, Minus, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"
import { useVisiblePolling } from "@/hooks/useVisiblePolling"
import { useShowMore } from "@/hooks/useShowMore"
import { queryKeys } from "@/lib/queryKeys"
import { errorMessage } from "@/lib/utils"
import { toast } from "sonner"
import { ItemSearchDialog } from "./ItemSearchDialog"

type Tab = "worth" | "buy" | "sell" | "arbitrage"

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "—"
  return price.toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`
}

export default function MiniWindowPage() {
  const { marketContext, marketContextReady } = useSectionRefresh()
  const [activeTab, setActiveTab] = useState<Tab>("worth")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [dialogMode, setDialogMode] = useState<"watch" | "position" | null>(null)
  const [opacity, setOpacity] = useState(0.92)
  const opacitySaveTimerRef = useRef<number | null>(null)
  const feedRefetchInterval = useVisiblePolling(60000)

  useEffect(() => {
    cmd.getWindowModeState().then((state) => {
      setOpacity(state.opacity)
      document.documentElement.style.setProperty("--mini-opacity", String(state.opacity))
    }).catch(() => {})

    return () => {
      if (opacitySaveTimerRef.current) {
        window.clearTimeout(opacitySaveTimerRef.current)
      }
    }
  }, [])

  const feedQuery = useQuery({
    queryKey: [...queryKeys.miniWindowFeed, marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getMiniWindowFeed(marketContext.seasonId, marketContext.marketMode),
    enabled: marketContextReady && !!marketContext.seasonId && !!marketContext.marketMode,
    refetchInterval: feedRefetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })

  const feed = feedQuery.data

  const handleCopyName = async (name: string, id: string) => {
    try {
      await navigator.clipboard.writeText(name)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      toast.error("复制失败")
    }
  }

  const handleDragStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest("[data-mini-no-drag]")) return
    getCurrentWindow().startDragging().catch(() => {})
  }

  const handleOpacityChange = async (newOpacity: number) => {
    const nextOpacity = Math.round(newOpacity * 100) / 100
    setOpacity(nextOpacity)
    document.documentElement.style.setProperty("--mini-opacity", String(nextOpacity))

    if (opacitySaveTimerRef.current) {
      window.clearTimeout(opacitySaveTimerRef.current)
    }
    opacitySaveTimerRef.current = window.setTimeout(() => {
      cmd.setWindowOpacity(nextOpacity).catch(() => {
        toast.error("设置透明度失败")
      })
    }, 160)
  }

  const worthCount = feed?.worth_items.length || 0
  const buyCount = feed?.buy_ready_watches.length || 0
  const sellCount = feed?.sell_ready_positions.length || 0
  const arbitrageCount = feed?.profitable_arbitrage.length || 0

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[var(--color-bg)] select-none"
      onPointerDown={handleDragStart}
      data-tauri-drag-region
    >
      {/* Header - Draggable */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-panel)] cursor-move"
        data-tauri-drag-region
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--color-success)] shadow-[0_0_10px_rgba(34,197,94,0.7)]" />
          <span className="text-xs text-[var(--color-text-subtle)]">
            {feed ? `更新 ${new Date(feed.updated_at * 1000).toLocaleTimeString()}` : "等待数据..."}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            data-mini-no-drag
            onClick={() => feedQuery.refetch()}
            disabled={feedQuery.isFetching}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${feedQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            data-mini-no-drag
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings2 className={`w-3.5 h-3.5 ${showSettings ? "text-[var(--color-brand)]" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-panel-soft)]">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-text-subtle)]">透明</span>
            <input
              data-mini-no-drag
              type="range"
              min="0.4"
              max="1"
              step="0.01"
              value={opacity}
              onChange={(event) => handleOpacityChange(Number(event.target.value))}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--color-border)] accent-[var(--color-brand)]"
              title="拖动调整小窗口透明度"
            />
            <span className="text-xs text-[var(--color-text-subtle)] w-10 text-right">
              {Math.round(opacity * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="grid grid-cols-4 border-b border-[var(--color-border)] bg-[var(--color-panel)]">
        {[
          { id: "worth" as Tab, label: "值得买", count: worthCount, color: "text-[var(--color-success)]" },
          { id: "buy" as Tab, label: "买入监控", count: buyCount, color: "text-[var(--color-brand-gold)]" },
          { id: "sell" as Tab, label: "可出货", count: sellCount, color: "text-[var(--color-danger)]" },
          { id: "arbitrage" as Tab, label: "套利", count: arbitrageCount, color: "text-[var(--color-ai)]" },
        ].map((tab) => (
          <button
            key={tab.id}
            data-mini-no-drag
            className={`min-w-0 px-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? `${tab.color} border-b-2 border-current`
                : "text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}{tab.count > 0 && <span className="ml-1 opacity-70">({tab.count})</span>}
          </button>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-border-soft)] bg-[var(--color-panel-soft)]">
        {activeTab === "buy" && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs gap-1"
            data-mini-no-drag
            onClick={() => setDialogMode("watch")}
          >
            <Plus className="w-3 h-3" />
            添加监控
          </Button>
        )}
        {activeTab === "sell" && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs gap-1"
            data-mini-no-drag
            onClick={() => setDialogMode("position")}
          >
            <Minus className="w-3 h-3" />
            管理持仓
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {feedQuery.isLoading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-5 h-5 animate-spin text-[var(--color-text-subtle)]" />
          </div>
        ) : (
          <>
            {activeTab === "worth" && (
              <WorthItemsList items={feed?.worth_items || []} onCopy={handleCopyName} copiedId={copiedId} />
            )}
            {activeTab === "buy" && (
              <BuyWatchesList watches={feed?.buy_ready_watches || []} onCopy={handleCopyName} copiedId={copiedId} />
            )}
            {activeTab === "sell" && (
              <SellPositionsList positions={feed?.sell_ready_positions || []} onCopy={handleCopyName} copiedId={copiedId} />
            )}
            {activeTab === "arbitrage" && (
              <ArbitrageList recipes={feed?.profitable_arbitrage || []} onCopy={handleCopyName} copiedId={copiedId} />
            )}
          </>
        )}
      </div>

      <ItemSearchDialog
        open={dialogMode !== null}
        onOpenChange={(open) => {
          if (!open) setDialogMode(null)
        }}
        mode={dialogMode ?? "watch"}
        onSubmit={async ({ item, price, quantity }) => {
          try {
            if (dialogMode === "watch") {
              await cmd.createInventoryBuyWatch({
                season_id: marketContext.seasonId,
                market_mode: marketContext.marketMode,
                item_id: item.item_id,
                item_name: item.name,
                target_buy_price: price,
                note: "从小窗口添加",
              })
              toast.success("监控添加成功")
            } else if (dialogMode === "position") {
              await cmd.createInventoryPosition({
                season_id: marketContext.seasonId,
                market_mode: marketContext.marketMode,
                item_id: item.item_id,
                item_name: item.name,
                buy_price: price,
                quantity: quantity ?? 1,
                note: "从小窗口添加",
              })
              toast.success("持仓添加成功")
            }
            feedQuery.refetch()
          } catch (error) {
            toast.error(`添加失败: ${errorMessage(error)}`)
            throw error
          }
        }}
      />
    </div>
  )
}

function WorthItemsList({ items, onCopy, copiedId }: { items: MiniWorthItem[]; onCopy: (name: string, id: string) => void; copiedId: string | null }) {
  const { visibleCount, hasMore, remaining, showMore, collapse } = useShowMore(items.length)
  const visible = items.slice(0, visibleCount)

  if (items.length === 0) {
    return <EmptyState message="暂无值得买的物品" />
  }

  return (
    <div className="p-2 space-y-1">
      {visible.map((item) => (
        <div
          key={item.item_id}
          className={`flex items-center justify-between px-2 py-2 rounded group transition-colors ${
            item.is_worth
              ? "bg-[rgba(34,197,94,0.08)] hover:bg-[rgba(34,197,94,0.14)] border border-[rgba(34,197,94,0.2)]"
              : "bg-[var(--color-panel)] hover:bg-[var(--color-panel-soft)]"
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-[var(--color-text)] truncate">{item.item_name}</span>
              {item.is_worth && (
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-[rgba(34,197,94,0.2)] text-[var(--color-success)] font-medium">
                  值的
                </span>
              )}
            </div>
            <div className="flex gap-3 text-xs text-[var(--color-text-subtle)] mt-0.5">
              <span>
                现价{" "}
                <span className={item.current_price ? "text-[var(--color-text)]" : ""}>
                  {formatPrice(item.current_price)}
                </span>
              </span>
              <span>目标 <span className="text-[var(--color-text)]">{formatPrice(item.purchase_fire_price)}</span></span>
              <span>数量 <span>{item.count}</span></span>
              {item.section_name && (
                <span className="truncate text-[var(--color-text-subtle)]">· {item.section_name}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-3">
            {item.profit !== null && item.profit !== undefined && (
              <span className="text-sm font-medium text-[var(--color-success)]">
                -{formatPrice(item.profit)}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              data-mini-no-drag
              onClick={() => onCopy(item.item_name, item.item_id)}
            >
              {copiedId === item.item_id ? (
                <Check className="w-4 h-4 text-[var(--color-success)]" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      ))}
      <ShowMoreFooter hasMore={hasMore} remaining={remaining} onShowMore={showMore} onCollapse={collapse} />
    </div>
  )
}

function BuyWatchesList({ watches, onCopy, copiedId }: { watches: InventoryBuyWatchView[]; onCopy: (name: string, id: string) => void; copiedId: string | null }) {
  const { visibleCount, hasMore, remaining, showMore, collapse } = useShowMore(watches.length)
  const visible = watches.slice(0, visibleCount)

  if (watches.length === 0) {
    return <EmptyState message="暂无买入监控" />
  }

  return (
    <div className="p-2 space-y-1">
      {visible.map((view) => {
        const watch = view.watch
        return (
          <div key={watch.id} className="flex items-center justify-between px-2 py-2 rounded bg-[var(--color-panel)] hover:bg-[var(--color-panel-soft)] group">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--color-text)] truncate">{watch.item_name}</div>
              <div className="flex gap-3 text-xs text-[var(--color-text-subtle)] mt-0.5">
                <span>目标价 <span className="text-[var(--color-brand-gold)]">{formatPrice(watch.target_buy_price)}</span></span>
                <span>现价 <span>{formatPrice(view.current_price)}</span></span>
                {view.discount_to_target && view.discount_to_target > 0 && (
                  <span className="text-[var(--color-success)]">低于目标 {formatPercent(view.discount_to_target)}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                data-mini-no-drag
                onClick={() => onCopy(watch.item_name, watch.id)}
              >
                {copiedId === watch.id ? (
                  <Check className="w-4 h-4 text-[var(--color-success)]" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        )
      })}
      <ShowMoreFooter hasMore={hasMore} remaining={remaining} onShowMore={showMore} onCollapse={collapse} />
    </div>
  )
}

function SellPositionsList({ positions, onCopy, copiedId }: { positions: InventoryPositionView[]; onCopy: (name: string, id: string) => void; copiedId: string | null }) {
  const { visibleCount, hasMore, remaining, showMore, collapse } = useShowMore(positions.length)
  const visible = positions.slice(0, visibleCount)

  if (positions.length === 0) {
    return <EmptyState message="暂无可出货的持仓" />
  }

  return (
    <div className="p-2 space-y-1">
      {visible.map((view) => {
        const pos = view.position
        const profit = view.profit || 0
        return (
          <div key={pos.id} className="flex items-center justify-between px-2 py-2 rounded bg-[var(--color-panel)] hover:bg-[var(--color-panel-soft)] group">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-[var(--color-text)] truncate">{pos.item_name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  view.sell_signal === "profitable" ? "bg-[var(--color-success)]/20 text-[var(--color-success)]" : "bg-[var(--color-brand-gold)]/20 text-[var(--color-brand-gold)]"
                }`}>
                  {view.sell_signal === "profitable" ? "盈利" : "保本"}
                </span>
              </div>
              <div className="flex gap-3 text-xs text-[var(--color-text-subtle)] mt-0.5">
                <span>买入价 {formatPrice(pos.buy_price)}</span>
                <span>现价 {formatPrice(view.current_price)}</span>
                <span>数量 {pos.quantity}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-3">
              <span className={`text-sm font-medium ${profit >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
                {profit >= 0 ? "+" : ""}{formatPrice(profit)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                data-mini-no-drag
                onClick={() => onCopy(pos.item_name, pos.id)}
              >
                {copiedId === pos.id ? (
                  <Check className="w-4 h-4 text-[var(--color-success)]" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        )
      })}
      <ShowMoreFooter hasMore={hasMore} remaining={remaining} onShowMore={showMore} onCollapse={collapse} />
    </div>
  )
}

function ArbitrageList({ recipes, onCopy, copiedId }: { recipes: ArbitrageCalculationResult[]; onCopy: (name: string, id: string) => void; copiedId: string | null }) {
  const { visibleCount, hasMore, remaining, showMore, collapse } = useShowMore(recipes.length)
  const visible = recipes.slice(0, visibleCount)

  if (recipes.length === 0) {
    return <EmptyState message="暂无盈利套利" />
  }

  return (
    <div className="p-2 space-y-1">
      {visible.map((recipe) => (
        <div key={recipe.recipe_id} className="flex items-center justify-between px-2 py-2 rounded bg-[var(--color-panel)] hover:bg-[var(--color-panel-soft)] group">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--color-text)] truncate">{recipe.recipe_name}</div>
            <div className="flex gap-3 text-xs text-[var(--color-text-subtle)] mt-0.5">
              <span>利润 <span className="text-[var(--color-success)]">{formatPrice(recipe.profit)}</span></span>
              <span>成本 {formatPrice(recipe.total_cost)}</span>
              <span>利润率 {formatPercent(recipe.profit_margin)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              data-mini-no-drag
              onClick={() => onCopy(recipe.recipe_name, recipe.recipe_id)}
            >
              {copiedId === recipe.recipe_id ? (
                <Check className="w-4 h-4 text-[var(--color-success)]" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      ))}
      <ShowMoreFooter hasMore={hasMore} remaining={remaining} onShowMore={showMore} onCollapse={collapse} />
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full text-[var(--color-text-subtle)]">
      <span className="text-sm">{message}</span>
    </div>
  )
}

function ShowMoreFooter({
  hasMore,
  remaining,
  onShowMore,
  onCollapse,
}: {
  hasMore: boolean
  remaining: number
  onShowMore: () => void
  onCollapse: () => void
}) {
  const expanded = !hasMore && remaining === 0
  if (!hasMore && !expanded) return null

  return (
    <div className="pt-1 flex justify-center">
      {hasMore ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
          data-mini-no-drag
          onClick={onShowMore}
        >
          <ChevronDown className="w-3 h-3" />
          显示更多{remaining > 0 ? ` (${remaining})` : ""}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
          data-mini-no-drag
          onClick={onCollapse}
        >
          <ChevronUp className="w-3 h-3" />
          收起
        </Button>
      )}
    </div>
  )
}
