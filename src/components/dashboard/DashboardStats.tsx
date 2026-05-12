import { useQuery } from "@tanstack/react-query"
import { useState, useEffect, useMemo } from "react"
import { Package, Flame, TrendingUp, TrendingDown, Minus, History, ArrowUp, ArrowDown, Award, ChevronLeft, ChevronRight } from "lucide-react"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"
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

  const getLevelColor = (level: string) => {
    switch (level) {
      case "strong": return "bg-green-100 text-green-600 border-green-200";
      case "good": return "bg-blue-100 text-blue-600 border-blue-200";
      case "watch": return "bg-yellow-100 text-yellow-600 border-yellow-200";
      case "avoid": return "bg-red-100 text-red-600 border-red-200";
      default: return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const getLevelText = (level: string) => {
    switch (level) {
      case "strong": return "强烈推荐";
      case "good": return "推荐";
      case "watch": return "观望";
      case "avoid": return "回避";
      default: return "未知";
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "low": return "bg-green-50 text-green-600";
      case "medium": return "bg-yellow-50 text-yellow-600";
      case "high": return "bg-red-50 text-red-600";
      default: return "bg-slate-50 text-slate-600";
    }
  };

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
    <div className="space-y-3">
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
            <span className={`text-xs font-medium ml-1 ${summary.fire.increase_ratio >= 0 ? "text-red-500" : "text-green-500"}`}>
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
            <TrendingUp className="w-4 h-4 text-red-500" />
          ) : profitStatus === "loss" ? (
            <TrendingDown className="w-4 h-4 text-green-500" />
          ) : (
            <Minus className="w-4 h-4 text-slate-400" />
          )}
          label="策略收益"
          value={Math.abs(stats.profit).toFixed(2)}
          unit="元"
          valueColor={profitStatus === "profit" ? "text-red-600" : profitStatus === "loss" ? "text-green-600" : "text-slate-600"}
          prefix={profitStatus === "profit" ? "+" : profitStatus === "loss" ? "-" : ""}
          subValue={allSectionItems.length > 0 ? (
            <span className={`text-xs font-medium ml-1 ${stats.profitPercent >= 0 ? "text-red-500" : "text-green-500"}`}>
              {stats.profitPercent >= 0 ? "↑" : "↓"}{Math.abs(stats.profitPercent).toFixed(2)}%
            </span>
          ) : null}
        />
      </div>

      {top3.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-yellow-500" />
              <span className="text-sm font-medium text-slate-700">策略推荐榜 TOP3</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentIndex(prev => (prev - 1 + top3.length) % top3.length)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-400 w-8 text-center">
                {currentIndex + 1}/{top3.length}
              </span>
              <button
                onClick={() => setCurrentIndex(prev => (prev + 1) % top3.length)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
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
                      index === 0 ? "bg-yellow-100 text-yellow-600" :
                      index === 1 ? "bg-slate-100 text-slate-500" :
                      "bg-orange-100 text-orange-500"
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 text-sm truncate">{rec.strategy_name}</span>
                        <span className={`px-1.5 py-0.5 text-[10px] rounded border ${getLevelColor(rec.level)}`}>
                          {getLevelText(rec.level)}
                        </span>
                        <span className={`px-1.5 py-0.5 text-[10px] rounded ${getRiskColor(rec.risk_level)}`}>
                          {rec.risk_level === "low" ? "低风险" : rec.risk_level === "medium" ? "中风险" : "高风险"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span>评分: <span className="font-medium">{rec.score}</span></span>
                        <span>收益率: <span className={`font-medium ${rec.profit_ratio >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {rec.profit_ratio >= 0 ? "+" : ""}{rec.profit_ratio.toFixed(1)}%
                        </span></span>
                        <span>预计收益: <span className={`font-medium ${rec.expected_profit_fire >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {rec.expected_profit_fire >= 0 ? "+" : ""}{rec.expected_profit_fire.toFixed(0)}火
                        </span></span>
                      </div>
                      {rec.reasons.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {rec.reasons.slice(0, 2).map((reason, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-600 rounded">
                              {reason}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-bold ${
                        rec.score >= 80 ? "text-green-600" :
                        rec.score >= 60 ? "text-blue-600" :
                        rec.score >= 40 ? "text-yellow-600" :
                        "text-red-600"
                      }`}>
                        {rec.score}
                      </div>
                      <div className="text-[10px] text-slate-400">分</div>
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
                  index === currentIndex ? "bg-blue-500" : "bg-slate-200"
                }`}
              />
            ))}
          </div>
        </div>
      )}
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
