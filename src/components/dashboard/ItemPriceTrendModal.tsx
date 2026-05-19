import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { cmd, SeasonInfo, ItemHistoryRecord } from "@/lib/commands";
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

  const seasonsQuery = useQuery<SeasonInfo[]>({
    queryKey: ["seasons-for-trend"],
    queryFn: () => cmd.listSeasons(),
    staleTime: 5 * 60 * 1000,
  });

  const getSeasonStartTime = (seasonId: string, seasons: SeasonInfo[]): number => {
    const season = seasons.find(s => s.season_id === seasonId);
    if (season && season.started_at && season.started_at > 0) {
      return season.started_at;
    }
    const fallback: Record<string, number> = {
      ss12: 1776384000,
      ss11: 1768521600,
      ss10: 1760140800,
    };
    return fallback[seasonId] || 1776384000;
  };

  const currentSeasonStart = seasonsQuery.data 
    ? getSeasonStartTime(currentSeason, seasonsQuery.data)
    : 1776384000;
  
  const historySeasonStart = seasonsQuery.data
    ? getSeasonStartTime(historySeason, seasonsQuery.data)
    : 1768521600;



  const currentDayQuery = useQuery<ItemHistoryRecord[]>({
    queryKey: ["item-trend-current-day", itemId, currentSeason, currentDay],
    queryFn: () => cmd.getItemHistoryByDay(itemId, currentSeason, currentDay),
    enabled: !!itemId && !!currentSeason,
  });

  const historyDayQuery = useQuery<ItemHistoryRecord[]>({
    queryKey: ["item-trend-history-day", itemId, historySeason, currentDay],
    queryFn: () => cmd.getItemHistoryByDay(itemId, historySeason, currentDay),
    enabled: !!itemId && !!historySeason,
  });

  const currentSeasonQuery = useQuery<ItemHistoryRecord[]>({
    queryKey: ["item-trend-current-season", itemId, currentSeason],
    queryFn: () => cmd.getItemHistoryBySeason(itemId, currentSeason, 1000),
    enabled: !!itemId && !!currentSeason && viewMode === "season",
  });

  const historySeasonQuery = useQuery<ItemHistoryRecord[]>({
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

  const chartData = useMemo(() => {
    type HourData = { hour: number; current: number | null; history: number | null };
    type DayData = { day: number; current: number | null; history: number | null };

    if (viewMode === "day") {
      const dataMap = new Map<number, HourData>();

      currentData.forEach((record) => {
        const hour = new Date(record.scraped_at * 1000).getHours();
        if (!dataMap.has(hour)) {
          dataMap.set(hour, { hour, current: null, history: null });
        }
        dataMap.get(hour)!.current = record.fire_price;
      });

      historyData.forEach((record) => {
        const hour = new Date(record.scraped_at * 1000).getHours();
        if (!dataMap.has(hour)) {
          dataMap.set(hour, { hour, current: null, history: null });
        }
        dataMap.get(hour)!.history = record.fire_price;
      });

      return Array.from(dataMap.values()).sort((a, b) => a.hour - b.hour) as (HourData | DayData)[];
    } else {
      const dataMap = new Map<number, DayData>();

      currentData.forEach((record) => {
        const day = Math.floor((record.scraped_at - currentSeasonStart) / 86400) + 1;
        if (!dataMap.has(day)) {
          dataMap.set(day, { day, current: null, history: null });
        }
        dataMap.get(day)!.current = record.fire_price;
      });

      historyData.forEach((record) => {
        const day = Math.floor((record.scraped_at - historySeasonStart) / 86400) + 1;
        if (!dataMap.has(day)) {
          dataMap.set(day, { day, current: null, history: null });
        }
        dataMap.get(day)!.history = record.fire_price;
      });

      return Array.from(dataMap.values()).sort((a, b) => a.day - b.day) as (HourData | DayData)[];
    }
  }, [viewMode, currentData, historyData, currentSeasonStart, historySeasonStart]);

  const stats = useMemo(() => {
    if (currentData.length === 0) return null;

    const currentPrices = currentData.map((r) => r.fire_price);
    const currentAvg = currentPrices.reduce((a, b) => a + b, 0) / currentPrices.length;
    const currentMax = Math.max(...currentPrices);
    const currentMin = Math.min(...currentPrices);

    let historyAvg = null;
    let historyMax = null;
    let historyMin = null;
    let premiumRate = null;

    if (historyData.length > 0) {
      const historyPrices = historyData.map((r) => r.fire_price);
      historyAvg = historyPrices.reduce((a, b) => a + b, 0) / historyPrices.length;
      historyMax = Math.max(...historyPrices);
      historyMin = Math.min(...historyPrices);
      premiumRate = historyAvg !== 0 ? ((currentAvg - historyAvg) / historyAvg * 100) : null;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-[950px] flex-col overflow-hidden rounded-lg border border-[rgba(255,184,0,0.24)] bg-[var(--color-panel)] shadow-[var(--shadow-lg)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">{itemName}</h2>
            <p className="mt-0.5 text-sm text-[var(--color-text-subtle)]">
              {viewMode === "day" 
                ? `第 ${currentDay} 天 24h 物价走势` 
                : `全赛季物价走势`} · {currentSeason.toUpperCase()} vs {historySeason.toUpperCase()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--color-text-subtle)] transition-colors hover:bg-[rgba(255,184,0,0.08)] hover:text-[var(--color-brand-gold)]"
            title="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="border-b border-[var(--color-border-soft)] bg-[rgba(255,184,0,0.035)] px-6 py-3">
          <div className="inline-flex items-center gap-1 rounded-lg border border-[rgba(255,184,0,0.16)] bg-[rgba(8,10,12,0.82)] p-1">
            <button
              onClick={() => setViewMode("day")}
              className={`rounded-md px-4 py-2 text-sm transition-colors ${
                viewMode === "day"
                  ? "bg-[rgba(255,184,0,0.14)] text-[var(--color-brand-gold)]"
                  : "text-[var(--color-text-muted)] hover:bg-[rgba(255,184,0,0.08)] hover:text-[var(--color-text)]"
              }`}
            >
              当天24h
            </button>
            <button
              onClick={() => setViewMode("season")}
              className={`rounded-md px-4 py-2 text-sm transition-colors ${
                viewMode === "season"
                  ? "bg-[rgba(255,184,0,0.14)] text-[var(--color-brand-gold)]"
                  : "text-[var(--color-text-muted)] hover:bg-[rgba(255,184,0,0.08)] hover:text-[var(--color-text)]"
              }`}
            >
              全赛季
            </button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 bg-[rgba(255,255,255,0.018)] px-6 py-4">
            <div className="rounded-lg border border-[rgba(255,184,0,0.14)] bg-[var(--color-panel-soft)] p-3">
              <div className="mb-1 text-xs text-[var(--color-text-subtle)]">当前均价</div>
              <div className="text-lg font-bold text-[var(--color-brand-gold)]">
                {stats.currentAvg.toFixed(2)}
              </div>
              <div className="text-xs text-[var(--color-text-subtle)]">火</div>
            </div>
            <div className="rounded-lg border border-[rgba(255,184,0,0.14)] bg-[var(--color-panel-soft)] p-3">
              <div className="mb-1 text-xs text-[var(--color-text-subtle)]">当前最高/最低</div>
              <div className="text-lg font-bold text-[var(--color-text)]">
                {stats.currentMax.toFixed(2)} / {stats.currentMin.toFixed(2)}
              </div>
              <div className="text-xs text-[var(--color-text-subtle)]">火</div>
            </div>
            {stats.historyAvg && (
              <>
                <div className="rounded-lg border border-[rgba(255,184,0,0.14)] bg-[var(--color-panel-soft)] p-3">
                  <div className="mb-1 text-xs text-[var(--color-text-subtle)]">历史均价</div>
                  <div className="text-lg font-bold text-[var(--color-ai)]">
                    {stats.historyAvg.toFixed(2)}
                  </div>
                  <div className="text-xs text-[var(--color-text-subtle)]">火</div>
                </div>
                <div className="rounded-lg border border-[rgba(255,184,0,0.14)] bg-[var(--color-panel-soft)] p-3">
                  <div className="mb-1 text-xs text-[var(--color-text-subtle)]">溢价率</div>
                  <div className={`text-lg font-bold ${(stats.premiumRate ?? 0) > 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
                    {(stats.premiumRate ?? 0) > 0 ? "↑" : "↓"} {Math.abs(stats.premiumRate ?? 0).toFixed(1)}%
                  </div>
                  <div className="text-xs text-[var(--color-text-subtle)]">vs 历史</div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Chart */}
        <div className="px-6 py-4" style={{ height: "400px" }}>
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-[var(--color-text-subtle)]">
              加载中...
            </div>
          ) : isError ? (
            <div className="flex h-full items-center justify-center text-[var(--color-danger)]">
              加载失败: {String(errorMsg)}
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-[var(--color-text-subtle)]">
              <p>暂无数据</p>
              <p className="mt-2 text-xs">currentData: {currentData.length}, historyData: {historyData.length}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 50 }}>
                <XAxis
                  dataKey={viewMode === "day" ? "hour" : "day"}
                  tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border)" }}
                  label={{ 
                    value: viewMode === "day" ? "小时" : "开服天数", 
                    position: "insideBottom", 
                    offset: -30, 
                    fontSize: 12, 
                    fill: "var(--color-text-muted)" 
                  }}
                  tickFormatter={(v) => viewMode === "day" ? `${v}h` : `第${v}天`}
                />
                <YAxis
                  tickFormatter={(v: number) => `${v.toFixed(0)}`}
                  tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: "价格(火)", angle: -90, position: "insideLeft", fontSize: 12, fill: "var(--color-text-muted)" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-panel)",
                    border: "1px solid rgba(255,184,0,0.24)",
                    borderRadius: 8,
                    color: "var(--color-text)",
                  }}
                  labelStyle={{ color: "var(--color-brand-gold)" }}
                  formatter={(value: number | string | null, name: string) => {
                    if (value === null) return ["—", name];
                    return [`${Number(value).toFixed(2)} 火`, name];
                  }}
                  labelFormatter={(label: number | string) => viewMode === "day" ? `${label}:00` : `第 ${label} 天`}
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
                  stroke="var(--color-brand-gold)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  activeDot={{ r: 4, fill: "var(--color-brand-gold)" }}
                />
                <Line
                  type="monotone"
                  dataKey="history"
                  name={`${historySeason.toUpperCase()} 历史赛季`}
                  stroke="var(--color-text-muted)"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  connectNulls
                  activeDot={{ r: 4, fill: "var(--color-text-muted)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border-soft)] bg-[rgba(255,184,0,0.035)] px-6 py-3 text-xs text-[var(--color-text-subtle)]">
          {viewMode === "day" 
            ? `对比两个赛季第 ${currentDay} 天的 24 小时物价走势` 
            : `对比两个赛季全周期的每日均价走势`}
        </div>
      </div>
    </div>
  );
}
