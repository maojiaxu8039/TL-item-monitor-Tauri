import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { cmd } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import FireTrendChart, { type FirePriceRecord } from "@/components/charts/FireTrendChart";
import { Flame, TrendingUp, TrendingDown, ArrowUp, ArrowDown, Clock } from "lucide-react";
import { motion } from "framer-motion";

type TimeRange = "1h" | "6h" | "24h" | "3d" | "7d";

const RANGE_HOURS: Record<TimeRange, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "3d": 72,
  "7d": 168,
};

export default function SeasonPage() {
  const [range, setRange] = useState<TimeRange>("24h");
  const { marketContext } = useSectionRefresh();

  const query = useQuery<FirePriceRecord[]>({
    queryKey: ["fire-history", marketContext.seasonId, marketContext.marketMode, range],
    queryFn: () => cmd.getFireHistory(RANGE_HOURS[range]),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await listen("fire-price-updated", () => {
        query.refetch();
      });
    })();
    return () => { unlisten?.(); };
  }, [query]);

  const { data: history = [], isLoading } = query;

  const latest = history[history.length - 1] as FirePriceRecord | undefined;
  const earliest = history[0] as FirePriceRecord | undefined;
  const priceChange = latest && earliest ? latest.rmb_per_10k_fire - earliest.rmb_per_10k_fire : 0;
  const pctChange = latest && earliest && earliest.rmb_per_10k_fire !== 0
    ? ((latest.rmb_per_10k_fire - earliest.rmb_per_10k_fire) / earliest.rmb_per_10k_fire) * 100
    : 0;

  const maxPrice = history.length > 0 ? Math.max(...history.map((h) => h.rmb_per_10k_fire)) : 0;
  const minPrice = history.length > 0 ? Math.min(...history.map((h) => h.rmb_per_10k_fire)) : 0;
  const latestIncreaseRatio = latest?.increase_ratio;

  const timeRanges: { label: string; value: TimeRange }[] = [
    { label: "1小时", value: "1h" },
    { label: "6小时", value: "6h" },
    { label: "24小时", value: "24h" },
    { label: "3天", value: "3d" },
    { label: "7天", value: "7d" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4 max-w-[1200px] mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-800">火价走势</h2>
          <p className="text-xs text-slate-400 mt-0.5">实时追踪本赛季火价变化</p>
        </div>
        {/* Time range tabs */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {timeRanges.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                range === value
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard
          label="当前火价"
          value={latest ? `¥${latest.rmb_per_10k_fire.toFixed(2)}` : "—"}
          sub="/万火"
          icon={<Flame className="w-4 h-4 text-red-500" />}
          color="red"
        />
        <SummaryCard
          label="涨幅"
          value={`${latestIncreaseRatio != null ? (latestIncreaseRatio >= 0 ? "+" : "") + latestIncreaseRatio.toFixed(2) + "%" : "—"}`}
          sub={latestIncreaseRatio != null ? (latestIncreaseRatio >= 0 ? `+¥${priceChange.toFixed(2)}` : `-¥${Math.abs(priceChange).toFixed(2)}`) : "—"}
          icon={
            latestIncreaseRatio != null ? (
              latestIncreaseRatio >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )
            ) : (
              <TrendingUp className="w-4 h-4 text-slate-400" />
            )
          }
          color={latestIncreaseRatio != null ? (latestIncreaseRatio >= 0 ? "green" : "red") : "gray"}
        />
        <SummaryCard
          label="最高"
          value={maxPrice > 0 ? `¥${maxPrice.toFixed(2)}` : "—"}
          sub="/万火"
          icon={<ArrowUp className="w-4 h-4 text-purple-500" />}
          color="purple"
        />
        <SummaryCard
          label="最低"
          value={minPrice > 0 ? `¥${minPrice.toFixed(2)}` : "—"}
          sub="/万火"
          icon={<ArrowDown className="w-4 h-4 text-blue-500" />}
          color="blue"
        />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-700">价格曲线</h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-slate-500">火价 (RMB/万火)</span>
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <span className="text-sm text-slate-400">加载中...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-sm text-slate-400">
            <Clock className="w-10 h-10 mb-2 text-slate-300" />
            暂无数据，请等待爬虫采集
          </div>
        ) : (
          <FireTrendChart records={history} timeRange={range} />
        )}
      </div>

      {/* Recent records table */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-medium text-slate-700">最近采集记录</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                {["采集时间", "火价 (RMB/万火)", "涨幅", "记录来源"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-slate-500 font-semibold text-left"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...history]
                .reverse()
                .slice(0, 20)
                .map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/40">
                    <td className="px-4 py-2.5 text-slate-700">
                      {new Date(r.scraped_at * 1000).toLocaleString("zh-CN")}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-red-500">
                      ¥{r.rmb_per_10k_fire.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.increase_ratio != null ? (
                        <span
                          className={`text-xs font-semibold ${
                            r.increase_ratio >= 0 ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          {r.increase_ratio >= 0 ? "+" : ""}
                          {r.increase_ratio.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400"> qiandao / luosi </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  color: "red" | "blue" | "green" | "purple" | "gray";
}) {
  const colorMap = {
    red: "bg-red-50/60 border-red-100",
    blue: "bg-blue-50/60 border-blue-100",
    green: "bg-green-50/60 border-green-100",
    purple: "bg-purple-50/60 border-purple-100",
    gray: "bg-slate-50/60 border-slate-100",
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-slate-500 font-medium">{label}</span>
      </div>
      <div className="text-lg font-bold text-slate-800">{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}
