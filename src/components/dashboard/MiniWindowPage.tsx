import { useEffect, useRef, useState } from "react"
import {
  cmd,
  type ArbitrageCalculationResult,
  type InventoryBuyWatchView,
  type InventoryPositionView,
  type MiniWorthItem,
} from "@/lib/commands"
import { useQuery } from "@tanstack/react-query"
import { RefreshCw, Copy, Check, Settings2, ExternalLink, Plus, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"
import { queryKeys } from "@/lib/queryKeys"
import { toast } from "sonner"

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
  const { marketContext } = useSectionRefresh()
  const [activeTab, setActiveTab] = useState<Tab>("worth")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [opacity, setOpacity] = useState(0.92)
  const opacitySaveTimerRef = useRef<number | null>(null)

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
    enabled: !!marketContext.seasonId,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
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

  const openMainWindow = async () => {
    try {
      await cmd.setMiniWindowMode(false)
    } catch {
      toast.error("无法打开主窗口")
    }
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
    <div className="h-full flex flex-col bg-[var(--color-bg)] select-none">
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
            className="h-6 w-6 !-webkit-app-region-no-drag"
            onClick={() => feedQuery.refetch()}
            disabled={feedQuery.isFetching}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${feedQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 !-webkit-app-region-no-drag"
            onClick={openMainWindow}
            title="打开主窗口"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 !-webkit-app-region-no-drag"
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
            onClick={() => {
              toast.info("请在主窗口中添加买入监控")
              openMainWindow()
            }}
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
            onClick={() => {
              toast.info("请在主窗口中管理持仓")
              openMainWindow()
            }}
          >
            <Minus className="w-3 h-3" />
            管理持仓
          </Button>
        )}
        {activeTab === "arbitrage" && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={openMainWindow}
          >
            <ExternalLink className="w-3 h-3" />
            查看套利
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
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
    </div>
  )
}

function WorthItemsList({ items, onCopy, copiedId }: { items: MiniWorthItem[]; onCopy: (name: string, id: string) => void; copiedId: string | null }) {
  if (items.length === 0) {
    return <EmptyState message="暂无值得买的物品" />
  }

  return (
    <div className="p-2 space-y-1">
      {items.slice(0, 10).map((item) => (
        <div key={item.item_id} className="flex items-center justify-between px-2 py-2 rounded bg-[var(--color-panel)] hover:bg-[var(--color-panel-soft)] group">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--color-text)] truncate">{item.item_name}</div>
            <div className="flex gap-3 text-xs text-[var(--color-text-subtle)] mt-0.5">
              <span>现价 <span className="text-[var(--color-success)]">{formatPrice(item.current_price)}</span></span>
              <span>目标 <span>{formatPrice(item.purchase_fire_price)}</span></span>
              <span>数量 <span>{item.count}</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-3">
            {item.profit && (
              <span className="text-sm font-medium text-[var(--color-success)]">
                -{formatPrice(item.profit)}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
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
    </div>
  )
}

function BuyWatchesList({ watches, onCopy, copiedId }: { watches: InventoryBuyWatchView[]; onCopy: (name: string, id: string) => void; copiedId: string | null }) {
  if (watches.length === 0) {
    return <EmptyState message="暂无买入监控" />
  }

  return (
    <div className="p-2 space-y-1">
      {watches.slice(0, 10).map((view) => {
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
    </div>
  )
}

function SellPositionsList({ positions, onCopy, copiedId }: { positions: InventoryPositionView[]; onCopy: (name: string, id: string) => void; copiedId: string | null }) {
  if (positions.length === 0) {
    return <EmptyState message="暂无可出货的持仓" />
  }

  return (
    <div className="p-2 space-y-1">
      {positions.slice(0, 10).map((view) => {
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
    </div>
  )
}

function ArbitrageList({ recipes, onCopy, copiedId }: { recipes: ArbitrageCalculationResult[]; onCopy: (name: string, id: string) => void; copiedId: string | null }) {
  if (recipes.length === 0) {
    return <EmptyState message="暂无盈利套利" />
  }

  return (
    <div className="p-2 space-y-1">
      {recipes.slice(0, 10).map((recipe) => (
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
