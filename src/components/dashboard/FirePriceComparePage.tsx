import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, TrendingUp, TrendingDown, Minus, Clock, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { cmd } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";

type TimeRange = "1h" | "6h" | "24h" | "3d" | "7d";

const RANGE_HOURS: Record<TimeRange, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "3d": 72,
  "7d": 168,
};

export default function FirePriceComparePage() {
  const [historySeason, setHistorySeason] = useState("ss11");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const { marketContext } = useSectionRefresh();

  const currentSeason = marketContext.seasonId;
  const marketMode = marketContext.marketMode;

  const currentQuery = useQuery({
    queryKey: ["fire-trend-current", currentSeason, marketMode, timeRange],
    queryFn: () => cmd.getFireHistory(RANGE_HOURS[timeRange]),
    refetchInterval: 60000,
    enabled: !!currentSeason,
  });

  const historyQuery = useQuery({
    queryKey: ["fire-trend-history", historySeason, marketMode, timeRange],
    queryFn: () => cmd.getFireHistory(RANGE_HOURS[timeRange]),
    refetchInterval: 60000,
    enabled: !!historySeason,
  });

  const currentData = currentQuery.data || [];
  const historyData = historyQuery.data || [];

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    if (timeRange === "1h" || timeRange === "6h" || timeRange === "24h") {
      return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit" });
  };

  const chartData = currentData.map((r: any) => ({
    time: formatTime(r.scraped_at),
    current: r.rmb_per_10k_fire,
    history: null as number | null,
  }));

  historyData.forEach((r: any) => {
    chartData.push({
      time: formatTime(r.scraped_at),
      current: null as number | null,
      history: r.rmb_per_10k_fire,
    });
  });

  chartData.sort((a: any, b: any) => a.time.localeCompare(b.time));

  const timeRanges: { label: string; value: TimeRange }[] = [
    { label: "1小时", value: "1h" },
    { label: "6小时", value: "6h" },
    { label: "24小时", value: "24h" },
    { label: "3天", value: "3d" },
    { label: "7天", value: "7d" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart2 className="w-5 h-5 text-orange-500" />
        <h1 className="text-lg font-semibold text-slate-800">火价分析</h1>
      </div>

      {/* Season & Range Selector */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm text-slate-500">对比赛季：</span>
          <select
            value={historySeason}
            onChange={(e) => setHistorySeason(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="ss11">SS11</option>
            <option value="ss10">SS10</option>
            <option value="ss09">SS09</option>
            <option value="ss08">SS08</option>
          </select>
          <span className="text-sm text-slate-400">vs</span>
          <span className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
            {currentSeason.toUpperCase()}
          </span>
          
          <div className="ml-auto flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {timeRanges.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setTimeRange(value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  timeRange === value
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dual Line Chart - 火价走势 */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">火价走势</h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-red-500 rounded" />
              <span className="text-slate-500">{currentSeason.toUpperCase()}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-blue-500 rounded" />
              <span className="text-slate-500">{historySeason.toUpperCase()}</span>
            </span>
          </div>
        </div>

        {currentQuery.isLoading || historyQuery.isLoading ? (
          <div className="h-64 flex items-center justify-center text-slate-400">
            加载中...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <XAxis 
                dataKey="time" 
                tick={{ fontSize: 11, fill: "#9CA3AF" }} 
                tickLine={false}
                axisLine={{ stroke: "#E5E7EB" }}
                interval="preserveStartEnd"
              />
              <YAxis 
                tickFormatter={(v: number) => `¥${v.toFixed(1)}`}
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip 
                formatter={(value: any) => [`¥${Number(value).toFixed(2)}/万火`]}
              />
              <Line 
                type="monotone" 
                dataKey="current" 
                stroke="#EF4444" 
                strokeWidth={2} 
                dot={false}
                connectNulls
                activeDot={{ r: 4, fill: "#EF4444" }}
              />
              <Line 
                type="monotone" 
                dataKey="history" 
                stroke="#3B82F6" 
                strokeWidth={2} 
                strokeDasharray="5 5"
                dot={false}
                connectNulls
                activeDot={{ r: 4, fill: "#3B82F6" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Stats Bottom */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold text-slate-700">{historySeason.toUpperCase()} 当日最高</h3>
          </div>
          <div className="text-2xl font-bold text-red-500">
            {historyData.length > 0 ? Math.max(...historyData.map((r: any) => r.rmb_per_10k_fire)).toFixed(2) : "--"} <span className="text-sm font-normal text-slate-400">元/万火</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <Minus className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">{historySeason.toUpperCase()} 当日最低</h3>
          </div>
          <div className="text-2xl font-bold text-slate-600">
            {historyData.length > 0 ? Math.min(...historyData.map((r: any) => r.rmb_per_10k_fire)).toFixed(2) : "--"} <span className="text-sm font-normal text-slate-400">元/万火</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-green-500" />
            <h3 className="text-sm font-semibold text-slate-700">{currentSeason.toUpperCase()} 最低价格</h3>
          </div>
          <div className="text-2xl font-bold text-green-600">
            {currentData.length > 0 ? Math.min(...currentData.map((r: any) => r.rmb_per_10k_fire)).toFixed(2) : "--"} <span className="text-sm font-normal text-slate-400">元/万火</span>
          </div>
        </div>
      </div>

      {/* Best Time Analysis */}
      {currentData.length > 0 && (() => {
        const hourlyPrices: Record<number, number[]> = {};
        currentData.forEach((r: any) => {
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
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-purple-500" />
              <h3 className="text-sm font-semibold text-slate-700">{currentSeason.toUpperCase()} 最佳交易时段分析</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowUpCircle className="w-5 h-5 text-red-500" />
                  <span className="text-sm font-semibold text-red-700">最适合出售火价</span>
                </div>
                <div className="text-3xl font-bold text-red-600">
                  {bestSell ? `${String(bestSell.hour).padStart(2, '0')}:00` : "--"}
                </div>
                <div className="text-sm text-red-500 mt-1">
                  均价 ¥{bestSell?.avg.toFixed(2)}/万火
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowDownCircle className="w-5 h-5 text-green-500" />
                  <span className="text-sm font-semibold text-green-700">最适合收火</span>
                </div>
                <div className="text-3xl font-bold text-green-600">
                  {bestBuy ? `${String(bestBuy.hour).padStart(2, '0')}:00` : "--"}
                </div>
                <div className="text-sm text-green-500 mt-1">
                  均价 ¥{bestBuy?.avg.toFixed(2)}/万火
                </div>
              </div>
            </div>

            <div className="mt-4 text-xs text-slate-400">
              基于 {currentSeason.toUpperCase()} 历史数据按小时段统计分析
            </div>
          </div>
        );
      })()}
    </div>
  );
}