import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Database, Download, RefreshCw, Server, Wifi, WifiOff, CheckCircle, XCircle, AlertCircle, Clock } from "lucide-react";
import { cmd } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { toast } from "sonner";

interface ServerStatus {
  server: string;
  version: string;
  uptime_seconds: number;
  season_id: string;
  market_mode: string;
  last_collection: {
    timestamp: number;
    fire_success: boolean;
    fire_price: number | null;
    items_count: number;
    items_success: boolean;
    error: string | null;
  } | null;
  next_collection: number | null;
}

interface FireHistoryRecord {
  id: string;
  season_id: string;
  market_mode: string;
  rmb_per_10k_fire: number;
  fire_per_rmb: number;
  increase_ratio: number | null;
  trading_volume: string;
  source: string;
  source_time: string;
  recorded_at: number;
  created_at: number;
}

type ConnectionStatus = "connected" | "disconnected" | "error";

export default function DataMonitorPage() {
  const [serverUrl, setServerUrl] = useState(() => {
    return localStorage.getItem("server_url") || "http://localhost:8080";
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [syncHours, setSyncHours] = useState(24);
  const [syncSeason, setSyncSeason] = useState("ss12");
  const [syncMode, setSyncMode] = useState<"hours" | "season">("hours");
  const { marketContext } = useSectionRefresh();

  const checkServerStatus = async (): Promise<ServerStatus | null> => {
    try {
      const response = await fetch(`${serverUrl}/status`, { 
        signal: AbortSignal.timeout(5000) 
      });
      if (!response.ok) throw new Error("Server error");
      const data = await response.json();
      if (data.success) {
        setConnectionStatus("connected");
        return data.data;
      }
      return null;
    } catch {
      setConnectionStatus("disconnected");
      return null;
    }
  };

  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ["server-status", serverUrl],
    queryFn: checkServerStatus,
    refetchInterval: 30000,
    retry: 1,
  });

  useEffect(() => {
    setServerStatus(statusData || null);
  }, [statusData]);

  const syncMutation = useMutation({
    mutationFn: async () => {
      let url: string;
      if (syncMode === "hours") {
        url = `${serverUrl}/fire-history?limit=${syncHours}`;
      } else {
        url = `${serverUrl}/fire-history-all?season_id=${syncSeason}&market_mode=${marketContext.marketMode}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch data");
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Unknown error");
      return data.data as FireHistoryRecord[];
    },
    onSuccess: async (records) => {
      if (records.length === 0) {
        toast.info("没有可同步的数据");
        return;
      }
      
      let synced = 0;
      for (const record of records) {
        try {
          await cmd.syncFireRecord({
            season_id: record.season_id,
            market_mode: record.market_mode,
            rmb_per_10k_fire: record.rmb_per_10k_fire,
            fire_per_rmb: record.fire_per_rmb,
            increase_ratio: record.increase_ratio ?? 0,
            trading_volume: record.trading_volume,
            source: record.source,
            source_time: record.source_time,
            recorded_at: record.recorded_at,
          });
          synced++;
        } catch (err) {
          console.error("Sync error:", err);
        }
      }
      toast.success(`已同步 ${synced} 条火价记录到本地数据库`);
      refetchStatus();
    },
    onError: (err: Error) => {
      toast.error(`同步失败: ${err.message}`);
    },
  });

  const handleSaveUrl = () => {
    localStorage.setItem("server_url", serverUrl);
    refetchStatus();
    toast.success("服务器地址已保存");
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}小时${minutes}分钟`;
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts * 1000).toLocaleString("zh-CN");
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case "connected":
        return <Wifi className="w-5 h-5 text-green-500" />;
      case "error":
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <WifiOff className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case "connected":
        return <span className="text-green-600">已连接</span>;
      case "error":
        return <span className="text-yellow-600">连接错误</span>;
      default:
        return <span className="text-slate-400">未连接</span>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Database className="w-5 h-5 text-slate-600" />
        <h1 className="text-lg font-semibold text-slate-800">数据监控</h1>
      </div>

      {/* Server Connection */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-700">服务器连接</h2>
          <div className="ml-auto flex items-center gap-2">
            {getStatusIcon()}
            {getStatusText()}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">服务器地址</label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://192.168.1.100:8080"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <button
              onClick={handleSaveUrl}
              className="mt-5 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
            >
              保存
            </button>
            <button
              onClick={() => refetchStatus()}
              className="mt-5 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              title="刷新状态"
            >
              <RefreshCw className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {serverStatus && (
            <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100">
              <div className="text-center">
                <div className="text-xs text-slate-400">版本</div>
                <div className="text-sm font-medium text-slate-700">{serverStatus.version}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-400">运行时长</div>
                <div className="text-sm font-medium text-slate-700">{formatUptime(serverStatus.uptime_seconds)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-400">赛季</div>
                <div className="text-sm font-medium text-slate-700">{serverStatus.season_id}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-400">模式</div>
                <div className="text-sm font-medium text-slate-700">
                  {serverStatus.market_mode === "season_normal" ? "普通" : "专家"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Collection Status */}
      {serverStatus && serverStatus.last_collection && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-purple-500" />
            <h2 className="text-sm font-semibold text-slate-700">最近采集</h2>
            <span className="ml-auto text-xs text-slate-400">
              {formatTimestamp(serverStatus.last_collection.timestamp)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 rounded-lg border ${serverStatus.last_collection.fire_success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                {serverStatus.last_collection.fire_success ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm font-medium">火价采集</span>
              </div>
              {serverStatus.last_collection.fire_success ? (
                <div className="text-lg font-semibold text-green-700">
                  {serverStatus.last_collection.fire_price?.toFixed(2)} RMB/10K
                </div>
              ) : (
                <div className="text-sm text-red-600">{serverStatus.last_collection.error}</div>
              )}
            </div>

            <div className={`p-4 rounded-lg border ${serverStatus.last_collection.items_success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                {serverStatus.last_collection.items_success ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm font-medium">物品采集</span>
              </div>
              {serverStatus.last_collection.items_success ? (
                <div className="text-lg font-semibold text-green-700">
                  {serverStatus.last_collection.items_count} 个物品
                </div>
              ) : (
                <div className="text-sm text-red-600">{serverStatus.last_collection.error}</div>
              )}
            </div>
          </div>

          {serverStatus.next_collection && (
            <div className="mt-4 pt-4 border-t border-slate-100 text-center text-sm text-slate-500">
              下次采集时间：{formatTimestamp(serverStatus.next_collection)}
            </div>
          )}
        </div>
      )}

      {/* Data Sync */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Download className="w-4 h-4 text-green-500" />
          <h2 className="text-sm font-semibold text-slate-700">数据同步</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">同步方式</label>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setSyncMode("hours")}
                  className={`px-3 py-1.5 text-xs ${
                    syncMode === "hours" 
                      ? "bg-blue-500 text-white" 
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  按时间
                </button>
                <button
                  onClick={() => setSyncMode("season")}
                  className={`px-3 py-1.5 text-xs ${
                    syncMode === "season" 
                      ? "bg-blue-500 text-white" 
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  按赛季
                </button>
              </div>
            </div>

            {syncMode === "hours" ? (
              <select
                value={syncHours}
                onChange={(e) => setSyncHours(Number(e.target.value))}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value={24}>24小时</option>
                <option value={168}>7天</option>
                <option value={720}>30天</option>
              </select>
            ) : (
              <select
                value={syncSeason}
                onChange={(e) => setSyncSeason(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="ss12">SS12 赛季</option>
                <option value="ss11">SS11 赛季</option>
                <option value="ss10">SS10 赛季</option>
                <option value="ss09">SS09 赛季</option>
              </select>
            )}

            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending || connectionStatus !== "connected"}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className={`w-4 h-4 ${syncMutation.isPending ? "animate-bounce" : ""}`} />
              {syncMutation.isPending ? "同步中..." : "同步数据"}
            </button>
          </div>

          <div className="text-xs text-slate-400">
            {syncMode === "hours" 
              ? `将服务器最近 ${syncHours} 小时的数据同步到本地数据库`
              : `将服务器 SS${syncSeason.slice(-2)} 整个赛季的数据同步到本地数据库`
            }
          </div>
        </div>
      </div>

      {/* Not Connected State */}
      {connectionStatus !== "connected" && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-8 text-center">
          <WifiOff className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">未连接到服务器</h3>
          <p className="text-sm text-slate-400">
            请确保服务器采集器正在运行，并检查服务器地址是否正确
          </p>
          <p className="text-xs text-slate-400 mt-2">
            服务器采集器运行命令：./server --port 8080
          </p>
        </div>
      )}
    </div>
  );
}
