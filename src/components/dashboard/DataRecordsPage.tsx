import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, Download, TrendingUp, TrendingDown } from "lucide-react";
import { cmd } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type TimeRange = "24h" | "7d" | "30d" | "custom";

export default function DataRecordsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [customHours, setCustomHours] = useState(168);
  const { marketContext } = useSectionRefresh();

  const hours = timeRange === "24h" ? 24 : timeRange === "7d" ? 168 : timeRange === "30d" ? 720 : customHours;

  const fireHistoryQuery = useQuery({
    queryKey: ["fire-history", marketContext.seasonId, marketContext.marketMode, hours],
    queryFn: () => cmd.getFireHistory(hours),
  });

  const chartData = fireHistoryQuery.data?.map((record) => ({
    time: new Date(record.scraped_at * 1000).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    }),
    rmbPer10k: record.rmb_per_10k_fire,
    firePerRmb: record.fire_per_rmb,
    increaseRatio: record.increase_ratio ?? 0,
  })) ?? [];

  const exportCsv = async () => {
    try {
      const csv = await cmd.exportFireHistoryCsv(hours);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fire_history_${hours}h.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const stats = chartData.length > 0 ? {
    max: Math.max(...chartData.map(d => d.rmbPer10k)),
    min: Math.min(...chartData.map(d => d.rmbPer10k)),
    avg: chartData.reduce((sum, d) => sum + d.rmbPer10k, 0) / chartData.length,
    count: chartData.length,
  } : null;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">数据记录</h1>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Download className="h-4 w-4" />
          导出 CSV
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        {(["24h", "7d", "30d"] as const).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-4 py-2 rounded-lg ${
              timeRange === range
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {range === "24h" ? "24小时" : range === "7d" ? "7天" : "30天"}
          </button>
        ))}
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-slate-500">最高价</div>
            <div className="text-2xl font-bold text-red-500">{stats.max.toFixed(2)}</div>
            <div className="text-xs text-slate-400">元/万火</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-slate-500">最低价</div>
            <div className="text-2xl font-bold text-green-500">{stats.min.toFixed(2)}</div>
            <div className="text-xs text-slate-400">元/万火</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-slate-500">平均价</div>
            <div className="text-2xl font-bold text-blue-500">{stats.avg.toFixed(2)}</div>
            <div className="text-xs text-slate-400">元/万火</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-slate-500">记录数</div>
            <div className="text-2xl font-bold text-slate-700">{stats.count}</div>
            <div className="text-xs text-slate-400">条</div>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">火价走势</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="rmbPer10k"
                stroke="#ff9f0d"
                strokeWidth={2}
                dot={false}
                name="元/万火"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-400">
            暂无数据
          </div>
        )}
      </div>

      {chartData.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow mt-6">
          <h2 className="text-lg font-semibold mb-4">历史记录</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4 text-slate-600">时间</th>
                  <th className="text-right py-2 px-4 text-slate-600">元/万火</th>
                  <th className="text-right py-2 px-4 text-slate-600">火/元</th>
                  <th className="text-right py-2 px-4 text-slate-600">涨跌</th>
                </tr>
              </thead>
              <tbody>
                {chartData.slice(-20).reverse().map((item, index) => (
                  <tr key={index} className="border-b hover:bg-slate-50">
                    <td className="py-2 px-4">{item.time}</td>
                    <td className="py-2 px-4 text-right font-medium">{item.rmbPer10k.toFixed(2)}</td>
                    <td className="py-2 px-4 text-right">{item.firePerRmb.toFixed(2)}</td>
                    <td className={`py-2 px-4 text-right flex items-center justify-end gap-1 ${
                      item.increaseRatio >= 0 ? "text-green-500" : "text-red-500"
                    }`}>
                      {item.increaseRatio >= 0 ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                      {item.increaseRatio >= 0 ? "+" : ""}
                      {item.increaseRatio.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}