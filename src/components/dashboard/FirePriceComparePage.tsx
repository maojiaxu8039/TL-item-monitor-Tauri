import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, XCircle, Info, Flame, BarChart2 } from "lucide-react";
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

  const compareQuery = useQuery({
    queryKey: ["fire-compare", historySeason, currentSeason, marketMode],
    queryFn: () => cmd.getFirePriceCompare(historySeason),
    refetchInterval: 60000,
    enabled: historySeason !== currentSeason,
  });

  const currentData = currentQuery.data || [];
  const historyData = historyQuery.data || [];
  const compareData = compareQuery.data;

  const getTrendIcon = () => {
    if (!compareData) return <Minus className="w-5 h-5 text-slate-400" />;
    switch (compareData.price_trend) {
      case "上涨":
        return <TrendingUp className="w-5 h-5 text-red-500" />;
      case "下跌":
        return <TrendingDown className="w-5 h-5 text-green-500" />;
      default:
        return <Minus className="w-5 h-5 text-slate-400" />;
    }
  };

  const getLevelColor = () => {
    if (!compareData) return "text-slate-400";
    switch (compareData.price_level) {
      case "偏高": return "text-red-500";
      case "偏低": return "text-green-500";
      default: return "text-blue-500";
    }
  };

  const getLevelBg = () => {
    if (!compareData) return "bg-slate-100";
    switch (compareData.price_level) {
      case "偏高": return "bg-red-50 border border-red-200";
      case "偏低": return "bg-green-50 border border-green-200";
      default: return "bg-blue-50 border border-blue-200";
    }
  };

  const latestCurrent = currentData[currentData.length - 1];
  const latestHistory = historyData[historyData.length - 1];
  const maxCurrent = currentData.length > 0 ? Math.max(...currentData.map((r: any) => r.rmb_per_10k_fire)) : 0;
  const minHistory = historyData.length > 0 ? Math.min(...historyData.map((r: any) => r.rmb_per_10k_fire)) : 0;

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    if (timeRange === "1h" || timeRange === "6h" || timeRange === "24h") {
      return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit" });
  };

  const currentChartData = currentData.map((r: any) => ({
    time: formatTime(r.scraped_at),
    price: r.rmb_per_10k_fire,
  }));

  const historyChartData = historyData.map((r: any) => ({
    time: formatTime(r.scraped_at),
    price: r.rmb_per_10k_fire,
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart2 className="w-5 h-5 text-orange-500" />
        <h1 className="text-lg font-semibold text-slate-800">火价对比分析</h1>
      </div>

      {/* Season Selector */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm text-slate-600">对比赛季：</span>
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
            {(["1h", "6h", "24h", "3d", "7d"] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  timeRange === range
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {range === "1h" ? "1小时" : range === "6h" ? "6小时" : range === "24h" ? "24小时" : range === "3d" ? "3天" : "7天"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Current Price Card */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-700">当前火价</h2>
          <span className="ml-auto text-xs text-slate-400">
            {currentSeason.toUpperCase()} 第{compareData?.current_day || 0} 天 {compareData?.current_hour || 0}:00
          </span>
        </div>

        <div className="flex items-end gap-6">
          <div className="text-4xl font-bold text-slate-800">
            {compareData?.current_price.toFixed(2) || latestCurrent?.rmb_per_10k_fire.toFixed(2) || "--"} <span className="text-lg font-normal text-slate-400">元/10K</span>
          </div>
          
          <div className={`flex-1 p-3 rounded-lg ${getLevelBg()}`}>
            <div className="flex items-center gap-2">
              {compareData?.price_level === "偏高" && <XCircle className="w-5 h-5 text-red-500" />}
              {compareData?.price_level === "偏低" && <CheckCircle className="w-5 h-5 text-green-500" />}
              {(!compareData || compareData.price_level === "正常") && <Info className="w-5 h-5 text-blue-500" />}
              <span className={`font-semibold ${getLevelColor()}`}>
                {compareData?.price_level || "加载中..."}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Trend & Compare */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            {getTrendIcon()}
            <h3 className="text-sm font-semibold text-slate-700">火价趋势</h3>
          </div>
          <div className={`text-2xl font-bold ${
            compareData?.price_trend === "上涨" ? "text-red-500" : 
            compareData?.price_trend === "下跌" ? "text-green-500" : "text-slate-600"
          }`}>
            {compareData?.price_trend || "--"}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-700">{historySeason.toUpperCase()} 同时间段均价</h3>
          </div>
          <div className="text-2xl font-bold text-slate-600">
            {compareData?.reference_price.toFixed(2) || "--"} <span className="text-sm font-normal">元/10K</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <h3 className="text-sm font-semibold text-slate-700">建议入手价</h3>
          </div>
          <div className="text-2xl font-bold text-green-600">
            {compareData?.suggested_price.toFixed(2) || "--"} <span className="text-sm font-normal">元/10K</span>
          </div>
        </div>
      </div>

      {/* Risk Tip */}
      {compareData?.risk_tip && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-amber-800 mb-1">风险提示</h3>
              <p className="text-sm text-amber-700">{compareData.risk_tip}</p>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">火价走势对比</h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-slate-500">{currentSeason.toUpperCase()} 当前赛季</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-slate-500">{historySeason.toUpperCase()} 历史赛季</span>
            </span>
          </div>
        </div>

        {currentQuery.isLoading || historyQuery.isLoading ? (
          <div className="h-64 flex items-center justify-center text-slate-400">
            加载中...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {/* Current Season Chart */}
            <div>
              <div className="text-xs text-red-500 font-medium mb-2">{currentSeason.toUpperCase()} 当前赛季</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={currentChartData}>
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={{ stroke: "#E5E7EB" }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => `¥${v.toFixed(1)}`} tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value: any) => [`¥${Number(value).toFixed(2)} /万火`, "火价"]} />
                  <Line type="monotone" dataKey="price" stroke="#EF4444" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#EF4444" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* History Season Chart */}
            <div>
              <div className="text-xs text-blue-500 font-medium mb-2">{historySeason.toUpperCase()} 历史赛季</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={historyChartData}>
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={{ stroke: "#E5E7EB" }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => `¥${v.toFixed(1)}`} tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value: any) => [`¥${Number(value).toFixed(2)} /万火`, "火价"]} />
                  <Line type="monotone" dataKey="price" stroke="#3B82F6" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#3B82F6" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold text-slate-700">{currentSeason.toUpperCase()} 最高</h3>
          </div>
          <div className="text-2xl font-bold text-red-500">
            {maxCurrent > 0 ? maxCurrent.toFixed(2) : "--"} <span className="text-sm font-normal text-slate-400">元/10K</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <Minus className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">历史均价</h3>
          </div>
          <div className="text-2xl font-bold text-slate-600">
            {compareData?.history_avg.toFixed(2) || "--"} <span className="text-sm font-normal text-slate-400">元/10K</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-green-500" />
            <h3 className="text-sm font-semibold text-slate-700">{historySeason.toUpperCase()} 最低</h3>
          </div>
          <div className="text-2xl font-bold text-green-600">
            {minHistory > 0 ? minHistory.toFixed(2) : "--"} <span className="text-sm font-normal text-slate-400">元/10K</span>
          </div>
        </div>
      </div>
    </div>
  );
}
