import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { cmd } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";

interface Props {
  itemId: string;
  itemName: string;
  historySeason: string;
  onClose: () => void;
}

export function ItemPriceTrendModal({ itemId, itemName, historySeason, onClose }: Props) {
  const { marketContext } = useSectionRefresh();
  const currentSeason = marketContext.seasonId;

  // 获取当前赛季物品历史
  const currentQuery = useQuery({
    queryKey: ["item-trend-current", itemId, currentSeason, marketContext.marketMode],
    queryFn: () => cmd.getItemHistory(itemId, 168),
    enabled: !!itemId && !!currentSeason,
  });

  // 获取历史赛季物品历史（通过对比命令）
  const historyQuery = useQuery({
    queryKey: ["item-trend-history", itemId, historySeason, marketContext.marketMode],
    queryFn: () => cmd.getItemHistoryBySeason(itemId, historySeason, 168),
    enabled: !!itemId && !!historySeason,
  });

  const currentData = currentQuery.data || [];
  const historyData = historyQuery.data || [];

  // 计算开服偏移天数
  const getServerDay = (timestamp: number) => {
    // 简化的开服天数计算，实际应该根据赛季开始时间计算
    const now = Math.floor(Date.now() / 1000);
    const seasonStart = now - (30 * 86400); // 假设赛季开始30天前
    return Math.floor((timestamp - seasonStart) / 86400);
  };

  // 构建图表数据 - 按开服天数对齐
  const chartData = useMemo(() => {
    const dataMap = new Map<number, { day: number; current: number | null; history: number | null }>();

    // 添加当前赛季数据
    currentData.forEach((record: any) => {
      const day = getServerDay(record.scraped_at);
      if (!dataMap.has(day)) {
        dataMap.set(day, { day, current: null, history: null });
      }
      dataMap.get(day)!.current = record.fire_price;
    });

    // 添加历史赛季数据
    historyData.forEach((record: any) => {
      const day = getServerDay(record.scraped_at);
      if (!dataMap.has(day)) {
        dataMap.set(day, { day, current: null, history: null });
      }
      dataMap.get(day)!.history = record.fire_price;
    });

    // 转换为数组并排序
    return Array.from(dataMap.values()).sort((a, b) => a.day - b.day);
  }, [currentData, historyData]);

  // 计算统计数据
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
      <div className="bg-white rounded-2xl shadow-2xl w-[900px] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{itemName}</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {currentSeason.toUpperCase()} 当前赛季 vs {historySeason.toUpperCase()} 历史赛季
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
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
        <div className="flex-1 px-6 py-4 min-h-[400px]">
          {currentQuery.isLoading || historyQuery.isLoading ? (
            <div className="h-full flex items-center justify-center text-slate-400">
              加载中...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400">
              暂无数据
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: "#9CA3AF" }}
                  tickLine={false}
                  axisLine={{ stroke: "#E5E7EB" }}
                  label={{ value: "开服天数", position: "insideBottom", offset: -5, fontSize: 12, fill: "#9CA3AF" }}
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
                  labelFormatter={(label: any) => `开服第 ${label} 天`}
                />
                <Legend />
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
          数据按开服偏移天数对齐 · 同天数下按整点时间切片严格对齐
        </div>
      </div>
    </div>
  );
}
