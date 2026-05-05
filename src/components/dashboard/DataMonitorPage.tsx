import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Database, Download, RefreshCw, Server, Wifi, WifiOff, CheckCircle, XCircle, AlertCircle, Clock } from "lucide-react";
import { cmd } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { toast } from "sonner";
import ServerAdminPanel from "./ServerAdminPanel";

interface ServerStatus {
  server: string;
  version: string;
  uptime_seconds: number;
  season_id: string;
  last_collection: {
    normal: {
      timestamp: number;
      fire_success: boolean;
      fire_price: number | null;
      items_count: number;
      items_success: boolean;
      error: string | null;
    } | null;
    expert: {
      timestamp: number;
      fire_success: boolean;
      fire_price: number | null;
      items_count: number;
      items_success: boolean;
      error: string | null;
    } | null;
  } | null;
  next_collection: number | null;
}

interface FireHistoryRecord {
  id: string;
  season_id: string;
  rmb_per_10k_fire: number;
  fire_per_rmb: number;
  increase_ratio: number | null;
  trading_volume: string;
  source: string;
  source_time: string;
  recorded_at: number;
  created_at: number;
}

interface ItemsHistoryRecord {
  id: string;
  item_id: string;
  season_id: string;
  name: string;
  item_type: string | null;
  price: number;
  last_time: number | null;
  recorded_at: number;
  created_at: number;
}

type ConnectionStatus = "connected" | "disconnected" | "error";
type DataType = "fire" | "items";
type SyncMode = "normal" | "expert";
type TimeRange = "24h" | "3d" | "7d" | "30d" | "season";

export default function DataMonitorPage() {
  const [serverUrl, setServerUrl] = useState(() => {
    return localStorage.getItem("server_url") || "http://localhost:8080";
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [dataType, setDataType] = useState<DataType>("fire");
  const [syncMode, setSyncMode] = useState<SyncMode>("normal");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
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

  const getTimeRangeHours = (range: TimeRange): number => {
    switch (range) {
      case "24h": return 24;
      case "3d": return 72;
      case "7d": return 168;
      case "30d": return 720;
      case "season": return 99999;
    }
  };

  const syncMutation = useMutation({
    mutationFn: async () => {
      const modeParam = syncMode === "expert" ? "expert" : "normal";
      const hours = getTimeRangeHours(timeRange);
      const marketMode = syncMode === "expert" ? "season_expert" : "season_normal";
      
      if (dataType === "fire") {
        const url = hours === 99999 
          ? `${serverUrl}/fire-history-all?season_id=${marketContext.seasonId}&market_mode=season_${syncMode}`
          : `${serverUrl}/fire-history?mode=${modeParam}&limit=${hours}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch fire data");
        const data = await response.json();
        if (!data.success) throw new Error(data.error || "Unknown error");
        
        const records = data.data as FireHistoryRecord[];
        if (records.length === 0) {
          return { synced: 0, message: "没有可同步的火价数据" };
        }
        
        let synced = 0;
        for (const record of records) {
          try {
            await cmd.syncFireRecord({
              season_id: record.season_id,
              market_mode: marketMode,
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
            console.error("Fire sync error:", err);
          }
        }
        return { synced, type: "fire" };
      } else {
        const url = hours === 99999 
          ? `${serverUrl}/items-history-all?season_id=${marketContext.seasonId}&market_mode=season_${syncMode}`
          : `${serverUrl}/items-history?mode=${modeParam}&limit=${hours}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch items data");
        const data = await response.json();
        if (!data.success) throw new Error(data.error || "Unknown error");
        
        const records = data.data as ItemsHistoryRecord[];
        if (records.length === 0) {
          return { synced: 0, message: "没有可同步的物品数据" };
        }
        
        let synced = 0;
        for (const record of records) {
          try {
            await cmd.syncItemsRecord({
              season_id: record.season_id,
              market_mode: marketMode,
              item_id: record.item_id,
              name: record.name,
              item_type: record.item_type,
              price: record.price,
              last_time: record.last_time,
              recorded_at: record.recorded_at,
            });
            synced++;
          } catch (err) {
            console.error("Items sync error:", err);
          }
        }
        return { synced, type: "items" };
      }
    },
    onSuccess: (result) => {
      if (result.message) {
        toast.info(result.message);
      } else {
        const typeName = result.type === "fire" ? "火价" : "物品价格";
        toast.success(`已同步 ${result.synced} 条${typeName}到本地数据库`);
      }
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

  const normalStatus = serverStatus?.last_collection?.normal;
  const expertStatus = serverStatus?.last_collection?.expert;

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
                <div className="text-xs text-slate-400">下次采集</div>
                <div className="text-sm font-medium text-slate-700">
                  {serverStatus.next_collection ? formatTimestamp(serverStatus.next_collection) : "-"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Collection Status */}
      <div className="grid grid-cols-2 gap-4">
        {/* Normal Mode */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">普通服</span>
          </div>

          {normalStatus ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {normalStatus.fire_success ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm">火价</span>
                <span className="ml-auto font-medium">
                  {normalStatus.fire_success ? `${normalStatus.fire_price?.toFixed(2)} RMB/10K` : "失败"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {normalStatus.items_success ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm">物品</span>
                <span className="ml-auto font-medium">
                  {normalStatus.items_success ? `${normalStatus.items_count} 个` : "失败"}
                </span>
              </div>
              <div className="text-xs text-slate-400 text-right">
                {formatTimestamp(normalStatus.timestamp)}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400 text-center py-4">暂无数据</div>
          )}
        </div>

        {/* Expert Mode */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">专家服</span>
          </div>

          {expertStatus ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {expertStatus.fire_success ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm">火价</span>
                <span className="ml-auto font-medium">
                  {expertStatus.fire_success ? `${expertStatus.fire_price?.toFixed(2)} RMB/10K` : "失败"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {expertStatus.items_success ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm">物品</span>
                <span className="ml-auto font-medium">
                  {expertStatus.items_success ? `${expertStatus.items_count} 个` : "失败"}
                </span>
              </div>
              <div className="text-xs text-slate-400 text-right">
                {formatTimestamp(expertStatus.timestamp)}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400 text-center py-4">暂无数据</div>
          )}
        </div>
      </div>

      {/* Data Sync */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Download className="w-4 h-4 text-green-500" />
          <h2 className="text-sm font-semibold text-slate-700">数据同步</h2>
        </div>

        <div className="space-y-4">
          {/* Data Type */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">数据类型</label>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setDataType("fire")}
                className={`px-3 py-1.5 text-xs ${
                  dataType === "fire" 
                    ? "bg-green-500 text-white" 
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                火价
              </button>
              <button
                onClick={() => setDataType("items")}
                className={`px-3 py-1.5 text-xs ${
                  dataType === "items" 
                    ? "bg-green-500 text-white" 
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                物品价格
              </button>
            </div>
          </div>

          {/* Mode */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">服务器模式</label>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setSyncMode("normal")}
                className={`px-3 py-1.5 text-xs ${
                  syncMode === "normal" 
                    ? "bg-blue-500 text-white" 
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                普通服
              </button>
              <button
                onClick={() => setSyncMode("expert")}
                className={`px-3 py-1.5 text-xs ${
                  syncMode === "expert" 
                    ? "bg-purple-500 text-white" 
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                专家服
              </button>
            </div>
          </div>

          {/* Time Range */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">时间范围</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="24h">24小时</option>
              <option value="3d">3天</option>
              <option value="7d">7天</option>
              <option value="30d">30天</option>
              <option value="season">整赛季</option>
            </select>
          </div>

          {/* Sync Button */}
          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending || connectionStatus !== "connected"}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className={`w-4 h-4 ${syncMutation.isPending ? "animate-bounce" : ""}`} />
              {syncMutation.isPending ? "同步中..." : "同步数据"}
            </button>
            
            <span className="text-xs text-slate-400">
              同步 {dataType === "fire" ? "火价" : "物品价格"} / {syncMode === "normal" ? "普通服" : "专家服"} / {timeRange === "season" ? "整赛季" : timeRange}
            </span>
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

      {/* Server Admin Panel */}
      <ServerAdminPanel
        serverUrl={serverUrl}
        connectionStatus={connectionStatus}
        serverStatus={serverStatus}
      />
    </div>
  );
}
