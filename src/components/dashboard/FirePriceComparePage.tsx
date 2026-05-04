import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, ArrowUpCircle, ArrowDownCircle, CalendarDays } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { cmd } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";

type TimeRange = "12h" | "24h" | "3d" | "7d" | "30d" | "all";

const RANGE_HOURS: Record<TimeRange, number> = {
  "12h": 12,
  "24h": 24,
  "3d": 72,
  "7d": 168,
  "30d": 720,
  "all": 9999,
};

// Day limits for each time range
const RANGE_DAY_LIMITS: Record<TimeRange, number> = {
  "12h": 1,
  "24h": 1,
  "3d": 3,
  "7d": 7,
  "30d": 30,
  "all": 9999,
};

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

export default function FirePriceComparePage() {
  const [historySeason, setHistorySeason] = useState("ss11");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const { marketContext } = useSectionRefresh();

  const currentSeason = marketContext.seasonId;
  const marketMode = marketContext.marketMode;

  // For short time ranges, use filtered data; for long ranges, use all data
  const isShortTimeRange = ["12h", "24h"].includes(timeRange);

  const currentQuery = useQuery({
    queryKey: ["fire-trend-current", currentSeason, marketMode, timeRange],
    queryFn: () => isShortTimeRange 
      ? cmd.getFireHistory(RANGE_HOURS[timeRange])
      : cmd.getFireHistoryBySeason(currentSeason, marketMode, RANGE_HOURS[timeRange]),
    refetchInterval: 60000,
    enabled: !!currentSeason,
  });

  const historyQuery = useQuery({
    queryKey: ["fire-trend-history", historySeason, marketMode, timeRange],
    queryFn: () => cmd.getFireHistoryBySeason(historySeason, marketMode, RANGE_HOURS[timeRange]),
    refetchInterval: 60000,
    enabled: !!historySeason,
  });

  const currentData: FireDataPoint[] = (currentQuery.data || []) as FireDataPoint[];
  const historyData: FireDataPoint[] = (historyQuery.data || []) as FireDataPoint[];

  // Build chart data
  const buildChartData = (): ChartPoint[] => {
    if (isShortTimeRange) {
      // Short time range: group by hour of day (00-23)
      const currentByHour: Record<number, number[]> = {};
      const historyByHour: Record<number, number[]> = {};

      currentData.forEach((r) => {
        const hour = new Date(r.scraped_at * 1000).getHours();
        if (!currentByHour[hour]) currentByHour[hour] = [];
        currentByHour[hour].push(r.rmb_per_10k_fire);
      });

      historyData.forEach((r) => {
        const hour = new Date(r.scraped_at * 1000).getHours();
        if (!historyByHour[hour]) historyByHour[hour] = [];
        historyByHour[hour].push(r.rmb_per_10k_fire);
      });

      // Create 24 hour slots
      const hours = timeRange === "12h" 
        ? [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]
        : Array.from({ length: 24 }, (_, i) => i);

      return hours.map((hour) => {
        const currentPrices = currentByHour[hour];
        const historyPrices = historyByHour[hour];
        return {
          label: `${String(hour).padStart(2, "0")}:00`,
          sortKey: hour,
          current: currentPrices ? currentPrices.reduce((a, b) => a + b, 0) / currentPrices.length : null,
          history: historyPrices ? historyPrices.reduce((a, b) => a + b, 0) / historyPrices.length : null,
        };
      });
    } else {
      // Long time range: aggregate by season day with limit
      const dayLimit = RANGE_DAY_LIMITS[timeRange];
      const currentByDay = new Map<number, number[]>();
      const historyByDay = new Map<number, number[]>();

      currentData.forEach((r) => {
        const day = r.season_day;
        if (day > dayLimit) return;
        if (!currentByDay.has(day)) currentByDay.set(day, []);
        currentByDay.get(day)!.push(r.rmb_per_10k_fire);
      });

      historyData.forEach((r) => {
        const day = r.season_day;
        if (day > dayLimit) return;
        if (!historyByDay.has(day)) historyByDay.set(day, []);
        historyByDay.get(day)!.push(r.rmb_per_10k_fire);
      });

      // Get all unique days up to limit
      const allDays = new Set([
        ...Array.from(currentByDay.keys()),
        ...Array.from(historyByDay.keys()),
      ]);

      return Array.from(allDays)
        .sort((a, b) => a - b)
        .map((day) => {
          const currentPrices = currentByDay.get(day);
          const historyPrices = historyByDay.get(day);
          return {
            label: `第${day}天`,
            sortKey: day,
            current: currentPrices ? currentPrices.reduce((a, b) => a + b, 0) / currentPrices.length : null,
            history: historyPrices ? historyPrices.reduce((a, b) => a + b, 0) / historyPrices.length : null,
          };
        });
    }
  };

  const chartData = buildChartData();

  // Calculate Y-axis domain to prevent negative values
  const allValues = chartData.flatMap(d => [d.current, d.history]).filter((v): v is number => v !== null);
  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0;
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 100;
  const yDomain = [
    Math.max(0, Math.floor(minValue * 0.9)),
    Math.ceil(maxValue * 1.1)
  ];

  const timeRanges: { label: string; value: TimeRange }[] = [
    { label: "12小时", value: "12h" },
    { label: "24小时", value: "24h" },
    { label: "3天", value: "3d" },
    { label: "7天", value: "7d" },
    { label: "30天", value: "30d" },
    { label: "整个赛季", value: "all" },
  ];

  // Filter data by time range for stats calculation
  const dayLimit = RANGE_DAY_LIMITS[timeRange];
  const filteredCurrentData = isShortTimeRange 
    ? currentData 
    : currentData.filter(r => r.season_day <= dayLimit);
  const filteredHistoryData = isShortTimeRange 
    ? historyData 
    : historyData.filter(r => r.season_day <= dayLimit);

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

          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {timeRanges.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setTimeRange(value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  timeRange === value
                    ? "bg-white text-slate-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
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
                interval={isShortTimeRange ? 0 : "preserveStartEnd"}
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
      {currentData.length > 0 && (() => {
        const hourlyPrices: Record<number, number[]> = {};
        currentData.forEach((r) => {
          const hour = new Date(r.scraped_at * 1000).getHours();
          if (!hourlyPrices[hour]) hourlyPrices[hour] = [];
          hourlyPrices[hour].push(r.rmb_per_10k_fire);
        });

        const hourlyAvg = Object.entries(hourlyPrices).map(([hour, prices]) => ({
          hour: parseInt(hour),
          avg: prices.reduce((a, b) => a + b, 0) / prices.length,
        }));

        const sortedByPrice = [...hourlyAvg].sort((a, b) => b.avg - a.avg);
        const bestSell = sortedByPrice[0];
        const bestBuy = sortedByPrice[sortedByPrice.length - 1];

        return (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-700">最佳交易时段分析</h3>
              <span className="text-xs text-slate-400">基于 {currentSeason.toUpperCase()} 数据统计</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowUpCircle className="w-4 h-4 text-slate-600" />
                  <span className="text-sm font-medium text-slate-700">最适合出售火价</span>
                </div>
                <div className="text-2xl font-bold text-slate-800">
                  {bestSell ? `${String(bestSell.hour).padStart(2, '0')}:00` : "--"}
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  均价 ¥{bestSell?.avg.toFixed(2)}/万火
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowDownCircle className="w-4 h-4 text-slate-600" />
                  <span className="text-sm font-medium text-slate-700">最适合收火</span>
                </div>
                <div className="text-2xl font-bold text-slate-800">
                  {bestBuy ? `${String(bestBuy.hour).padStart(2, '0')}:00` : "--"}
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  均价 ¥{bestBuy?.avg.toFixed(2)}/万火
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
