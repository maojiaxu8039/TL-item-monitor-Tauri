import { useQuery } from "@tanstack/react-query"
import { useState, useEffect, useMemo, useCallback, memo } from "react"
import { Package, Flame, TrendingUp, TrendingDown, Minus, History, ArrowUp, ArrowDown, Award, ChevronLeft, ChevronRight } from "lucide-react"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"
import { MetricCard } from "@/components/ui/MetricCard"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { cmd } from "@/lib/commands"
import type { DashboardSummary, FireHistoryItem, StrategyWithCosts, FirePriceUI } from "@/lib/commands"
import { queryKeys } from "@/lib/queryKeys"
import { calculateRecommendations } from "@/lib/strategyRecommend"

const FirePriceHelper = memo(function FirePriceHelper({ fire }: { fire: FirePriceUI | null }) {
  if (!fire) return null;
  const isStale = Date.now() / 1000 - fire.scraped_at > 3600;
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-[var(--color-text-subtle)]">元/万火</span>
      {fire.increase_ratio !== null && fire.increase_ratio !== undefined && (
        <span className={`text-xs font-medium ${fire.increase_ratio >= 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
          {fire.increase_ratio >= 0 ? "↑" : "↓"}{Math.abs(fire.increase_ratio).toFixed(2)}%
        </span>
      )}
      {isStale && (
        <span className="rounded bg-[rgba(239,68,68,0.15)] px-1 text-[10px] font-medium text-[var(--color-danger)]" title={`数据已过期 (${new Date(fire.scraped_at * 1000).toLocaleString('zh-CN')})`}>
          缓存
        </span>
      )}
    </div>
  );
});

export function DashboardStats() {
  const { marketContext, marketContextReady } = useSectionRefresh()

  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: [...queryKeys.dashboardSummary, marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getDashboardSummary(),
    enabled: marketContextReady,
    staleTime: 30 * 1000,
    retry: 1,
    retryDelay: 1000,
  })

  const { data: fireHistory = [], isLoading: fireHistoryLoading } = useQuery<FireHistoryItem[]>({
    queryKey: [...queryKeys.fireHistory, marketContext.seasonId, marketContext.marketMode, 24],
    queryFn: () => cmd.getFireHistory(24),
    enabled: marketContextReady,
    staleTime: 60 * 1000,
    retry: 1,
    retryDelay: 1000,
  })

  const { data: allSectionItems = [], isLoading: sectionItemsLoading } = useQuery({
    queryKey: [...queryKeys.allSectionItems, marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getSectionItemsForContext(marketContext.seasonId, marketContext.marketMode),
    enabled: marketContextReady,
    retry: 1,
    retryDelay: 1000,
  })

  const { data: strategies = [], isLoading: strategiesLoading } = useQuery<StrategyWithCosts[]>({
    queryKey: [...queryKeys.strategies, marketContext.marketMode],
    queryFn: () => cmd.getAllStrategiesWithCosts(marketContext.marketMode),
    staleTime: 60 * 1000,
    retry: 1,
    retryDelay: 1000,
  })

  const isLoading = summaryLoading || fireHistoryLoading || sectionItemsLoading || strategiesLoading

  const rmbPer10kFire = summary?.fire?.rmb_per_10k_fire
  const hasFirePrice = rmbPer10kFire !== null && rmbPer10kFire !== undefined

  const stats = useMemo(() => {
    const s = {
      itemCount: summary?.item_count ?? 0,
      currentFire: hasFirePrice ? rmbPer10kFire : null,
      profit: 0,
      profitPercent: 0,
    };
    if (allSectionItems.length > 0 && hasFirePrice) {
      let totalPurchaseValue = 0;
      let totalCurrentValue = 0;
      for (const item of allSectionItems) {
        totalPurchaseValue += item.purchase_fire_price ?? 0;
        totalCurrentValue += item.current_price ?? 0;
      }
      if (totalPurchaseValue > 0) {
        s.profit = (totalCurrentValue - totalPurchaseValue) * rmbPer10kFire / 10000;
        s.profitPercent = ((totalCurrentValue - totalPurchaseValue) / totalPurchaseValue) * 100;
      }
    }
    return s;
  }, [summary, allSectionItems, hasFirePrice, rmbPer10kFire]);

  const getProfitStatus = () => {
    if (stats.profit > 0) return "profit"
    if (stats.profit < 0) return "loss"
    return "neutral"
  }

  const profitStatus = getProfitStatus()

  const fireStats = useMemo(() => {
    const fs = { min: 0, max: 0, avg: 0, change: 0 };
    if (fireHistory.length > 0) {
      const prices = fireHistory.map(h => h.rmb_per_10k_fire);
      fs.min = Math.min(...prices);
      fs.max = Math.max(...prices);
      fs.avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const sorted = [...fireHistory].sort((a, b) => a.scraped_at - b.scraped_at);
      fs.change = sorted.length >= 2 && sorted[0].rmb_per_10k_fire !== 0
        ? ((sorted[sorted.length - 1].rmb_per_10k_fire - sorted[0].rmb_per_10k_fire) / sorted[0].rmb_per_10k_fire) * 100
        : 0;
    }
    return fs;
  }, [fireHistory]);

  const recommendations = useMemo(() => calculateRecommendations(strategies), [strategies]);

  const top3 = recommendations.slice(0, 3);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex >= top3.length) {
      setCurrentIndex(0);
    }
  }, [top3.length, currentIndex]);

  useEffect(() => {
    if (top3.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % top3.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [top3.length]);

  const getLevelText = useCallback((level: string) => {
    switch (level) {
      case "strong": return "强烈推荐";
      case "good": return "推荐";
      case "watch": return "观望";
      case "avoid": return "回避";
      default: return "未知";
    }
  }, []);

  const handlePrevSlide = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + top3.length) % top3.length);
  }, [top3.length]);

  const handleNextSlide = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % top3.length);
  }, [top3.length]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="metric-card animate-pulse">
            <div className="flex items-center gap-2 mb-2">
              <div className="rounded-lg border border-[rgba(255,184,0,0.14)] bg-[rgba(255,184,0,0.08)] p-1.5">
                <Package className="h-4 w-4 text-[var(--color-text-subtle)]" />
              </div>
              <span className="text-xs font-medium text-[var(--color-text-subtle)]">加载中...</span>
            </div>
            <div className="h-6 w-3/4 rounded bg-[var(--color-panel-soft)]"></div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          label="监控物品"
          value={stats.itemCount.toString()}
          icon={Package}
          iconBg="bg-[rgba(255,184,0,0.08)]"
          iconColor="text-[var(--color-brand-gold)]"
          helper={<span className="text-xs text-[var(--color-text-subtle)]">个</span>}
        />
        <MetricCard
          label="当前火价"
          value={hasFirePrice ? stats.currentFire!.toFixed(2) : "获取中..."}
          icon={Flame}
          iconBg="bg-[rgba(239,68,68,0.1)]"
          iconColor="text-[var(--color-danger)]"
          helper={
            hasFirePrice ? (
              <FirePriceHelper fire={summary?.fire ?? null} />
            ) : null
          }
        />
        <MetricCard
          label="历史火价"
          value={fireStats.avg.toFixed(2)}
          icon={History}
          iconBg="bg-[rgba(167,139,250,0.12)]"
          iconColor="text-[var(--color-ai)]"
          helper={
            fireHistory.length > 0 ? (
              <div className="flex items-center gap-2 mt-1">
                <span className="flex items-center gap-0.5 text-xs text-[var(--color-text-subtle)]">
                  <ArrowDown className="w-3 h-3 text-[var(--color-success)]" />
                  {fireStats.min.toFixed(2)}
                </span>
                <span className="flex items-center gap-0.5 text-xs text-[var(--color-text-subtle)]">
                  <ArrowUp className="w-3 h-3 text-[var(--color-danger)]" />
                  {fireStats.max.toFixed(2)}
                </span>
              </div>
            ) : <span className="text-xs text-[var(--color-text-subtle)]">元/万火</span>
          }
        />
        <MetricCard
          label="策略收益"
          value={`${profitStatus === "profit" ? "+" : profitStatus === "loss" ? "-" : ""}${Math.abs(stats.profit).toFixed(2)}`}
          icon={profitStatus === "profit" ? TrendingUp : profitStatus === "loss" ? TrendingDown : Minus}
          iconBg={profitStatus === "profit" ? "bg-[rgba(239,68,68,0.1)]" : profitStatus === "loss" ? "bg-[rgba(34,197,94,0.1)]" : "bg-[rgba(255,255,255,0.04)]"}
          iconColor={profitStatus === "profit" ? "text-[var(--color-danger)]" : profitStatus === "loss" ? "text-[var(--color-success)]" : "text-[var(--color-text-subtle)]"}
          helper={
            allSectionItems.length > 0 ? (
              <span className={`text-xs font-medium ${stats.profitPercent >= 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
                {stats.profitPercent >= 0 ? "↑" : "↓"}{Math.abs(stats.profitPercent).toFixed(2)}%
              </span>
            ) : <span className="text-xs text-[var(--color-text-subtle)]">元</span>
          }
        />
      </div>

      {top3.length > 0 && (
        <div className="surface p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[var(--color-brand-gold)]" />
              <span className="text-sm font-medium text-[var(--color-text)]">策略推荐榜 TOP3</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevSlide}
                className="rounded-lg p-1 text-[var(--color-text-subtle)] transition-colors hover:bg-[rgba(255,184,0,0.08)] hover:text-[var(--color-brand-gold)]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="w-8 text-center text-xs text-[var(--color-text-subtle)]">
                {currentIndex + 1}/{top3.length}
              </span>
              <button
                onClick={handleNextSlide}
                className="rounded-lg p-1 text-[var(--color-text-subtle)] transition-colors hover:bg-[rgba(255,184,0,0.08)] hover:text-[var(--color-brand-gold)]"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="relative overflow-hidden">
            <div
              className="flex transition-transform duration-500 ease-in-out"
              style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            >
              {top3.map((rec, index) => (
                <div key={rec.strategy_id} className="w-full flex-shrink-0 px-1">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      index === 0 ? "border border-[rgba(255,184,0,0.35)] bg-[rgba(255,184,0,0.12)] text-[var(--color-brand-gold)]" :
                      index === 1 ? "border border-[var(--color-border)] bg-[var(--color-panel-soft)] text-[var(--color-text-muted)]" :
                      "border border-[rgba(255,106,0,0.3)] bg-[rgba(255,106,0,0.1)] text-[var(--color-brand)]"
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-[var(--color-text)]">{rec.strategy_name}</span>
                        <StatusBadge variant={rec.level === "strong" ? "success" : rec.level === "good" ? "info" : rec.level === "watch" ? "warning" : "danger"}>
                          {getLevelText(rec.level)}
                        </StatusBadge>
                        <StatusBadge variant={rec.risk_level === "low" ? "success" : rec.risk_level === "medium" ? "warning" : "danger"}>
                          {rec.risk_level === "low" ? "低风险" : rec.risk_level === "medium" ? "中风险" : "高风险"}
                        </StatusBadge>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                        <span>评分: <span className="font-medium">{rec.score}</span></span>
                        <span>收益率: <span className={`font-medium ${rec.profit_ratio >= 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
                          {rec.profit_ratio >= 0 ? "+" : ""}{rec.profit_ratio.toFixed(1)}%
                        </span></span>
                        <span>预计收益: <span className={`font-medium ${rec.expected_profit_fire >= 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
                          {rec.expected_profit_fire >= 0 ? "+" : ""}{rec.expected_profit_fire.toFixed(0)}火
                        </span></span>
                      </div>
                      {rec.reasons.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {rec.reasons.slice(0, 2).map((reason, i) => (
                            <span key={i} className="rounded border border-[rgba(34,197,94,0.22)] bg-[rgba(34,197,94,0.1)] px-1.5 py-0.5 text-[10px] text-[var(--color-success)]">
                              {reason}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-bold ${
                        rec.score >= 80 ? "text-[var(--color-danger)]" :
                        rec.score >= 60 ? "text-[var(--color-brand-gold)]" :
                        rec.score >= 40 ? "text-[var(--color-brand-gold)]" :
                        "text-[var(--color-success)]"
                      }`}>
                        {rec.score}
                      </div>
                      <div className="text-[10px] text-[var(--color-text-subtle)]">分</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-center gap-1 mt-3">
            {top3.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentIndex ? "bg-[var(--color-brand-gold)]" : "bg-[var(--color-border)]"
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
