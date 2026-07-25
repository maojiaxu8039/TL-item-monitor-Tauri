import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { X, CalendarRange } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { cmd, SeasonInfo, ItemHistoryRecord } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { queryKeys } from "@/lib/queryKeys";

interface Props {
  itemId: string;
  itemName: string;
  historySeason: string;
  onClose: () => void;
}

export function ItemPriceTrendModal({ itemId, itemName, historySeason, onClose }: Props) {
  const { marketContext } = useSectionRefresh();
  const currentSeason = marketContext.seasonId;

  // 区间天数（手动输入）：起始天 + 结束天
  const [startDay, setStartDay] = useState<number>(1);
  const [endDay, setEndDay] = useState<number>(10);

  const seasonsQuery = useQuery<SeasonInfo[]>({
    queryKey: queryKeys.itemTrend.seasons,
    queryFn: () => cmd.listSeasons(),
    staleTime: 5 * 60 * 1000,
  });

  const getSeasonStartTime = (seasonId: string, seasons: SeasonInfo[]): number => {
    const season = seasons.find((s) => s.season_id === seasonId);
    if (season && season.started_at && season.started_at > 0) {
      return season.started_at;
    }
    const fallback: Record<string, number> = {
      ss13: 1784253600,
      ss12: 1776384000,
      ss11: 1768521600,
      ss10: 1760140800,
    };
    return fallback[seasonId] || 1776384000;
  };

  // 启动时拉一次 SS12 / SS13 的 season_day 范围，作为默认值
  useEffect(() => {
    if (seasonsQuery.data) {
      const cs = seasonsQuery.data.find((s) => s.season_id === currentSeason);
      const hs = seasonsQuery.data.find((s) => s.season_id === historySeason);
      // 默认当前赛季最近 10 天；历史赛季前 10 天
      if (cs && cs.current_season_day) {
        const current = cs.current_season_day;
        setStartDay(Math.max(1, current - 9));
        setEndDay(current);
      }
      if (hs && hs.current_season_day) {
        // 让历史赛季范围与当前赛季匹配，便于同区间对比
        // （historySeason 已经结束了，current_season_day 是最终值）
      }
    }
  }, [seasonsQuery.data, currentSeason, historySeason]);

  const currentSeasonStart = seasonsQuery.data
    ? getSeasonStartTime(currentSeason, seasonsQuery.data)
    : 1784253600;

  const historySeasonStart = seasonsQuery.data
    ? getSeasonStartTime(historySeason, seasonsQuery.data)
    : 1776384000;

  const currentSeasonMaxDay = useMemo(() => {
    const cs = seasonsQuery.data?.find((s) => s.season_id === currentSeason);
    return cs?.current_season_day ?? 90;
  }, [seasonsQuery.data, currentSeason]);

  const historySeasonMaxDay = useMemo(() => {
    const hs = seasonsQuery.data?.find((s) => s.season_id === historySeason);
    return hs?.current_season_day ?? 90;
  }, [seasonsQuery.data, historySeason]);

  // 用 [startDay, endDay] 区间查询
  const startDayClamp = Math.max(1, Math.min(startDay, endDay));
  const endDayClamp = Math.max(startDayClamp, endDay);

  // 当前赛季：按区间批量查询
  const currentRangeQuery = useQuery<ItemHistoryRecord[]>({
    queryKey: [...queryKeys.itemTrend.currentSeason(itemId, currentSeason), startDayClamp, endDayClamp],
    queryFn: () => cmd.getItemHistoryByRange(itemId, currentSeason, startDayClamp, endDayClamp),
    enabled: !!itemId && !!currentSeason,
  });

  // 历史赛季：按区间批量查询
  const historyRangeQuery = useQuery<ItemHistoryRecord[]>({
    queryKey: [...queryKeys.itemTrend.historySeason(itemId, historySeason), startDayClamp, endDayClamp],
    queryFn: () => cmd.getItemHistoryByRange(itemId, historySeason, startDayClamp, endDayClamp),
    enabled: !!itemId && !!historySeason,
  });

  const currentData = useMemo(() => currentRangeQuery.data || [], [currentRangeQuery.data]);
  const historyData = useMemo(() => historyRangeQuery.data || [], [historyRangeQuery.data]);

  const isLoading = currentRangeQuery.isLoading || historyRangeQuery.isLoading;
  const isError = currentRangeQuery.isError || historyRangeQuery.isError;
  const errorMsg = currentRangeQuery.error || historyRangeQuery.error;

  const chartData = useMemo(() => {
    type DayData = { day: number; current: number | null; history: number | null };

    const dataMap = new Map<number, DayData>();

    // 初始化区间内所有天
    for (let d = startDayClamp; d <= endDayClamp; d++) {
      dataMap.set(d, { day: d, current: null, history: null });
    }

    currentData.forEach((record) => {
      let day: number;
      if (record.season_day != null && record.season_day > 0) {
        day = record.season_day;
      } else {
        day = Math.floor((record.scraped_at - currentSeasonStart) / 86400) + 1;
      }
      if (day < startDayClamp || day > endDayClamp) return;
      if (!dataMap.has(day)) {
        dataMap.set(day, { day, current: null, history: null });
      }
      dataMap.get(day)!.current = record.fire_price;
    });

    historyData.forEach((record) => {
      let day: number;
      if (record.season_day != null && record.season_day > 0) {
        day = record.season_day;
      } else {
        day = Math.floor((record.scraped_at - historySeasonStart) / 86400) + 1;
      }
      if (day < startDayClamp || day > endDayClamp) return;
      if (!dataMap.has(day)) {
        dataMap.set(day, { day, current: null, history: null });
      }
      dataMap.get(day)!.history = record.fire_price;
    });

    return Array.from(dataMap.values()).sort((a, b) => a.day - b.day);
  }, [currentData, historyData, currentSeasonStart, historySeasonStart, startDayClamp, endDayClamp]);

  const stats = useMemo(() => {
    if (currentData.length === 0) return null;

    const currentPrices = currentData.map((r) => r.fire_price);
    const currentAvg = currentPrices.reduce((a, b) => a + b, 0) / currentPrices.length;
    const currentMax = Math.max(...currentPrices);
    const currentMin = Math.min(...currentPrices);

    let historyAvg: number | null = null;
    let historyMax: number | null = null;
    let historyMin: number | null = null;
    let premiumRate: number | null = null;

    if (historyData.length > 0) {
      const historyPrices = historyData.map((r) => r.fire_price);
      historyAvg = historyPrices.reduce((a, b) => a + b, 0) / historyPrices.length;
      historyMax = Math.max(...historyPrices);
      historyMin = Math.min(...historyPrices);
      premiumRate = historyAvg !== 0 ? ((currentAvg - historyAvg) / historyAvg) * 100 : null;
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

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-[950px] flex-col overflow-hidden rounded-lg border border-[rgba(255,184,0,0.24)] bg-[var(--color-panel)] shadow-[var(--shadow-lg)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">{itemName}</h2>
            <p className="mt-0.5 text-sm text-[var(--color-text-subtle)]">
              区间第 {startDayClamp}\~{endDayClamp} 天物价走势 · {currentSeason.toUpperCase()} vs {historySeason.toUpperCase()}
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

        {/* Day Range Picker */}
        <div className="flex items-center gap-3 border-b border-[var(--color-border-soft)] bg-[rgba(255,184,0,0.035)] px-6 py-3">
          <CalendarRange className="h-4 w-4 text-[var(--color-text-subtle)]" />
          <span className="text-sm text-[var(--color-text-subtle)]">查询区间</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">从</span>
            <input
              type="number"
              min={1}
              max={currentSeasonMaxDay}
              value={startDay}
              onChange={(e) => setStartDay(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
              aria-label="起始天"
            />
            <span className="text-xs text-[var(--color-text-muted)]">到</span>
            <input
              type="number"
              min={1}
              max={currentSeasonMaxDay}
              value={endDay}
              onChange={(e) => setEndDay(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
              aria-label="结束天"
            />
            <span className="text-xs text-[var(--color-text-muted)]">
              天（共 {Math.max(0, endDayClamp - startDayClamp + 1)} 天，{currentSeason.toUpperCase()} 上限 {currentSeasonMaxDay}）
            </span>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 bg-[rgba(255,255,255,0.018)] px-6 py-4">
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
            {stats.historyAvg !== null && (
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
                  dataKey="day"
                  tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-border)" }}
                  label={{
                    value: "开服天数",
                    position: "insideBottom",
                    offset: -30,
                    fontSize: 12,
                    fill: "var(--color-text-muted)",
                  }}
                  tickFormatter={(v: number) => `第${v}天`}
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
                  formatter={(value: unknown, name: unknown) => {
                    if (value === null) return ["—", String(name)];
                    return [`${Number(value).toFixed(2)} 火`, String(name)];
                  }}
                  labelFormatter={(label: unknown) => `第 ${String(label)} 天`}
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
                  dot={{ r: 3, fill: "var(--color-brand-gold)" }}
                  connectNulls
                  activeDot={{ r: 5, fill: "var(--color-brand-gold)" }}
                />
                <Line
                  type="monotone"
                  dataKey="history"
                  name={`${historySeason.toUpperCase()} 历史赛季`}
                  stroke="var(--color-text-muted)"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 3, fill: "var(--color-text-muted)" }}
                  connectNulls
                  activeDot={{ r: 5, fill: "var(--color-text-muted)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border-soft)] bg-[rgba(255,184,0,0.035)] px-6 py-3 text-xs text-[var(--color-text-subtle)]">
          对比 {currentSeason.toUpperCase()} 与 {historySeason.toUpperCase()} 在第 {startDayClamp}\~{endDayClamp} 天的日均火价走势
          （SS13 当前已开 {currentSeasonMaxDay} 天，SS12 全部 {historySeasonMaxDay} 天）
        </div>
      </div>
    </div>,
    document.body,
  );
}