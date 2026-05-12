import { useQuery } from "@tanstack/react-query"
import { Package, Flame, TrendingUp, TrendingDown, Minus, History, ArrowUp, ArrowDown } from "lucide-react"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"
import { cmd } from "@/lib/commands"
import type { DashboardSummary, FireHistoryItem } from "@/lib/commands"

export function DashboardStats() {
  const { marketContext } = useSectionRefresh()

  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary", marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getDashboardSummary(),
    staleTime: 30 * 1000,
    retry: 1,
    retryDelay: 1000,
  })

  const { data: fireHistory = [], isLoading: fireHistoryLoading } = useQuery<FireHistoryItem[]>({
    queryKey: ["fire-history", marketContext.seasonId, marketContext.marketMode, 24],
    queryFn: () => cmd.getFireHistory(24),
    staleTime: 60 * 1000,
    retry: 1,
    retryDelay: 1000,
  })

  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ["sections", marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getSections(),
    retry: 1,
    retryDelay: 1000,
  })

  const { data: allSectionItems = [], isLoading: sectionItemsLoading } = useQuery({
    queryKey: ["all-section-items", marketContext.seasonId, marketContext.marketMode],
    queryFn: async () => {
      const allItems: any[] = []
      for (const section of sections) {
        try {
          const items = await cmd.getSectionItems(section.id)
          allItems.push(...items)
        } catch {
          // ignore
        }
      }
      return allItems
    },
    enabled: sections.length > 0,
    retry: 1,
    retryDelay: 1000,
  })

  const isLoading = summaryLoading || fireHistoryLoading || sectionsLoading || sectionItemsLoading

  const rmbPer10kFire = summary?.fire?.rmb_per_10k_fire ?? 61.87

  const stats = {
    itemCount: summary?.item_count ?? 0,
    currentFire: rmbPer10kFire,
    profit: 0,
    profitPercent: 0,
  }

  if (allSectionItems.length > 0) {
    let totalPurchaseValue = 0
    let totalCurrentValue = 0

    for (const item of allSectionItems) {
      const purchasePrice = item.purchase_fire_price ?? 0
      const currentPrice = item.current_price ?? 0

      totalPurchaseValue += purchasePrice
      totalCurrentValue += currentPrice
    }

    if (totalPurchaseValue > 0) {
      stats.profit = (totalCurrentValue - totalPurchaseValue) * rmbPer10kFire / 10000
      stats.profitPercent = ((totalCurrentValue - totalPurchaseValue) / totalPurchaseValue) * 100
    }
  }

  const getProfitStatus = () => {
    if (stats.profit > 0) return "profit"
    if (stats.profit < 0) return "loss"
    return "neutral"
  }

  const profitStatus = getProfitStatus()

  const fireStats = {
    min: 0,
    max: 0,
    avg: 0,
    change: 0,
  }

  if (fireHistory.length > 0) {
    const prices = fireHistory.map(h => h.rmb_per_10k_fire)
    fireStats.min = Math.min(...prices)
    fireStats.max = Math.max(...prices)
    fireStats.avg = prices.reduce((a, b) => a + b, 0) / prices.length
    fireStats.change = fireHistory.length >= 2 
      ? ((fireHistory[fireHistory.length - 1].rmb_per_10k_fire - fireHistory[0].rmb_per_10k_fire) / fireHistory[0].rmb_per_10k_fire) * 100
      : 0
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-slate-100">
              <Package className="w-4 h-4 text-slate-300" />
            </div>
            <span className="text-xs text-slate-400 font-medium">加载中...</span>
          </div>
          <div className="h-6 bg-slate-200 rounded w-3/4"></div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-slate-100">
              <Flame className="w-4 h-4 text-slate-300" />
            </div>
            <span className="text-xs text-slate-400 font-medium">加载中...</span>
          </div>
          <div className="h-6 bg-slate-200 rounded w-3/4"></div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-slate-100">
              <History className="w-4 h-4 text-slate-300" />
            </div>
            <span className="text-xs text-slate-400 font-medium">加载中...</span>
          </div>
          <div className="h-6 bg-slate-200 rounded w-3/4"></div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-slate-100">
              <TrendingUp className="w-4 h-4 text-slate-300" />
            </div>
            <span className="text-xs text-slate-400 font-medium">加载中...</span>
          </div>
          <div className="h-6 bg-slate-200 rounded w-3/4"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-4 gap-3">
      <StatCard
        icon={<Package className="w-4 h-4 text-blue-500" />}
        label="监控物品"
        value={stats.itemCount.toString()}
        unit="个"
      />
      <StatCard
        icon={<Flame className="w-4 h-4 text-red-500" />}
        label="当前火价"
        value={stats.currentFire.toFixed(2)}
        unit="元/万火"
        subValue={summary?.fire?.increase_ratio !== null && summary?.fire?.increase_ratio !== undefined ? (
          <span className={`text-xs font-medium ml-1 ${summary.fire.increase_ratio >= 0 ? "text-green-500" : "text-red-500"}`}>
            {summary.fire.increase_ratio >= 0 ? "↑" : "↓"}{Math.abs(summary.fire.increase_ratio).toFixed(2)}%
          </span>
        ) : null}
      />
      <StatCard
        icon={<History className="w-4 h-4 text-purple-500" />}
        label="历史火价"
        value={fireStats.avg.toFixed(2)}
        unit="元/万火"
        subValue={fireHistory.length > 0 ? (
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-0.5 text-xs text-slate-400">
              <ArrowDown className="w-3 h-3 text-blue-500" />
              {fireStats.min.toFixed(2)}
            </span>
            <span className="flex items-center gap-0.5 text-xs text-slate-400">
              <ArrowUp className="w-3 h-3 text-red-500" />
              {fireStats.max.toFixed(2)}
            </span>
          </div>
        ) : null}
      />
      <StatCard
        icon={profitStatus === "profit" ? (
          <TrendingUp className="w-4 h-4 text-green-500" />
        ) : profitStatus === "loss" ? (
          <TrendingDown className="w-4 h-4 text-red-500" />
        ) : (
          <Minus className="w-4 h-4 text-slate-400" />
        )}
        label="策略收益"
        value={Math.abs(stats.profit).toFixed(2)}
        unit="元"
        valueColor={profitStatus === "profit" ? "text-green-600" : profitStatus === "loss" ? "text-red-600" : "text-slate-600"}
        prefix={profitStatus === "profit" ? "+" : profitStatus === "loss" ? "-" : ""}
        subValue={allSectionItems.length > 0 ? (
          <span className={`text-xs font-medium ml-1 ${stats.profitPercent >= 0 ? "text-green-500" : "text-red-500"}`}>
            {stats.profitPercent >= 0 ? "↑" : "↓"}{Math.abs(stats.profitPercent).toFixed(2)}%
          </span>
        ) : null}
      />
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  unit,
  valueColor = "text-slate-700",
  prefix = "",
  subValue = null,
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit: string
  valueColor?: string
  prefix?: string
  subValue?: React.ReactNode | null
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-lg bg-slate-50">
          {icon}
        </div>
        <span className="text-xs text-slate-500 font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-bold ${valueColor}`}>{prefix}{value}</span>
        <span className="text-xs text-slate-400">{unit}</span>
      </div>
      {subValue && (
        <div className="mt-1">{subValue}</div>
      )}
    </div>
  )
}