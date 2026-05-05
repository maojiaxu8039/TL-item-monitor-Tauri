import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { cmd } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";

interface Props {
  itemId: string;
  itemName: string;
  historySeason: string;
  currentDay: number;
  onClose: () => void;
}

type ViewMode = "day" | "season";

export function ItemPriceTrendModal({ itemId, itemName, historySeason, currentDay, onClose }: Props) {
  const { marketContext } = useSectionRefresh();
  const currentSeason = marketContext.seasonId;
  const [viewMode, setViewMode] = useState<ViewMode>("day");

  useEffect(() => {
    console.log("[ItemPriceTrendModal] MOUNTED with itemId:", itemId);
    console.log("[ItemPriceTrendModal] currentSeason:", currentSeason, "historySeason:", historySeason);
    console.log("[ItemPriceTrendModal] currentDay:", currentDay);
  }, [itemId, currentSeason, historySeason, currentDay]);

  const currentDayQuery = useQuery({
    queryKey: ["item-trend-current-day", itemId, currentSeason, currentDay],
    queryFn: () => cmd.getItemHistoryByDay(itemId, currentSeason, currentDay),
    enabled: !!itemId && !!currentSeason,
  });

  const historyDayQuery = useQuery({
    queryKey: ["item-trend-history-day", itemId, historySeason, currentDay],
    queryFn: () => cmd.getItemHistoryByDay(itemId, historySeason, currentDay),
    enabled: !!itemId && !!historySeason,
  });

  const currentSeasonQuery = useQuery({
    queryKey: ["item-trend-current-season", itemId, currentSeason],
    queryFn: () => cmd.getItemHistoryBySeason(itemId, currentSeason, 1000),
    enabled: !!itemId && !!currentSeason && viewMode === "season",
  });

  const historySeasonQuery = useQuery({
    queryKey: ["item-trend-history-season", itemId, historySeason],
    queryFn: () => cmd.getItemHistoryBySeason(itemId, historySeason, 1000),
    enabled: !!itemId && !!historySeason && viewMode === "season",
  });

  const currentData = viewMode === "day" 
    ? (currentDayQuery.data || [])
    : (currentSeasonQuery.data || []);
  
  const historyData = viewMode === "day"
    ? (historyDayQuery.data || [])
    : (historySeasonQuery.data || []);

  const isLoading = viewMode === "day"
    ? (currentDayQuery.isLoading || historyDayQuery.isLoading)
    : (currentSeasonQuery.isLoading || historySeasonQuery.isLoading);

  const isError = viewMode === "day"
    ? (currentDayQuery.isError || historyDayQuery.isError)
    : (currentSeasonQuery.isError || historySeasonQuery.isError);

  const errorMsg = viewMode === "day"
    ? (currentDayQuery.error || historyDayQuery.error)
    : (currentSeasonQuery.error || historySeasonQuery.error);

  console.log("[ItemPriceTrendModal] viewMode:", viewMode);
  console.log("[ItemPriceTrendModal] currentSeason:", currentSeason, "historySeason:", historySeason);
  console.log("[ItemPriceTrendModal] currentDay:", currentDay);
  console.log("[ItemPriceTrendModal] currentData length:", currentData?.length);
  console.log("[ItemPriceTrendModal] historyData length:", historyData?.length);
  if (currentData?.length > 0) {
    console.log("[ItemPriceTrendModal] first current record:", currentData[0]);
  }
  if (historyData?.length > 0) {
    console.log("[ItemPriceTrendModal] first history record:", historyData[0]);
  }

  const getCurrentSeasonStart = () => {
    if (currentSeason === "ss12") return 1776384000;
    if (currentSeason === "ss11") return 1768521600;
    return 1776384000;
  };

  const getHistorySeasonStart = () => {
    if (historySeason === "ss11") return 1768521600;
    if (historySeason === "ss12") return 1776384000;
    return 1768521600;
  };

  const currentSeasonStart = getCurrentSeasonStart();
  const historySeasonStart = getHistorySeasonStart();

  const chartData = useMemo(() => {
    type HourData = { hour: number; current: number | null; history: number | null };
    type DayData = { day: number; current: number | null; history: number | null };

    if (viewMode === "day") {
      const dataMap = new Map<number, HourData>();

      currentData.forEach((record: any) => {
        const hour = new Date(record.scraped_at * 1000).getHours();
        if (!dataMap.has(hour)) {
          dataMap.set(hour, { hour, current: null, history: null });
        }
        dataMap.get(hour)!.current = record.fire_price;
      });

      historyData.forEach((record: any) => {
        const hour = new Date(record.scraped_at * 1000).getHours();
        if (!dataMap.has(hour)) {
          dataMap.set(hour, { hour, current: null, history: null });
        }
        dataMap.get(hour)!.history = record.fire_price;
      });

      return Array.from(dataMap.values()).sort((a, b) => a.hour - b.hour) as (HourData | DayData)[];
    } else {
      const dataMap = new Map<number, DayData>();

      currentData.forEach((record: any) => {
        const day = Math.floor((record.scraped_at - currentSeasonStart) / 86400) + 1;
        if (!dataMap.has(day)) {
          dataMap.set(day, { day, current: null, history: null });
        }
        dataMap.get(day)!.current = record.fire_price;
      });

      historyData.forEach((record: any) => {
        const day = Math.floor((record.scraped_at - historySeasonStart) / 86400) + 1;
        if (!dataMap.has(day)) {
          dataMap.set(day, { day, current: null, history: null });
        }
        dataMap.get(day)!.history = record.fire_price;
      });

      return Array.from(dataMap.values()).sort((a, b) => a.day - b.day) as (HourData | DayData)[];
    }
  }, [viewMode, currentData, historyData, currentSeasonStart, historySeasonStart]);

  console.log("[ItemPriceTrendModal] chartData:", chartData);

  const stats = useMemo(() => {
    if (currentData.length === 0) return null;

    const currentPrices = currentData.map((r: any) => r.fire_price);
    const currentAvg = currentPrices.reduce((a: number, b: number) => a + b, 0) / currentPrices.length;
    const currentMax = Math.max(...currentPrices);
    const currentMin = Math.min(...currentPrices);

    let historyAvg = null;
    let historyMax = null;
    let historyMin = null;
    let premiumRate = null;

    if (historyData.length > 0) {
      const historyPrices = historyData.map((r: any) => r.fire_price);
      historyAvg = historyPrices.reduce((a: number, b: number) => a + b, 0) / historyPrices.length;
      historyMax = Math.max(...historyPrices);
      historyMin = Math.min(...historyPrices);
      premiumRate = ((currentAvg - historyAvg) / historyAvg * 100);
    }

    return {
      currentAvg,
      currentMax,
      currentMin,
      historyAvg,
      historyMax,
      historyMin,
      premiumRate,
    };
  }, [currentData, historyData]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[950px] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{itemName}</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {viewMode === "day" 
                ? `第 ${currentDay} 天 24h 物价走势` 
                : `全赛季物价走势`} · {currentSeason.toUpperCase()} vs {historySeason.toUpperCase()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("day")}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                viewMode === "day"
                  ? "bg-blue-500 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              当天24h
            </button>
            <button
              onClick={() => setViewMode("season")}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                viewMode === "season"
                  ? "bg-blue-500 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              全赛季
            </button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 px-6 py-4 bg-slate-50/50">
            <div className="bg-white rounded-xl border border-slate-100 p-3">
              <div className="text-xs text-slate-400 mb-1">当前均价</div>
              <div className="text-lg font-bold text-orange-600">
                {stats.currentAvg.toFixed(2)}
              </div>
              <div className="text-xs text-slate-400">火</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-3">
              <div className="text-xs text-slate-400 mb-1">当前最高/最低</div>
              <div className="text-lg font-bold text-slate-700">
                {stats.currentMax.toFixed(2)} / {stats.currentMin.toFixed(2)}
              </div>
              <div className="text-xs text-slate-400">火</div>
            </div>
            {stats.historyAvg && (
              <>
                <div className="bg-white rounded-xl border border-slate-100 p-3">
                  <div className="text-xs text-slate-400 mb-1">历史均价</div>
                  <div className="text-lg font-bold text-blue-600">
                    {stats.historyAvg.toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-400">火</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-100 p-3">
                  <div className="text-xs text-slate-400 mb-1">溢价率</div>
                  <div className={`text-lg font-bold ${(stats.premiumRate ?? 0) > 0 ? "text-red-500" : "text-green-500"}`}>
                    {(stats.premiumRate ?? 0) > 0 ? "↑" : "↓"} {Math.abs(stats.premiumRate ?? 0).toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-400">vs 历史</div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Chart */}
        <div className="px-6 py-4" style={{ height: "400px" }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              加载中...
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center h-full text-red-500">
              加载失败: {String(errorMsg)}
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <p>暂无数据</p>
              <p className="text-xs mt-2">currentData: {currentData.length}, historyData: {historyData.length}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 50 }}>
                <XAxis
                  dataKey={viewMode === "day" ? "hour" : "day"}
                  tick={{ fontSize: 11, fill: "#9CA3AF" }}
                  tickLine={false}
                  axisLine={{ stroke: "#E5E7EB" }}
                  label={{ 
                    value: viewMode === "day" ? "小时" : "开服天数", 
                    position: "insideBottom", 
                    offset: -30, 
                    fontSize: 12, 
                    fill: "#9CA3AF" 
                  }}
                  tickFormatter={(v) => viewMode === "day" ? `${v}h` : `第${v}天`}
                />
                <YAxis
                  tickFormatter={(v: number) => `${v.toFixed(0)}`}
                  tick={{ fontSize: 11, fill: "#9CA3AF" }}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: "价格(火)", angle: -90, position: "insideLeft", fontSize: 12, fill: "#9CA3AF" }}
                />
                <Tooltip
                  formatter={(value: any, name: string) => {
                    if (value === null) return ["—", name];
                    return [`${Number(value).toFixed(2)} 火`, name];
                  }}
                  labelFormatter={(label: any) => viewMode === "day" ? `${label}:00` : `第 ${label} 天`}
                />
                <Legend 
                  verticalAlign="top" 
                  align="center" 
                  layout="horizontal"
                  wrapperStyle={{ paddingBottom: 10 }}
                />
                <Line
                  type="monotone"
                  dataKey="current"
                  name={`${currentSeason.toUpperCase()} 当前赛季`}
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  activeDot={{ r: 4, fill: "#3B82F6" }}
                />
                <Line
                  type="monotone"
                  dataKey="history"
                  name={`${historySeason.toUpperCase()} 历史赛季`}
                  stroke="#9CA3AF"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  connectNulls
                  activeDot={{ r: 4, fill: "#9CA3AF" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-400">
          {viewMode === "day" 
            ? `对比两个赛季第 ${currentDay} 天的 24 小时物价走势` 
            : `对比两个赛季全周期的每日均价走势`}
        </div>
      </div>
    </div>
  );
}
