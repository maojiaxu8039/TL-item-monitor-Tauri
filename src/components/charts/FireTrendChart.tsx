import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export interface FirePriceRecord {
  scraped_at: number;
  rmb_per_10k_fire: number;
  fire_per_rmb: number;
  increase_ratio?: number | null;
}

type TimeRange = "1h" | "6h" | "24h" | "3d" | "7d";

interface FireTrendChartProps {
  records: FirePriceRecord[];
  timeRange: TimeRange;
}

function formatTime(ts: number, range: TimeRange): string {
  const d = new Date(ts * 1000);
  if (range === "1h" || range === "6h" || range === "24h") {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
      }}
    >
      <div style={{ color: "#6B7280", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#F97316", fontWeight: 600 }}>
        火价: ¥{payload[0]?.value?.toFixed(2) ?? "—"} /万火
      </div>
    </div>
  );
}

export default function FireTrendChart({ records, timeRange }: FireTrendChartProps) {
  const chartData = records.map((r) => ({
    time: formatTime(r.scraped_at, timeRange),
    rmb_per_10k_fire: r.rmb_per_10k_fire,
    fire_per_rmb: r.fire_per_rmb,
  }));

  const latest = records[records.length - 1];
  const currentPrice = latest?.rmb_per_10k_fire;

  if (records.length === 0) {
    return (
      <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#9CA3AF", fontSize: 14 }}>暂无数据</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 11, fill: "#9CA3AF" }}
          tickLine={false}
          axisLine={{ stroke: "#E5E7EB" }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#9CA3AF" }}
          tickLine={false}
          axisLine={false}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => `¥${v.toFixed(1)}`}
        />
        <Tooltip content={<CustomTooltip />} />
        {currentPrice != null && (
          <ReferenceLine
            y={currentPrice}
            stroke="#FF9F0D"
            strokeDasharray="5 5"
            strokeWidth={1.5}
            label={{
              value: `当前: ¥${currentPrice.toFixed(2)}`,
              position: "right",
              fontSize: 11,
              fill: "#FF9F0D",
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="rmb_per_10k_fire"
          stroke="#FF9F0D"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#FF9F0D" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
