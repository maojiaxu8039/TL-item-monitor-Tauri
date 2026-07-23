import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, ArrowDownCircle, ArrowUpCircle, CalendarDays } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { cmd } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { queryKeys } from "@/lib/queryKeys";
import { useVisiblePolling } from "@/hooks/useVisiblePolling";

type TimeRange = "all" | "3d" | "7d" | "14d" | "30d";
type DayRange = { start: number; end: number };

interface FireDataPoint {
  scraped_at: number;
  rmb_per_10k_fire: number;
  season_day: number;
}

import { DEFAULT_HISTORY_SEASON } from "@/lib/constants";

// SS 起始时间用动态加载（从数据库 seasons.started_at 读）
// 之前硬编码 SS12_START 导致 currentMaxDay 永远按错时间算，且图表按 day 合并时
// 两个赛季的 day 永远不会重叠（SS12=91-97，SS13=1-6）
// 新方案：按"距各自赛季起点 N 天"对齐，图表横轴统一用 day_offset

const timeRanges: { label: string; value: TimeRange; dayRange: DayRange }[] = [
  { label: "第1-3天", value: "3d", dayRange: { start: 1, end: 3 } },
  { label: "第1-7天", value: "7d", dayRange: { start: 1, end: 7 } },
  { label: "第1-14天", value: "14d", dayRange: { start: 1, end: 14 } },
  { label: "第1-30天", value: "30d", dayRange: { start: 1, end: 30 } },
  { label: "整个赛季", value: "all", dayRange: { start: 1, end: 999 } },
];

export default function FirePriceComparePage() {
  const [historySeason, setHistorySeason] = useState(DEFAULT_HISTORY_SEASON);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [customDayRange, setCustomDayRange] = useState<DayRange>({ start: 1, end: 7 });
  const [useCustomRange, setUseCustomRange] = useState(false);
  const { marketContext } = useSectionRefresh();

  const currentSeason = marketContext.seasonId;
  const marketMode = marketContext.marketMode;
  const currentRefetchInterval = useVisiblePolling(5 * 60 * 1000);

  // 动态加载数据库所有赛季，供"对比赛季"下拉框使用
  const seasonsQuery = useQuery<Array<{ season_id: string; name: string; is_current: boolean; started_at: number | null; ended_at: number | null }>>({
    queryKey: queryKeys.seasons,
    queryFn: () => cmd.listSeasons(),
    staleTime: 60 * 1000,
  });

  // 给候选赛季发轻量探测（每赛季只查 1 条），用于过滤无数据的赛季
  const candidateIds = useMemo(() => {
    const list = seasonsQuery.data ?? [];
    return list
      .filter((s) => s.season_id !== currentSeason)
      .map((s) => s.season_id);
  }, [seasonsQuery.data, currentSeason]);

  // 并发探测每个候选赛季的火价数据条数（取 1 条就够判断是否有数据）
  const probesQuery = useQuery({
    queryKey: ["fire-price-probe", candidateIds, marketMode],
    queryFn: async () => {
      const results: Record<string, number> = {};
      await Promise.all(
        candidateIds.map(async (id) => {
          try {
            const rows = await cmd.getFireHistoryBySeason(id, marketMode, 1);
            results[id] = Array.isArray(rows) ? rows.length : 0;
          } catch {
            results[id] = 0;
          }
        }),
      );
      return results;
    },
    enabled: candidateIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // 过滤掉当前赛季和无数据的赛季
  const compareOptions = useMemo(() => {
    const list = seasonsQuery.data ?? [];
    const counts = probesQuery.data ?? {};
    return list
      .filter((s) => s.season_id !== currentSeason)
      .filter((s) => (counts[s.season_id] ?? 0) > 0)
      .sort((a, b) => b.season_id.localeCompare(a.season_id));
  }, [seasonsQuery.data, currentSeason, probesQuery.data]);

  // 第一次拿到列表后，若历史赛季不在列表里则兜底选最新的一个
  useEffect(() => {
    if (seasonsQuery.data && seasonsQuery.data.length > 0) {
      const ids = new Set(seasonsQuery.data.map((s) => s.season_id));
      if (!ids.has(historySeason)) {
        const fallback = compareOptions[0]?.season_id ?? "";
        if (fallback) setHistorySeason(fallback);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonsQuery.data]);

  // 动态获取当前赛季的 started_at（用于计算 currentMaxDay）
  const currentSeasonStart = seasonsQuery.data?.find((s) => s.season_id === currentSeason)?.started_at ?? null;

  // 计算每个赛季已经开了多少天（用 started_at）
  const currentMaxDay = useMemo(() => {
    if (!currentSeasonStart) return 30; // 数据库还没加载完时的兜底
    const days = Math.floor((Date.now() / 1000 - currentSeasonStart) / 86400) + 1;
    return Math.max(1, days);
  }, [currentSeasonStart]);

  const currentQuery = useQuery({
    queryKey: [...queryKeys.fireTrendCurrent, currentSeason, marketMode, timeRange],
    queryFn: () => cmd.getFireHistoryBySeason(currentSeason, marketMode, 99999),
    refetchInterval: currentRefetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
    enabled: !!currentSeason,
  });

  const historyQuery = useQuery({
    queryKey: [...queryKeys.fireTrendHistory, historySeason, marketMode, timeRange],
    queryFn: () => cmd.getFireHistoryBySeason(historySeason, marketMode, 99999),
    refetchIntervalInBackground: false,
    staleTime: 30 * 60 * 1000,
    enabled: !!historySeason,
  });

  const currentData = useMemo(() => (currentQuery.data || []) as FireDataPoint[], [currentQuery.data]);
  const historyData = useMemo(() => (historyQuery.data || []) as FireDataPoint[], [historyQuery.data]);

  const dayRange = useMemo((): DayRange | null => {
    if (useCustomRange) return customDayRange;
    const range = timeRanges.find(r => r.value === timeRange);
    return range?.dayRange ?? null;
  }, [useCustomRange, customDayRange, timeRange]);

  // 按"小时桶"对齐两个赛季：每个小时桶 = 一个数据点
  // 用各自的 season_day 字段（数据库存的）映射到 day_offset（从 1 开始）
  // season_day - min(season_day) + 1 = day_offset
  // 这样 SS12 数据（season_day=91-97）→ day_offset=1-7，与 SS13（season_day=1-6）→ day_offset=1-6 对齐
  const chartData = useMemo(() => {
    if (currentData.length === 0 && historyData.length === 0) return [];

    // 计算每个赛季的 day_offset（基于各自 season_day 字段，最小值为 1）
    const curMinDay = currentData.length > 0 ? Math.min(...currentData.map((r) => r.season_day)) : 1;
    const histMinDay = historyData.length > 0 ? Math.min(...historyData.map((r) => r.season_day)) : 1;

    // 按 (day_offset, hour) 分桶
    const currentByBucket = new Map<string, number>();
    const historyByBucket = new Map<string, number>();
    const bucketTs = new Map<string, number>();

    currentData.forEach((r) => {
      const dayOffset = r.season_day - curMinDay + 1;
      const hour = new Date(r.scraped_at * 1000).getHours();
      const key = `${dayOffset}-${hour}`;
      // 同一小时桶取最后一条（最新）
      currentByBucket.set(key, r.rmb_per_10k_fire);
      bucketTs.set(key, r.scraped_at);
    });

    historyData.forEach((r) => {
      const dayOffset = r.season_day - histMinDay + 1;
      const hour = new Date(r.scraped_at * 1000).getHours();
      const key = `${dayOffset}-${hour}`;
      historyByBucket.set(key, r.rmb_per_10k_fire);
      if (!bucketTs.has(key)) bucketTs.set(key, r.scraped_at);
    });

    // 过滤掉 0 值（异常/未采集）
    // 按 day_offset-hour 排序
    const allKeys = Array.from(new Set([...currentByBucket.keys(), ...historyByBucket.keys()]))
      .sort((a, b) => {
        const [dA, hA] = a.split("-").map(Number);
        const [dB, hB] = b.split("-").map(Number);
        if (dA !== dB) return dA - dB;
        return hA - hB;
      });

    return allKeys.map((key) => {
      const [dayOffset, hour] = key.split("-").map(Number);
      const ts = bucketTs.get(key) || 0;
      const date = new Date(ts * 1000);
      const month = date.getMonth() + 1;
      const dayOfMonth = date.getDate();
      const label = `${month}/${dayOfMonth} ${String(hour).padStart(2, "0")}:00`;
      const curVal = currentByBucket.get(key);
      const histVal = historyByBucket.get(key);
      return {
        label,
        sortKey: dayOffset * 100 + hour,
        dayOffset,
        hour,
        // 0 视为无效（数据未采集/异常），返回 null 让曲线断点
        current: curVal != null && curVal > 0 ? curVal : null,
        history: histVal != null && histVal > 0 ? histVal : null,
      };
    });
  }, [currentData, historyData]);

  const allValues = chartData.flatMap(d => [d.current, d.history]).filter((v): v is number => v !== null);
  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0;
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 100;
  const yDomain = [
    Math.max(0, Math.floor(minValue * 0.9)),
    Math.ceil(maxValue * 1.1)
  ];

  const filteredCurrentData = dayRange !== null
    ? currentData.filter(r => r.season_day >= dayRange.start && r.season_day <= dayRange.end)
    : currentData;
  const filteredHistoryData = dayRange !== null
    ? historyData.filter(r => r.season_day >= dayRange.start && r.season_day <= dayRange.end)
    : historyData;

  const currentAvg = filteredCurrentData.length > 0
    ? filteredCurrentData.reduce((sum, r) => sum + r.rmb_per_10k_fire, 0) / filteredCurrentData.length
    : 0;
  const historyAvg = filteredHistoryData.length > 0
    ? filteredHistoryData.reduce((sum, r) => sum + r.rmb_per_10k_fire, 0) / filteredHistoryData.length
    : 0;
  const currentHigh = filteredCurrentData.length > 0 ? Math.max(...filteredCurrentData.map((r) => r.rmb_per_10k_fire)) : 0;
  const currentLow = filteredCurrentData.length > 0 ? Math.min(...filteredCurrentData.map((r) => r.rmb_per_10k_fire)) : 0;
  const historyHigh = filteredHistoryData.length > 0 ? Math.max(...filteredHistoryData.map((r) => r.rmb_per_10k_fire)) : 0;
  const historyLow = filteredHistoryData.length > 0 ? Math.min(...filteredHistoryData.map((r) => r.rmb_per_10k_fire)) : 0;

  const handleCustomRangeChange = useCallback((field: 'start' | 'end', value: string) => {
    const num = parseInt(value);
    if (value === "" || isNaN(num)) {
      return;
    }
    const newRange = { ...customDayRange };
    if (field === 'start') {
      newRange.start = Math.max(1, Math.min(num, customDayRange.end));
    } else {
      newRange.end = Math.max(customDayRange.start, Math.min(num, currentMaxDay));
    }
    setCustomDayRange(newRange);
    setUseCustomRange(true);
    setTimeRange("all");
  }, [customDayRange, currentMaxDay]);

  const bestTimeAnalysis = useMemo(() => {
    if (filteredCurrentData.length === 0) return null;
    if (filteredCurrentData.length < 2) return { insufficient: true as const };

    const sortedData = [...filteredCurrentData].sort((a, b) => a.scraped_at - b.scraped_at);
    const allPrices = sortedData.map(r => r.rmb_per_10k_fire);
    const avgPrice = allPrices.reduce((a, b) => a + b, 0) / allPrices.length;
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);

    const globalMinIdx = sortedData.findIndex(r => r.rmb_per_10k_fire === minPrice);
    const globalMaxIdx = sortedData.findIndex(r => r.rmb_per_10k_fire === maxPrice);

    const minPoint = {
      day: sortedData[globalMinIdx].season_day,
      hour: new Date(sortedData[globalMinIdx].scraped_at * 1000).getHours(),
      price: minPrice,
    };

    const maxPoint = {
      day: sortedData[globalMaxIdx].season_day,
      hour: new Date(sortedData[globalMaxIdx].scraped_at * 1000).getHours(),
      price: maxPrice,
    };

    const groupByDay = new Map<number, { hour: number; price: number }[]>();
    sortedData.forEach(r => {
      const day = r.season_day;
      const hour = new Date(r.scraped_at * 1000).getHours();
      if (!groupByDay.has(day)) groupByDay.set(day, []);
      groupByDay.get(day)!.push({ hour, price: r.rmb_per_10k_fire });
    });

    const dailyStats = Array.from(groupByDay.entries()).map(([day, points]) => {
      const prices = points.map(p => p.price);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const minPoint = points.find(p => p.price === min) ?? points[0];
      const maxPoint = points.find(p => p.price === max) ?? points[0];
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      return { day, min, max, avg, minHour: minPoint.hour, maxHour: maxPoint.hour };
    });

    const avgDailyAvg = dailyStats.reduce((a, d) => a + d.avg, 0) / dailyStats.length;

    const lowDays = dailyStats.filter(d => d.avg < avgDailyAvg * 0.9).sort((a, b) => a.min - b.min);
    const highDays = dailyStats.filter(d => d.avg > avgDailyAvg * 1.1).sort((a, b) => b.max - a.max);

    const bestBuyTime = lowDays.length > 0
      ? {
          day: lowDays[0].day,
          hour: lowDays[0].minHour,
          price: lowDays[0].min,
          reason: `第${lowDays[0].day}天 ${String(lowDays[0].minHour).padStart(2, '0')}:00 均价最低 (${lowDays[0].avg.toFixed(0)}元)，最低达 ${lowDays[0].min.toFixed(0)}元`
        }
      : {
          day: minPoint.day,
          hour: minPoint.hour,
          price: minPoint.price,
          reason: `第${minPoint.day}天 ${String(minPoint.hour).padStart(2, '0')}:00 出现全赛季最低价 ${minPoint.price.toFixed(0)}元`
        };

    const bestSellTime = highDays.length > 0
      ? {
          day: highDays[0].day,
          hour: highDays[0].maxHour,
          price: highDays[0].max,
          reason: `第${highDays[0].day}天 ${String(highDays[0].maxHour).padStart(2, '0')}:00 均价最高 (${highDays[0].avg.toFixed(0)}元)，最高达 ${highDays[0].max.toFixed(0)}元`
        }
      : {
          day: maxPoint.day,
          hour: maxPoint.hour,
          price: maxPoint.price,
          reason: `第${maxPoint.day}天 ${String(maxPoint.hour).padStart(2, '0')}:00 出现全赛季最高价 ${maxPoint.price.toFixed(0)}元`
        };

    return { bestBuyTime, bestSellTime, avgPrice, minPrice, maxPrice, insufficient: false as const };
  }, [filteredCurrentData]);

  const renderBestTimeAnalysis = () => {
    if (!bestTimeAnalysis) return null;
    if (bestTimeAnalysis.insufficient) {
      return (
        <Surface padding="md">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="w-4 h-4 text-[var(--color-text-subtle)]" />
            <h3 className="text-sm font-semibold text-[var(--color-text)]">最佳交易时段分析</h3>
          </div>
          <EmptyState description="数据不足，无法分析" />
        </Surface>
      );
    }

    const { bestBuyTime, bestSellTime, avgPrice, minPrice, maxPrice } = bestTimeAnalysis;

    return (
      <Surface padding="md">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="w-4 h-4 text-[var(--color-text-subtle)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text)]">最佳交易时段分析</h3>
          <span className="text-xs text-[var(--color-text-subtle)]">
            基于 {currentSeason.toUpperCase()} {useCustomRange ? `第${customDayRange.start}-${customDayRange.end}天` : timeRange === "all" ? "整个赛季" : timeRange === "3d" ? "第1-3天" : timeRange === "7d" ? "第1-7天" : timeRange === "14d" ? "第1-14天" : "第1-30天"}数据统计
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Surface padding="md" className="bg-[rgba(34,197,94,0.1)] border-[rgba(34,197,94,0.25)]">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownCircle className="w-5 h-5 text-[var(--color-success)]" />
              <span className="text-sm font-medium text-[var(--color-success)]">最佳购买火时机</span>
            </div>
            <div className="text-xl font-bold text-[var(--color-success)]">
              第{bestBuyTime.day}天 {String(bestBuyTime.hour).padStart(2, '0')}:00
            </div>
            <div className="text-sm text-[var(--color-success)] font-medium mt-1">
              ¥{bestBuyTime.price.toFixed(2)}/万火
            </div>
            <div className="text-xs text-[var(--color-success)] mt-1">
              {bestBuyTime.reason}
            </div>
            <div className="text-xs text-[var(--color-success)] mt-2 pt-2 border-t border-[rgba(34,197,94,0.25)]">
              建议：火价低于均价时购入初火
            </div>
          </Surface>

          <Surface padding="md" className="bg-[rgba(239,68,68,0.1)] border-[rgba(239,68,68,0.25)]">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpCircle className="w-5 h-5 text-[var(--color-danger)]" />
              <span className="text-sm font-medium text-[var(--color-danger)]">最佳出售火时机</span>
            </div>
            <div className="text-xl font-bold text-[var(--color-danger)]">
              第{bestSellTime.day}天 {String(bestSellTime.hour).padStart(2, '0')}:00
            </div>
            <div className="text-sm text-[var(--color-danger)] font-medium mt-1">
              ¥{bestSellTime.price.toFixed(2)}/万火
            </div>
            <div className="text-xs text-[var(--color-danger)] mt-1">
              {bestSellTime.reason}
            </div>
            <div className="text-xs text-[var(--color-danger)] mt-2 pt-2 border-t border-[rgba(239,68,68,0.25)]">
              建议：火价高于均价时出售物品换RMB
            </div>
          </Surface>
        </div>

        <div className="mt-4 p-3 bg-[var(--color-panel-soft)] rounded-lg">
          <div className="text-xs text-[var(--color-text-subtle)] mb-2">赛季统计</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-[var(--color-text-subtle)]">均价</div>
              <div className="text-sm font-medium text-[var(--color-text)]">¥{avgPrice.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-text-subtle)]">最低价</div>
              <div className="text-sm font-medium text-[var(--color-success)]">¥{minPrice.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-text-subtle)]">最高价</div>
              <div className="text-sm font-medium text-[var(--color-danger)]">¥{maxPrice.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </Surface>
    );
  };

  return (
    <PageShell size="xl" className="space-y-5">
      <PageHeader
        title="火价分析"
        description="对比历史赛季火价走势，辅助交易决策"
        iconAsset="fire-price"
      />

      <Surface padding="sm">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-[var(--color-text-subtle)] shrink-0">对比赛季</span>
            <select
              value={historySeason}
              onChange={(e) => setHistorySeason(e.target.value)}
              disabled={compareOptions.length === 0}
              className="px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30 bg-[var(--color-panel)] disabled:opacity-60"
            >
              {compareOptions.length === 0 ? (
                <option value="">（加载中…）</option>
              ) : (
                compareOptions.map((s) => (
                  <option key={s.season_id} value={s.season_id}>
                    {s.season_id.toUpperCase()}
                    {s.name ? ` · ${s.name}` : ""}
                  </option>
                ))
              )}
            </select>
            <span className="text-sm text-[var(--color-text-subtle)]">|</span>
            <span className="text-sm font-medium text-[var(--color-text)]">{currentSeason.toUpperCase()}</span>
            <StatusBadge variant="primary">当前</StatusBadge>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-[var(--color-panel)] rounded-lg p-1">
              {timeRanges.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => {
                    setTimeRange(value);
                    setUseCustomRange(false);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    timeRange === value && !useCustomRange
                      ? "bg-[var(--color-brand)]/15 text-[var(--color-brand-gold)] shadow-sm border border-[var(--color-brand)]/30"
                      : "text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 md:ml-2">
              <CalendarDays className="w-4 h-4 text-[var(--color-text-subtle)]" />
              <span className="text-xs text-[var(--color-text-subtle)]">自定义</span>
              <input
                type="number"
                min={1}
                max={currentMaxDay}
                value={customDayRange.start}
                onChange={(e) => handleCustomRangeChange('start', e.target.value)}
                className="w-16 px-2 py-1 border border-[var(--color-border)] rounded text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
              />
              <span className="text-xs text-[var(--color-text-subtle)]">~</span>
              <input
                type="number"
                min={1}
                max={currentMaxDay}
                value={customDayRange.end}
                onChange={(e) => handleCustomRangeChange('end', e.target.value)}
                className="w-16 px-2 py-1 border border-[var(--color-border)] rounded text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
              />
              <span className="text-xs text-[var(--color-text-subtle)]">天</span>
              {useCustomRange && (
                <span className="text-xs text-[var(--color-brand)] ml-1">
                  (第{customDayRange.start}-{customDayRange.end}天)
                </span>
              )}
            </div>
          </div>
        </div>
      </Surface>

      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          label={`${currentSeason.toUpperCase()} 均价`}
          value={currentAvg > 0 ? (
            <span>
              <span className="text-xl font-bold text-[var(--color-text)]">{currentAvg.toFixed(2)}</span>
              <span className="text-xs text-[var(--color-text-subtle)] ml-1">元/万火</span>
            </span>
          ) : "--"}
        />
        <MetricCard
          label={`${currentSeason.toUpperCase()} 最高/最低`}
          value={currentHigh > 0 ? (
            <span className="text-xl font-bold text-[var(--color-text)]">
              {currentHigh.toFixed(2)}
              <span className="text-[var(--color-text-subtle)] mx-1">/</span>
              {currentLow.toFixed(2)}
            </span>
          ) : "--"}
        />
        <MetricCard
          label={`${historySeason.toUpperCase()} 均价`}
          value={historyAvg > 0 ? (
            <span>
              <span className="text-xl font-bold text-[var(--color-text-muted)]">{historyAvg.toFixed(2)}</span>
              <span className="text-xs text-[var(--color-text-subtle)] ml-1">元/万火</span>
            </span>
          ) : "--"}
        />
        <MetricCard
          label={`${historySeason.toUpperCase()} 最高/最低`}
          value={historyHigh > 0 ? (
            <span className="text-xl font-bold text-[var(--color-text-muted)]">
              {historyHigh.toFixed(2)}
              <span className="text-[var(--color-text-subtle)] mx-1">/</span>
              {historyLow.toFixed(2)}
            </span>
          ) : "--"}
        />
      </div>

      <Surface padding="md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">火价走势对比</h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[var(--color-text-subtle)] rounded" />
              <span className="text-[var(--color-text-subtle)]">{historySeason.toUpperCase()}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[var(--color-brand)] rounded" />
              <span className="text-[var(--color-text-subtle)]">{currentSeason.toUpperCase()}</span>
            </span>
          </div>
        </div>

        {currentQuery.isLoading || historyQuery.isLoading ? (
          <div className="h-64 flex items-center justify-center text-[var(--color-text-subtle)]">
            加载中...
          </div>
        ) : chartData.length === 0 ? (
          <EmptyState
            title="暂无数据"
            description="请先在数据监控页面同步火价数据"
            icon={BarChart2}
          />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--color-border)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(v: number) => `¥${v.toFixed(1)}`}
                tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  return (
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 shadow-lg" style={{ fontSize: "12px" }}>
                      <div className="text-[var(--color-text-subtle)] mb-1.5 font-medium">{label}</div>
                      {payload.map((entry, idx) => {
                        const isCurrent = entry.dataKey === "current";
                        const name = isCurrent ? currentSeason.toUpperCase() : historySeason.toUpperCase();
                        const color = isCurrent ? "var(--color-brand-gold)" : "var(--color-text-muted)";
                        return (
                          <div key={idx} className="flex items-center gap-2" style={{ color }}>
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-sm"
                              style={{
                                backgroundColor: color,
                                opacity: isCurrent ? 1 : 0.6,
                              }}
                            />
                            <span className="font-medium">{name}</span>
                            <span className="ml-auto font-semibold">
                              {entry.value != null ? `¥${Number(entry.value).toFixed(2)}/万火` : "--"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="history"
                stroke="var(--color-text-muted)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
                activeDot={{ r: 3, fill: "var(--color-text-muted)" }}
              />
              <Line
                type="monotone"
                dataKey="current"
                stroke="var(--color-brand)"
                strokeWidth={2}
                dot={false}
                connectNulls
                activeDot={{ r: 4, fill: "var(--color-brand)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Surface>

      {renderBestTimeAnalysis()}
    </PageShell>
  );
}
