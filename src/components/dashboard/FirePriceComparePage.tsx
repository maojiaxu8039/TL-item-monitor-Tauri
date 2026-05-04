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
      {filteredCurrentData.length > 0 && (() => {
        let analysisData: { hour: number; price: number; day: number }[] = [];
        
        if (isShortTimeRange) {
          // For short time ranges, use hourly aggregated data
          const hourlyData: Record<number, { prices: number[]; days: number[] }> = {};
          
          filteredCurrentData.forEach((r) => {
            const hour = new Date(r.scraped_at * 1000).getHours();
            if (!hourlyData[hour]) hourlyData[hour] = { prices: [], days: [] };
            hourlyData[hour].prices.push(r.rmb_per_10k_fire);
            hourlyData[hour].days.push(r.season_day);
          });
          
          analysisData = Object.entries(hourlyData).map(([hour, data]) => ({
            hour: parseInt(hour),
            price: data.prices.reduce((a, b) => a + b, 0) / data.prices.length,
            day: Math.min(...data.days),
          })).sort((a, b) => a.hour - b.hour);
        } else {
          // For long time ranges, use daily aggregated data
          const dailyData: Record<number, { prices: number[]; days: number[] }> = {};
          
          filteredCurrentData.forEach((r) => {
            const day = r.season_day;
            if (!dailyData[day]) dailyData[day] = { prices: [], days: [] };
            dailyData[day].prices.push(r.rmb_per_10k_fire);
            dailyData[day].days.push(r.season_day);
          });
          
          analysisData = Object.entries(dailyData).map(([day, data]) => ({
            hour: 0, // Not used for daily
            price: data.prices.reduce((a, b) => a + b, 0) / data.prices.length,
            day: parseInt(day),
          })).sort((a, b) => a.day - b.day);
        }
        
        if (analysisData.length < 2) {
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
        
        // Calculate price changes between consecutive points
        const priceChanges: { index: number; startPrice: number; endPrice: number; changePct: number; hour: number; day: number }[] = [];
        
        for (let i = 1; i < analysisData.length; i++) {
          const prev = analysisData[i - 1];
          const curr = analysisData[i];
          const changePct = ((curr.price - prev.price) / prev.price) * 100;
          
          priceChanges.push({
            index: i,
            startPrice: prev.price,
            endPrice: curr.price,
            changePct,
            hour: curr.hour,
            day: curr.day,
          });
        }

        // Dynamic thresholds based on time range
        const dropThreshold = isShortTimeRange ? -2 : -5;
        const stableThreshold = isShortTimeRange ? 1 : 2;

        // Find best sell time: largest price drop
        const largestDrops = priceChanges
          .filter(pc => pc.changePct < dropThreshold)
          .sort((a, b) => a.changePct - b.changePct);

        let bestSellTime: { startHour: number; endHour: number; day: number; reason: string } | null = null;
        
        if (largestDrops.length > 0) {
          const biggestDrop = largestDrops[0];
          const prevData = analysisData[biggestDrop.index - 1];
          
          if (isShortTimeRange) {
            // For short time ranges, show hour-based recommendation
            const sellHour = prevData.hour;
            bestSellTime = {
              startHour: sellHour,
              endHour: (sellHour + 2) % 24,
              day: prevData.day,
              reason: `预计 ${String(sellHour).padStart(2, '0')}:00 后火价将下跌 ${Math.abs(biggestDrop.changePct).toFixed(1)}%`
            };
          } else {
            // For long time ranges, show day-based recommendation
            bestSellTime = {
              startHour: 0,
              endHour: 2,
              day: prevData.day,
              reason: `预计第${prevData.day}天火价将下跌 ${Math.abs(biggestDrop.changePct).toFixed(1)}%`
            };
          }
        }

        // Find best buy time: after large drop, during long stable period
        const stablePeriods: { startIndex: number; endIndex: number; startPrice: number; avgPrice: number; duration: number; hour: number; day: number }[] = [];
        
        let stableStart: typeof priceChanges[0] | null = null;
        let stablePrices: number[] = [];
        
        for (const pc of priceChanges) {
          if (pc.changePct >= -stableThreshold && pc.changePct <= stableThreshold) {
            if (!stableStart) {
              stableStart = pc;
              stablePrices = [pc.startPrice, pc.endPrice];
            } else {
              stablePrices.push(pc.endPrice);
            }
          } else {
            if (stableStart && stablePrices.length >= (isShortTimeRange ? 2 : 3)) {
              const avgPrice = stablePrices.reduce((a, b) => a + b, 0) / stablePrices.length;
              const startData = analysisData[stableStart.index - 1];
              
              stablePeriods.push({
                startIndex: stableStart.index,
                endIndex: pc.index,
                startPrice: stableStart.startPrice,
                avgPrice,
                duration: stablePrices.length,
                hour: startData.hour,
                day: startData.day,
              });
            }
            stableStart = null;
            stablePrices = [];
          }
        }

        stablePeriods.sort((a, b) => b.duration - a.duration);

        let bestBuyTime: { startHour: number; endHour: number; day: number; reason: string } | null = null;
        
        if (stablePeriods.length > 0) {
          const longestStable = stablePeriods[0];
          
          if (isShortTimeRange) {
            const buyHour = longestStable.hour;
            bestBuyTime = {
              startHour: buyHour,
              endHour: (buyHour + 2) % 24,
              day: longestStable.day,
              reason: `预计 ${String(buyHour).padStart(2, '0')}:00 后火价进入 ${longestStable.duration} 小时平稳期`
            };
          } else {
            bestBuyTime = {
              startHour: 0,
              endHour: 2,
              day: longestStable.day,
              reason: `预计第${longestStable.day}天后火价进入 ${longestStable.duration} 天平稳期`
            };
          }
        }

        // Dynamic title based on time range
        const analysisTitle = isShortTimeRange 
          ? `基于 ${currentSeason.toUpperCase()} 最近${timeRange === '12h' ? '12小时' : '24小时'}数据统计`
          : `基于 ${currentSeason.toUpperCase()} ${timeRange === '3d' ? '最近3天' : timeRange === '7d' ? '最近7天' : timeRange === '30d' ? '最近30天' : '整个赛季'}数据统计`;

        return (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-700">最佳交易时段分析</h3>
              <span className="text-xs text-slate-400">{analysisTitle}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowUpCircle className="w-4 h-4 text-slate-600" />
                  <span className="text-sm font-medium text-slate-700">最适合出售火价</span>
                </div>
                {bestSellTime ? (
                  <>
                    <div className="text-lg font-bold text-slate-800">
                      {isShortTimeRange 
                        ? `${String(bestSellTime.startHour).padStart(2, '0')}:00 - ${String(bestSellTime.endHour).padStart(2, '0')}:00`
                        : `第${bestSellTime.day}天 00:00 - 02:00`
                      }
                    </div>
                    <div className="text-sm text-slate-500 mt-1">
                      {bestSellTime.reason}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      建议在火价大幅下跌前2小时出售
                    </div>
                  </>
                ) : (
                  <div className="text-lg text-slate-400">
                    {isShortTimeRange ? "所选时间段内无大幅下跌" : "所选时间段内无大幅下跌"}
                  </div>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowDownCircle className="w-4 h-4 text-slate-600" />
                  <span className="text-sm font-medium text-slate-700">最适合收火</span>
                </div>
                {bestBuyTime ? (
                  <>
                    <div className="text-lg font-bold text-slate-800">
                      {isShortTimeRange 
                        ? `${String(bestBuyTime.startHour).padStart(2, '0')}:00 - ${String(bestBuyTime.endHour).padStart(2, '0')}:00`
                        : `第${bestBuyTime.day}天 00:00 - 02:00`
                      }
                    </div>
                    <div className="text-sm text-slate-500 mt-1">
                      {bestBuyTime.reason}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      建议在长时间平稳期开始前2小时收火
                    </div>
                  </>
                ) : (
                  <div className="text-lg text-slate-400">
                    {isShortTimeRange ? "所选时间段内无长时间平稳期" : "所选时间段内无长时间平稳期"}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
