import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, XCircle, Info, Flame } from "lucide-react";
import { cmd } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";

export default function FirePriceComparePage() {
  const [historySeason, setHistorySeason] = useState("ss11");
  const { marketContext } = useSectionRefresh();

  const currentSeason = marketContext.seasonId;

  const { data, isLoading, error } = useQuery({
    queryKey: ["fire-price-compare", historySeason, currentSeason],
    queryFn: () => cmd.getFirePriceCompare(historySeason),
    refetchInterval: 60000,
  });

  const getTrendIcon = () => {
    if (!data) return <Minus className="w-5 h-5 text-slate-400" />;
    switch (data.price_trend) {
      case "上涨":
        return <TrendingUp className="w-5 h-5 text-red-500" />;
      case "下跌":
        return <TrendingDown className="w-5 h-5 text-green-500" />;
      default:
        return <Minus className="w-5 h-5 text-slate-400" />;
    }
  };

  const getLevelIcon = () => {
    if (!data) return <Info className="w-5 h-5 text-slate-400" />;
    switch (data.price_level) {
      case "偏高":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "偏低":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getLevelColor = () => {
    if (!data) return "text-slate-400";
    switch (data.price_level) {
      case "偏高":
        return "text-red-500";
      case "偏低":
        return "text-green-500";
      default:
        return "text-blue-500";
    }
  };

  const getLevelBg = () => {
    if (!data) return "bg-slate-100";
    switch (data.price_level) {
      case "偏高":
        return "bg-red-50 border border-red-200";
      case "偏低":
        return "bg-green-50 border border-green-200";
      default:
        return "bg-blue-50 border border-blue-200";
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Flame className="w-5 h-5 text-orange-500" />
        <h1 className="text-lg font-semibold text-slate-800">火价分析</h1>
      </div>

      {/* Season Selector */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center gap-4">
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
        </div>
      </div>

      {/* Current Price Card */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-700">当前火价</h2>
          <span className="ml-auto text-xs text-slate-400">
            {currentSeason.toUpperCase()} 第{data?.current_day || 0} 天 {data?.current_hour || 0}:00
          </span>
        </div>

        <div className="flex items-end gap-6">
          <div className="text-4xl font-bold text-slate-800">
            {data?.current_price.toFixed(2) || "--"} <span className="text-lg font-normal text-slate-400">元/10K</span>
          </div>
          
          <div className={`flex-1 p-3 rounded-lg ${getLevelBg()}`}>
            <div className="flex items-center gap-2">
              {getLevelIcon()}
              <span className={`font-semibold ${getLevelColor()}`}>
                {data?.price_level || "加载中..."}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Trend & Compare */}
      <div className="grid grid-cols-3 gap-4">
        {/* Trend */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            {getTrendIcon()}
            <h3 className="text-sm font-semibold text-slate-700">火价趋势</h3>
          </div>
          <div className={`text-2xl font-bold ${data?.price_trend === "上涨" ? "text-red-500" : data?.price_trend === "下跌" ? "text-green-500" : "text-slate-600"}`}>
            {data?.price_trend || "--"}
          </div>
        </div>

        {/* Reference Price */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-700">{historySeason.toUpperCase()} 同时间段均价</h3>
          </div>
          <div className="text-2xl font-bold text-slate-600">
            {data?.reference_price.toFixed(2) || "--"} <span className="text-sm font-normal">元/10K</span>
          </div>
        </div>

        {/* Suggested Price */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <h3 className="text-sm font-semibold text-slate-700">建议入手价</h3>
          </div>
          <div className="text-2xl font-bold text-green-600">
            {data?.suggested_price.toFixed(2) || "--"} <span className="text-sm font-normal">元/10K</span>
          </div>
        </div>
      </div>

      {/* Risk Tip */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-amber-800 mb-1">风险提示</h3>
            <p className="text-sm text-amber-700">
              {data?.risk_tip || "加载中..."}
            </p>
          </div>
        </div>
      </div>

      {/* History Range */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">{historySeason.toUpperCase()} 历史数据范围</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-400 mb-1">历史最高</div>
            <div className="text-lg font-semibold text-red-500">
              {data?.history_high.toFixed(2) || "--"}
            </div>
          </div>
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-400 mb-1">历史均价</div>
            <div className="text-lg font-semibold text-slate-600">
              {data?.history_avg.toFixed(2) || "--"}
            </div>
          </div>
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-400 mb-1">历史最低</div>
            <div className="text-lg font-semibold text-green-500">
              {data?.history_low.toFixed(2) || "--"}
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-8 text-slate-400">
          加载中...
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-8 text-red-500">
          加载失败: {String(error)}
        </div>
      )}
    </div>
  );
}
