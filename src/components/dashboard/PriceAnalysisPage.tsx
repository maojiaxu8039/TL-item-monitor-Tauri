import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { cmd } from "@/lib/commands";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Flame,
  DollarSign,
  ShoppingCart,
  Clock,
  Target,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
  ComposedChart,
  Bar,
} from "recharts";

interface PriceInsight {
  item_id: string;
  item_name: string;
  current_price: number;
  avg_price: number;
  min_price: number;
  max_price: number;
  price_trend: "up" | "down" | "stable";
  trend_percent: number;
  recommendation: "buy" | "wait" | "sell";
  confidence: number;
  reason: string;
}

interface FirePriceInsight {
  current_fire_price: number;
  avg_fire_price: number;
  fire_trend: "up" | "down" | "stable";
  fire_trend_percent: number;
  best_buy_time: string;
  best_sell_time: string;
}

export default function PriceAnalysisPage() {
  const { marketContext } = useSectionRefresh();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [analysisType, setAnalysisType] = useState<"overview" | "items" | "timing">("overview");

  // 获取火价历史
  const { data: fireHistory = [] } = useQuery({
    queryKey: ["fire-history", marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getFireHistory(168),
  });

  // 获取物品列表
  const { data: itemsData } = useQuery({
    queryKey: ["items-search", marketContext.seasonId, marketContext.marketMode, "", "all", "price_desc", 1],
    queryFn: () => cmd.searchItems("", 1, 100),
  });

  // 获取火价洞察
  const { data: fireInsight } = useQuery({
    queryKey: ["fire-insight", marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getFirePriceInsight(),
  });

  // 获取物品价格洞察
  const { data: itemInsights = [] } = useQuery({
    queryKey: ["item-insights", marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getItemPriceInsights(),
  });

  const items = itemsData?.items || [];

  // 计算火价统计数据
  const fireStats = useMemo(() => {
    if (fireHistory.length === 0) return null;
    const prices = fireHistory.map((h: any) => h.rmb_per_10k_fire);
    const avg = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const current = prices[0];
    const trend = current > avg ? "up" : current < avg ? "down" : "stable";
    const trendPercent = ((current - avg) / avg) * 100;

    return {
      current,
      avg,
      min,
      max,
      trend,
      trendPercent,
    };
  }, [fireHistory]);

  // 火价走势图数据
  const fireChartData = useMemo(() => {
    return fireHistory
      .slice()
      .reverse()
      .map((h: any) => ({
        time: new Date(h.recorded_at * 1000).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
        }),
        price: h.rmb_per_10k_fire,
        avg: fireStats?.avg,
      }));
  }, [fireHistory, fireStats]);

  // 过滤物品洞察
  const filteredInsights = useMemo(() => {
    if (selectedCategory === "all") return itemInsights;
    return itemInsights.filter((i: PriceInsight) => {
      const item = items.find((it: any) => it.item_id === i.item_id);
      return item?.item_type === selectedCategory;
    });
  }, [itemInsights, selectedCategory, items]);

  const getRecommendationConfig = (rec: string) => {
    switch (rec) {
      case "buy":
        return {
          icon: ShoppingCart,
          color: "text-green-600",
          bgColor: "bg-green-50",
          borderColor: "border-green-200",
          label: "建议入手",
        };
      case "sell":
        return {
          icon: DollarSign,
          color: "text-red-600",
          bgColor: "bg-red-50",
          borderColor: "border-red-200",
          label: "建议出售",
        };
      case "wait":
      default:
        return {
          icon: Clock,
          color: "text-amber-600",
          bgColor: "bg-amber-50",
          borderColor: "border-amber-200",
          label: "建议观望",
        };
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">物价分析</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            基于历史数据智能分析火价与物品价格走势
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[
            { key: "overview", label: "总览", icon: BarChart3 },
            { key: "items", label: "物品分析", icon: Target },
            { key: "timing", label: "时机分析", icon: Clock },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setAnalysisType(tab.key as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                analysisType === tab.key
                  ? "bg-blue-500 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fire Price Overview */}
      {fireStats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-slate-500">当前火价</span>
            </div>
            <div className="text-2xl font-bold text-slate-800">
              ¥{fireStats.current.toFixed(2)}
            </div>
            <div className="text-xs text-slate-400">元/万火</div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-slate-500">历史均价</span>
            </div>
            <div className="text-2xl font-bold text-slate-800">
              ¥{fireStats.avg.toFixed(2)}
            </div>
            <div className="text-xs text-slate-400">元/万火</div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              {fireStats.trend === "up" ? (
                <TrendingUp className="w-4 h-4 text-red-500" />
              ) : fireStats.trend === "down" ? (
                <TrendingDown className="w-4 h-4 text-green-500" />
              ) : (
                <BarChart3 className="w-4 h-4 text-slate-400" />
              )}
              <span className="text-sm text-slate-500">价格趋势</span>
            </div>
            <div
              className={`text-2xl font-bold ${
                fireStats.trend === "up"
                  ? "text-red-500"
                  : fireStats.trend === "down"
                  ? "text-green-500"
                  : "text-slate-600"
              }`}
            >
              {fireStats.trend === "up" ? "↑" : fireStats.trend === "down" ? "↓" : "→"}{" "}
              {Math.abs(fireStats.trendPercent).toFixed(1)}%
            </div>
            <div className="text-xs text-slate-400">
              较历史均价
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-slate-500">价格区间</span>
            </div>
            <div className="text-2xl font-bold text-slate-800">
              ¥{fireStats.min.toFixed(0)} - ¥{fireStats.max.toFixed(0)}
            </div>
            <div className="text-xs text-slate-400">最低 - 最高</div>
          </div>
        </div>
      )}

      {/* Fire Price Chart */}
      {analysisType === "overview" && (
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">火价走势</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={fireChartData}>
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11, fill: "#9CA3AF" }}
                  tickLine={false}
                  axisLine={{ stroke: "#E5E7EB" }}
                />
                <YAxis
                  tickFormatter={(v: number) => `¥${v.toFixed(0)}`}
                  tick={{ fontSize: 11, fill: "#9CA3AF" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value: any, name: string) => {
                    if (name === "price") return [`¥${Number(value).toFixed(2)}`, "火价"];
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar
                  dataKey="price"
                  name="火价"
                  fill="#3B82F6"
                  radius={[4, 4, 0, 0]}
                  opacity={0.8}
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  name="均价"
                  stroke="#EF4444"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Item Analysis */}
      {analysisType === "items" && (
        <div className="space-y-4">
          {/* Category Filter */}
          <div className="flex items-center gap-2">
            {[
              { key: "all", label: "全部" },
              { key: "weapon", label: "武器" },
              { key: "armor", label: "护甲" },
              { key: "accessory", label: "饰品" },
              { key: "consumable", label: "消耗品" },
            ].map((cat) => (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  selectedCategory === cat.key
                    ? "bg-blue-500 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Item Insights Grid */}
          <div className="grid grid-cols-1 gap-3">
            {filteredInsights.length === 0 ? (
              <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-slate-100">
                暂无分析数据，请先刷新物品数据
              </div>
            ) : (
              filteredInsights.map((insight: PriceInsight) => {
                const config = getRecommendationConfig(insight.recommendation);
                const Icon = config.icon;
                return (
                  <div
                    key={insight.item_id}
                    className={`bg-white rounded-xl border ${config.borderColor} p-4`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${config.bgColor}`}>
                          <Icon className={`w-5 h-5 ${config.color}`} />
                        </div>
                        <div>
                          <h4 className="font-medium text-slate-800">
                            {insight.item_name}
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {insight.reason}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-medium text-slate-700">
                            {insight.current_price.toFixed(2)} 火
                          </div>
                          <div className="text-xs text-slate-400">
                            均价: {insight.avg_price.toFixed(2)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className={`text-sm font-medium ${
                              insight.price_trend === "up"
                                ? "text-red-500"
                                : insight.price_trend === "down"
                                ? "text-green-500"
                                : "text-slate-500"
                            }`}
                          >
                            {insight.price_trend === "up"
                              ? "↑"
                              : insight.price_trend === "down"
                              ? "↓"
                              : "→"}{" "}
                            {Math.abs(insight.trend_percent).toFixed(1)}%
                          </div>
                          <div className="text-xs text-slate-400">7日趋势</div>
                        </div>
                        <div
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${config.bgColor} ${config.color}`}
                        >
                          {config.label}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Timing Analysis */}
      {analysisType === "timing" && fireInsight && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 rounded-xl border border-green-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <ShoppingCart className="w-5 h-5 text-green-600" />
                <h3 className="font-semibold text-green-800">最佳入手时机</h3>
              </div>
              <p className="text-sm text-green-700 mb-2">
                {fireInsight.best_buy_time}
              </p>
              <div className="text-xs text-green-600">
                基于历史火价波动分析，建议在火价下跌时购入物品
              </div>
            </div>

            <div className="bg-red-50 rounded-xl border border-red-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-5 h-5 text-red-600" />
                <h3 className="font-semibold text-red-800">最佳出售时机</h3>
              </div>
              <p className="text-sm text-red-700 mb-2">
                {fireInsight.best_sell_time}
              </p>
              <div className="text-xs text-red-600">
                基于历史火价波动分析，建议在火价上涨时出售物品
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">交易建议</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-slate-700">低买高卖策略</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    当火价低于历史均价时，用固定RMB可以买到更多火，此时适合购买物品；
                    当火价高于历史均价时，出售物品可以获得更多RMB。
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-blue-500 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-slate-700">物品价格联动</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    物品价格通常与火价呈反比关系。火价上涨时，物品价格（以火计价）往往下跌；
                    火价下跌时，物品价格（以火计价）往往上涨。
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-slate-700">风险提示</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    以上分析基于历史数据，仅供参考。实际交易请结合当前市场情况和个人判断。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
