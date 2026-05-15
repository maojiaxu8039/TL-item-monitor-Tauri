import { useQuery } from "@tanstack/react-query"
import { useState, useEffect, useMemo } from "react"
import { Package, Flame, TrendingUp, TrendingDown, Minus, History, ArrowUp, ArrowDown, Award, ChevronLeft, ChevronRight } from "lucide-react"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"
import { MetricCard } from "@/components/ui/MetricCard"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { cmd } from "@/lib/commands"
import type { DashboardSummary, FireHistoryItem, StrategyWithCosts } from "@/lib/commands"

interface StrategyRecommendation {
  strategy_id: string;
  strategy_name: string;
  score: number;
  level: "strong" | "good" | "watch" | "avoid";
  expected_profit_fire: number;
  profit_ratio: number;
  risk_level: "low" | "medium" | "high";
  reasons: string[];
  warnings: string[];
}

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
          const items = await cmd.getSectionItems(section.id, marketContext.seasonId, marketContext.marketMode)
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

  const { data: strategies = [], isLoading: strategiesLoading } = useQuery<StrategyWithCosts[]>({
    queryKey: ["strategies"],
    queryFn: () => cmd.getAllStrategiesWithCosts(),
    staleTime: 60 * 1000,
    retry: 1,
    retryDelay: 1000,
  })

  const isLoading = summaryLoading || fireHistoryLoading || sectionsLoading || sectionItemsLoading || strategiesLoading

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

  const recommendations = useMemo((): StrategyRecommendation[] => {
    if (strategies.length === 0) return [];

    return strategies.map(strategy => {
      const reasons: string[] = [];
      const warnings: string[] = [];
      let score = 50;

      const profitRatio = strategy.profit_ratio;
      const netProfit = strategy.total_output_value - strategy.total_cost_fire;
      const hasCosts = strategy.costs.length > 0;
      const hasOutputs = strategy.outputs.length > 0;

      if (!hasCosts || !hasOutputs) {
        warnings.push("成本或产出数据不完整");
      }

      if (profitRatio > 20) {
        score += 30;
        reasons.push(`收益率极高 (+${profitRatio.toFixed(1)}%)`);
      } else if (profitRatio > 10) {
        score += 20;
        reasons.push(`收益率较高 (+${profitRatio.toFixed(1)}%)`);
      } else if (profitRatio > 0) {
        score += 10;
        reasons.push(`收益率正向 (+${profitRatio.toFixed(1)}%)`);
      } else if (profitRatio < -10) {
        score -= 30;
        warnings.push(`收益率过低 (${profitRatio.toFixed(1)}%)`);
      } else if (profitRatio < 0) {
        score -= 15;
        warnings.push(`收益为负 (${profitRatio.toFixed(1)}%)`);
      }

      if (netProfit > 100) {
        score += 15;
        reasons.push(`净收益较高 (+${netProfit.toFixed(0)}火)`);
      } else if (netProfit < -100) {
        score -= 20;
        warnings.push(`净收益为负 (${netProfit.toFixed(0)}火)`);
      }

      const hasRealtimeCosts = strategy.costs.some(c => c.is_realtime);
      if (hasRealtimeCosts) {
        score += 5;
        reasons.push("使用实时火价计算");
      }

      const difficulty = strategy.difficulty;
      if (difficulty === "专家" || difficulty === "困难") {
        score -= 5;
        warnings.push("高难度策略，风险较高");
      }

      score = Math.max(0, Math.min(100, score));

      let level: StrategyRecommendation["level"];
      if (score >= 80) level = "strong";
      else if (score >= 60) level = "good";
      else if (score >= 40) level = "watch";
      else level = "avoid";

      let risk: StrategyRecommendation["risk_level"];
      if (difficulty === "专家" || profitRatio < -10) {
        risk = "high";
      } else if (difficulty === "困难" || profitRatio < 0) {
        risk = "medium";
      } else {
        risk = "low";
      }

      return {
        strategy_id: strategy.id,
        strategy_name: strategy.name,
        score,
        level,
        expected_profit_fire: netProfit,
        profit_ratio: profitRatio,
        risk_level: risk,
        reasons,
        warnings,
      };
    }).sort((a, b) => b.score - a.score);
  }, [strategies]);

  const top3 = recommendations.slice(0, 3);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (top3.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % top3.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [top3.length]);

  const getLevelText = (level: string) => {
    switch (level) {
      case "strong": return "强烈推荐";
      case "good": return "推荐";
      case "watch": return "观望";
      case "avoid": return "回避";
      default: return "未知";
    }
  };

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
          value={stats.currentFire.toFixed(2)}
          icon={Flame}
          iconBg="bg-[rgba(239,68,68,0.1)]"
          iconColor="text-[var(--color-danger)]"
          helper={
            <div className="flex items-center gap-1">
              <span className="text-xs text-[var(--color-text-subtle)]">元/万火</span>
              {summary?.fire?.increase_ratio !== null && summary?.fire?.increase_ratio !== undefined && (
                <span className={`text-xs font-medium ${summary.fire.increase_ratio >= 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
                  {summary.fire.increase_ratio >= 0 ? "↑" : "↓"}{Math.abs(summary.fire.increase_ratio).toFixed(2)}%
                </span>
              )}
            </div>
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
                onClick={() => setCurrentIndex(prev => (prev - 1 + top3.length) % top3.length)}
                className="rounded-lg p-1 text-[var(--color-text-subtle)] transition-colors hover:bg-[rgba(255,184,0,0.08)] hover:text-[var(--color-brand-gold)]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="w-8 text-center text-xs text-[var(--color-text-subtle)]">
                {currentIndex + 1}/{top3.length}
              </span>
              <button
                onClick={() => setCurrentIndex(prev => (prev + 1) % top3.length)}
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
