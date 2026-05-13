import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, ArrowDownCircle, ArrowUpCircle, CalendarDays } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { cmd } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { MetricCard } from "@/components/ui/MetricCard";
import { Toolbar } from "@/components/ui/Toolbar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";

type TimeRange = "all" | "3d" | "7d" | "14d" | "30d";
type DayRange = { start: number; end: number };

interface FireDataPoint {
  scraped_at: number;
  rmb_per_10k_fire: number;
  season_day: number;
}

interface ChartPoint {
  label: string;
  sortKey: number;
  current: number | null;
  history: number | null;
}

const SS12_START = 1776355200;

export default function FirePriceComparePage() {
  const [historySeason, setHistorySeason] = useState("ss11");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [customDayRange, setCustomDayRange] = useState<DayRange>({ start: 1, end: 7 });
  const [useCustomRange, setUseCustomRange] = useState(false);
  const { marketContext } = useSectionRefresh();

  const currentSeason = marketContext.seasonId;
  const marketMode = marketContext.marketMode;

  const timeRanges: { label: string; value: TimeRange; dayRange: DayRange }[] = [
    { label: "第1-3天", value: "3d", dayRange: { start: 1, end: 3 } },
    { label: "第1-7天", value: "7d", dayRange: { start: 1, end: 7 } },
    { label: "第1-14天", value: "14d", dayRange: { start: 1, end: 14 } },
    { label: "第1-30天", value: "30d", dayRange: { start: 1, end: 30 } },
    { label: "整个赛季", value: "all", dayRange: { start: 1, end: 999 } },
  ];

  const currentQuery = useQuery({
    queryKey: ["fire-trend-current", currentSeason, marketMode, timeRange],
    queryFn: () => cmd.getFireHistoryBySeason(currentSeason, marketMode, 99999),
    refetchInterval: 60000,
    enabled: !!currentSeason,
  });

  const historyQuery = useQuery({
    queryKey: ["fire-trend-history", historySeason, marketMode, timeRange],
    queryFn: () => cmd.getFireHistoryBySeason(historySeason, marketMode, 99999),
    refetchInterval: 60000,
    enabled: !!historySeason,
  });

  const currentData: FireDataPoint[] = (currentQuery.data || []) as FireDataPoint[];
  const historyData: FireDataPoint[] = (historyQuery.data || []) as FireDataPoint[];

  const currentMaxDay = useMemo(() => {
    const now = Date.now() / 1000;
    const daysSinceStart = Math.floor((now - SS12_START) / 86400) + 1;
    return Math.max(1, daysSinceStart);
  }, []);

  const getDayRange = (): DayRange | null => {
    if (useCustomRange) {
      return customDayRange;
    }
    const range = timeRanges.find(r => r.value === timeRange);
    return range?.dayRange ?? null;
  };

  const buildChartData = (): ChartPoint[] => {
    const dayRange = getDayRange();

    let filteredCurrent = currentData;
    let filteredHistory = historyData;

    if (dayRange !== null) {
      filteredCurrent = currentData.filter(r => r.season_day >= dayRange.start && r.season_day <= dayRange.end);
      filteredHistory = historyData.filter(r => r.season_day >= dayRange.start && r.season_day <= dayRange.end);
    }

    const currentByDayHour = new Map<string, number>();
    const historyByDayHour = new Map<string, number>();
    const currentTimestamps = new Map<string, number>();
    const historyTimestamps = new Map<string, number>();

    filteredCurrent.forEach((r) => {
      const hour = new Date(r.scraped_at * 1000).getHours();
      const key = `${r.season_day}-${hour}`;
      if (!currentByDayHour.has(key)) {
        currentByDayHour.set(key, r.rmb_per_10k_fire);
        currentTimestamps.set(key, r.scraped_at);
      }
    });

    filteredHistory.forEach((r) => {
      const hour = new Date(r.scraped_at * 1000).getHours();
      const key = `${r.season_day}-${hour}`;
      if (!historyByDayHour.has(key)) {
        historyByDayHour.set(key, r.rmb_per_10k_fire);
        historyTimestamps.set(key, r.scraped_at);
      }
    });

    const allKeys = new Set([
      ...currentByDayHour.keys(),
      ...historyByDayHour.keys(),
    ]);

    const sortedKeys = Array.from(allKeys).sort((a, b) => {
      const tsA = currentTimestamps.get(a) || historyTimestamps.get(a) || 0;
      const tsB = currentTimestamps.get(b) || historyTimestamps.get(b) || 0;
      return tsA - tsB;
    });

    return sortedKeys.map((key) => {
      const [day, hour] = key.split("-").map(Number);
      const date = new Date((currentTimestamps.get(key) || historyTimestamps.get(key) || 0) * 1000);
      const month = date.getMonth() + 1;
      const dayOfMonth = date.getDate();
      const label = `${month}/${dayOfMonth} ${String(hour).padStart(2, "0")}:00`;
      return {
        label,
        sortKey: (currentTimestamps.get(key) || historyTimestamps.get(key) || 0),
        current: currentByDayHour.get(key) ?? null,
        history: historyByDayHour.get(key) ?? null,
      };
    });
  };

  const chartData = buildChartData();

  const allValues = chartData.flatMap(d => [d.current, d.history]).filter((v): v is number => v !== null);
  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0;
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 100;
  const yDomain = [
    Math.max(0, Math.floor(minValue * 0.9)),
    Math.ceil(maxValue * 1.1)
  ];

  const dayRange = getDayRange();
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

  const handleCustomRangeChange = (field: 'start' | 'end', value: string) => {
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
  };

  const renderBestTimeAnalysis = () => {
    if (filteredCurrentData.length === 0) return null;

    const sortedData = [...filteredCurrentData].sort((a, b) => a.scraped_at - b.scraped_at);

    if (sortedData.length < 2) {
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
      timestamp: sortedData[globalMinIdx].scraped_at,
    };

    const maxPoint = {
      day: sortedData[globalMaxIdx].season_day,
      hour: new Date(sortedData[globalMaxIdx].scraped_at * 1000).getHours(),
      price: maxPrice,
      timestamp: sortedData[globalMaxIdx].scraped_at,
    };

    const groupByDay = new Map<number, { hour: number; price: number; timestamp: number }[]>();
    sortedData.forEach(r => {
      const day = r.season_day;
      const hour = new Date(r.scraped_at * 1000).getHours();
      if (!groupByDay.has(day)) {
        groupByDay.set(day, []);
      }
      groupByDay.get(day)!.push({ hour, price: r.rmb_per_10k_fire, timestamp: r.scraped_at });
    });

    const dailyStats = Array.from(groupByDay.entries()).map(([day, points]) => {
      const prices = points.map(p => p.price);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const minPoint = points.find(p => p.price === min)!;
      const maxPoint = points.find(p => p.price === max)!;
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      return { day, min, max, avg, minHour: minPoint.hour, maxHour: maxPoint.hour, minTimestamp: minPoint.timestamp, maxTimestamp: maxPoint.timestamp };
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
          <Surface padding="md" className="bg-[rgba(34,197,94,0.1)] border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-green-700">最佳购买火时机</span>
            </div>
            <div className="text-xl font-bold text-green-800">
              第{bestBuyTime.day}天 {String(bestBuyTime.hour).padStart(2, '0')}:00
            </div>
            <div className="text-sm text-green-600 font-medium mt-1">
              ¥{bestBuyTime.price.toFixed(2)}/万火
            </div>
            <div className="text-xs text-green-600 mt-1">
              {bestBuyTime.reason}
            </div>
            <div className="text-xs text-green-500 mt-2 pt-2 border-t border-green-200">
              建议：火价低于均价时购入初火
            </div>
          </Surface>

          <Surface padding="md" className="bg-[rgba(239,68,68,0.1)] border-red-200">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpCircle className="w-5 h-5 text-red-600" />
              <span className="text-sm font-medium text-red-700">最佳出售火时机</span>
            </div>
            <div className="text-xl font-bold text-red-800">
              第{bestSellTime.day}天 {String(bestSellTime.hour).padStart(2, '0')}:00
            </div>
            <div className="text-sm text-red-600 font-medium mt-1">
              ¥{bestSellTime.price.toFixed(2)}/万火
            </div>
            <div className="text-xs text-red-600 mt-1">
              {bestSellTime.reason}
            </div>
            <div className="text-xs text-red-500 mt-2 pt-2 border-t border-red-200">
              建议：火价高于均价时出售物品换RMB
            </div>
          </Surface>
        </div>

        <div className="mt-4 p-3 bg-[var(--color-panel-soft)] rounded-lg">
          <div className="text-xs text-[var(--color-text-subtle)] mb-2">赛季统计</div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-[var(--color-text-subtle)]">均价</div>
              <div className="text-sm font-medium text-[var(--color-text)]">¥{avgPrice.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-text-subtle)]">最低价</div>
              <div className="text-sm font-medium text-green-600">¥{minPrice.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-text-subtle)]">最高价</div>
              <div className="text-sm font-medium text-red-600">¥{maxPrice.toFixed(2)}</div>
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
        <Toolbar className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--color-text-subtle)]">对比赛季</span>
            <select
              value={historySeason}
              onChange={(e) => setHistorySeason(e.target.value)}
              className="px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30 bg-[var(--color-panel)]"
            >
              <option value="ss11">SS11</option>
            </select>
            <span className="text-sm text-slate-300">|</span>
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
                      ? "bg-[var(--color-panel)] text-[var(--color-text)] shadow-sm"
                      : "text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 ml-2">
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
        </Toolbar>
      </Surface>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
              <span className="text-slate-300 mx-1">/</span>
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
              <span className="text-slate-300 mx-1">/</span>
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
              <span className="w-3 h-0.5 bg-slate-400 rounded" />
              <span className="text-[var(--color-text-subtle)]">{historySeason.toUpperCase()}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-orange-500 rounded" />
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
                formatter={(value: any) => [`¥${Number(value).toFixed(2)}/万火`]}
                contentStyle={{ borderRadius: "8px", border: "1px solid var(--color-border)", fontSize: "12px" }}
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
