import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, ArrowUpCircle, ArrowDownCircle, CalendarDays } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { cmd } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";

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

const SS12_START = 1776355200; // 2026-04-17 00:00:00 UTC+8

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

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
          <BarChart2 className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-800">火价分析</h1>
          <p className="text-xs text-slate-400">对比历史赛季火价走势，辅助交易决策</p>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">对比赛季</span>
            <select
              value={historySeason}
              onChange={(e) => setHistorySeason(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white"
            >
              <option value="ss11">SS11</option>
            </select>
            <span className="text-sm text-slate-300">|</span>
            <span className="text-sm font-medium text-slate-700">{currentSeason.toUpperCase()}</span>
            <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">当前</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              {timeRanges.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => {
                    setTimeRange(value);
                    setUseCustomRange(false);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    timeRange === value && !useCustomRange
                      ? "bg-white text-slate-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            
            <div className="flex items-center gap-2 ml-2">
              <CalendarDays className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-500">自定义</span>
              <input
                type="number"
                min={1}
                max={currentMaxDay}
                value={customDayRange.start}
                onChange={(e) => handleCustomRangeChange('start', e.target.value)}
                className="w-16 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <span className="text-xs text-slate-400">~</span>
              <input
                type="number"
                min={1}
                max={currentMaxDay}
                value={customDayRange.end}
                onChange={(e) => handleCustomRangeChange('end', e.target.value)}
                className="w-16 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <span className="text-xs text-slate-400">天</span>
              {useCustomRange && (
                <span className="text-xs text-blue-500 ml-1">
                  (第{customDayRange.start}-{customDayRange.end}天)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-400 mb-1">{currentSeason.toUpperCase()} 均价</div>
          <div className="text-xl font-bold text-slate-800">
            {currentAvg > 0 ? currentAvg.toFixed(2) : "--"}
            <span className="text-xs font-normal text-slate-400 ml-1">元/万火</span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-400 mb-1">{currentSeason.toUpperCase()} 最高 / 最低</div>
          <div className="text-xl font-bold text-slate-800">
            {currentHigh > 0 ? currentHigh.toFixed(2) : "--"}
            <span className="text-slate-300 mx-1">/</span>
            {currentLow > 0 ? currentLow.toFixed(2) : "--"}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-400 mb-1">{historySeason.toUpperCase()} 均价</div>
          <div className="text-xl font-bold text-slate-600">
            {historyAvg > 0 ? historyAvg.toFixed(2) : "--"}
            <span className="text-xs font-normal text-slate-400 ml-1">元/万火</span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-400 mb-1">{historySeason.toUpperCase()} 最高 / 最低</div>
          <div className="text-xl font-bold text-slate-600">
            {historyHigh > 0 ? historyHigh.toFixed(2) : "--"}
            <span className="text-slate-300 mx-1">/</span>
            {historyLow > 0 ? historyLow.toFixed(2) : "--"}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">火价走势对比</h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-slate-400 rounded" />
              <span className="text-slate-500">{historySeason.toUpperCase()}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-orange-500 rounded" />
              <span className="text-slate-500">{currentSeason.toUpperCase()}</span>
            </span>
          </div>
        </div>

        {currentQuery.isLoading || historyQuery.isLoading ? (
          <div className="h-64 flex items-center justify-center text-slate-400">
            加载中...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400">
            暂无数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                tickLine={false}
                axisLine={{ stroke: "#E5E7EB" }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(v: number) => `¥${v.toFixed(1)}`}
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value: any) => [`¥${Number(value).toFixed(2)}/万火`]}
                contentStyle={{ borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "12px" }}
              />
              <Line
                type="monotone"
                dataKey="history"
                stroke="#94A3B8"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
                activeDot={{ r: 3, fill: "#94A3B8" }}
              />
              <Line
                type="monotone"
                dataKey="current"
                stroke="#F97316"
                strokeWidth={2}
                dot={false}
                connectNulls
                activeDot={{ r: 4, fill: "#F97316" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Best Time Analysis */}
      {filteredCurrentData.length > 0 && (() => {
        const sortedData = [...filteredCurrentData].sort((a, b) => a.scraped_at - b.scraped_at);
        
        if (sortedData.length < 2) {
          return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays className="w-4 h-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-700">最佳交易时段分析</h3>
              </div>
              <div className="text-slate-400">数据不足，无法分析</div>
            </div>
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

        const rangeLabel = useCustomRange
          ? `第${customDayRange.start}-${customDayRange.end}天`
          : timeRange === "all" ? "整个赛季"
          : timeRange === "3d" ? "第1-3天"
          : timeRange === "7d" ? "第1-7天"
          : timeRange === "14d" ? "第1-14天"
          : "第1-30天";

        const analysisTitle = `基于 ${currentSeason.toUpperCase()} ${rangeLabel}数据统计`;

        return (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-700">最佳交易时段分析</h3>
              <span className="text-xs text-slate-400">{analysisTitle}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
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
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowUpCircle className="w-5 h-5 text-orange-600" />
                  <span className="text-sm font-medium text-orange-700">最佳出售火时机</span>
                </div>
                <div className="text-xl font-bold text-orange-800">
                  第{bestSellTime.day}天 {String(bestSellTime.hour).padStart(2, '0')}:00
                </div>
                <div className="text-sm text-orange-600 font-medium mt-1">
                  ¥{bestSellTime.price.toFixed(2)}/万火
                </div>
                <div className="text-xs text-orange-600 mt-1">
                  {bestSellTime.reason}
                </div>
                <div className="text-xs text-orange-500 mt-2 pt-2 border-t border-orange-200">
                  建议：火价高于均价时出售物品换RMB
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-slate-50 rounded-lg">
              <div className="text-xs text-slate-500 mb-2">赛季统计</div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-slate-400">均价</div>
                  <div className="text-sm font-medium text-slate-700">¥{avgPrice.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">最低价</div>
                  <div className="text-sm font-medium text-green-600">¥{minPrice.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">最高价</div>
                  <div className="text-sm font-medium text-orange-600">¥{maxPrice.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
