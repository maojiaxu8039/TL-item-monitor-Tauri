import { useQuery } from "@tanstack/react-query"
import { useState, useEffect, useMemo, useCallback, memo } from "react"
import { Package, Flame, History, Award, ChevronLeft, ChevronRight } from "lucide-react"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"
import { MetricCard } from "@/components/ui/MetricCard"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { cmd } from "@/lib/commands"
import type { DashboardSummary, StrategyWithCosts, FirePriceUI } from "@/lib/commands"
import { queryKeys } from "@/lib/queryKeys"
import { calculateRecommendations } from "@/lib/strategyRecommend"
import { ErrorState } from "@/components/ui/LoadingState"

function formatFirePriceCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (abs >= 10000) return `${(value / 10000).toFixed(1)}万`;
  if (abs >= 1000) return value.toFixed(0);
  return value.toFixed(1);
}

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

  const { data: summary, isLoading: summaryLoading, isError: summaryError, refetch: refetchSummary } = useQuery<DashboardSummary>({
    queryKey: [...queryKeys.dashboardSummary, marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getDashboardSummary(),
    enabled: marketContextReady,
    staleTime: 30 * 1000,
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

  const isLoading = summaryLoading || strategiesLoading

  const rmbPer10kFire = summary?.fire?.rmb_per_10k_fire
  const hasFirePrice = rmbPer10kFire !== null && rmbPer10kFire !== undefined

  const stats = useMemo(() => {
    return {
      itemCount: summary?.item_count ?? 0,
      currentFire: hasFirePrice ? rmbPer10kFire : null,
    };
  }, [summary, hasFirePrice, rmbPer10kFire]);

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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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

  if (summaryError) {
    return (
      <div className="surface">
        <ErrorState
          title="市场概览加载失败"
          message="无法读取本地市场数据，请确认应用服务已正常启动。"
          onRetry={() => void refetchSummary()}
        />
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
          value={hasFirePrice ? stats.currentFire!.toFixed(2) : "暂无数据"}
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
          label="套利比价"
          value={(summary?.profitable_arbitrage_count ?? 0).toString()}
          icon={History}
          iconBg="bg-[rgba(167,139,250,0.12)]"
          iconColor="text-[var(--color-ai)]"
          helper={
            <div className="flex items-center gap-1 text-xs text-[var(--color-text-subtle)]">
              <span>可套利配方</span>
              {(summary?.profitable_arbitrage_count ?? 0) > 0 && (
                <span className="rounded bg-[rgba(167,139,250,0.18)] px-1 text-[10px] font-medium text-[var(--color-ai)]">
                  机会
                </span>
              )}
            </div>
          }
        />
        <MetricCard
          label="囤货出货"
          value={formatFirePriceCompact(summary?.position_cost_fire ?? 0)}
          icon={Package}
          iconBg="bg-[rgba(34,197,94,0.1)]"
          iconColor="text-[var(--color-success)]"
          helper={
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-subtle)]">
                <span>持仓成本</span>
                <span className="tabular-nums text-[var(--color-text-muted)]">
                  ¥{(summary?.position_cost_rmb ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-subtle)]">
                <span>当前估值</span>
                <span className="tabular-nums text-[var(--color-brand-gold)]">
                  ¥{(summary?.position_current_value_rmb ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
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
                aria-label="上一条策略推荐"
                className="rounded-lg p-1 text-[var(--color-text-subtle)] transition-colors hover:bg-[rgba(255,184,0,0.08)] hover:text-[var(--color-brand-gold)]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="w-8 text-center text-xs text-[var(--color-text-subtle)]">
                {currentIndex + 1}/{top3.length}
              </span>
              <button
                onClick={handleNextSlide}
                aria-label="下一条策略推荐"
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
