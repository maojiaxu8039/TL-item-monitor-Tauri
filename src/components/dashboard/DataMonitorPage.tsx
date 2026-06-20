import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Download, RefreshCw, Server, Wifi, WifiOff, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp, Loader2, Zap } from "lucide-react";
import { cmd } from "@/lib/commands";
import { errorMessage } from "@/lib/utils";
import { formatTimestamp } from "@/lib/format";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { useSyncContext } from "@/contexts/SyncContext";
import { toast } from "sonner";
import ServerAdminPanel from "./ServerAdminPanel";
import type { SyncJobState, SyncFailure, FastSyncResponse, LatestPricesResponse } from "@/lib/commands";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ToolbarActions } from "@/components/ui/Toolbar";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { queryKeys } from "@/lib/queryKeys";

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
  cursor_id?: number;
  id?: string;
  season_id: string;
  market_mode?: string;
  rmb_per_10k_fire: number;
  fire_per_rmb: number;
  increase_ratio: number | null;
  trading_volume: string;
  source: string;
  source_time: string;
  scraped_at: number;
  created_at?: number;
}

interface ItemsHistoryRecord {
  cursor_id?: number;
  id?: string;
  item_id: string;
  season_id: string;
  market_mode?: string;
  name?: string | null;
  item_type?: string | null;
  price?: number;
  fire_price?: number;
  last_time: number | null;
  scraped_at: number;
  season_day?: number;
  created_at?: number;
}

type ConnectionStatus = "connected" | "disconnected" | "error";
type DataType = "fire" | "items";
type SyncMode = "normal" | "expert";
type TimeRange = "24h" | "3d" | "7d" | "30d" | "season";

const PAGE_SIZE = 500;
const ITEMS_SYNC_CURSOR_PREFIX = "items_sync_cursor_v2";

function getTimeRangeHours(range: TimeRange): number | null {
  switch (range) {
    case "24h": return 24;
    case "3d": return 72;
    case "7d": return 168;
    case "30d": return 720;
    case "season": return null;
  }
}

function getTimeRangeSinceTimestamp(range: TimeRange): number | null {
  const hours = getTimeRangeHours(range);
  return hours ? Math.floor(Date.now() / 1000) - hours * 3600 : null;
}

function getItemsSyncCursorKey(serverUrl: string, seasonId: string, mode: SyncMode) {
  return `${ITEMS_SYNC_CURSOR_PREFIX}:${serverUrl.trim()}:${seasonId}:${mode}`;
}

function readItemsSyncCursor(serverUrl: string, seasonId: string, mode: SyncMode): number | null {
  const stored = localStorage.getItem(getItemsSyncCursorKey(serverUrl, seasonId, mode));
  if (!stored) return null;
  const timestamp = Number.parseInt(stored, 10);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function createEmptySyncJob(dataType: DataType, mode: SyncMode, range: TimeRange): SyncJobState {
  return {
    id: `sync-${Date.now()}`,
    dataType,
    mode,
    range,
    status: "idle",
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    startedAt: 0,
    finishedAt: null,
    firstError: null,
    failures: [],
  };
}

export default function DataMonitorPage() {
  const [serverUrl, setServerUrl] = useState(() => {
    return localStorage.getItem("server_url") || "https://luosan.iepose.cn";
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [dataType, setDataType] = useState<DataType>("fire");
  const [syncMode, setSyncMode] = useState<SyncMode>("normal");
  const [syncMethod, setSyncMethod] = useState<"normal" | "fast" | "latest">("normal");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [showFailures, setShowFailures] = useState(false);
  const [fastSyncStats, setFastSyncStats] = useState<{ items: number; days: number } | null>(null);
  const { marketContext } = useSectionRefresh();
  const [lastItemsSyncTimestamp, setLastItemsSyncTimestamp] = useState<number | null>(() =>
    readItemsSyncCursor(serverUrl, marketContext.seasonId, syncMode)
  );
  const { syncJob, setSyncJob, restoreSyncJob } = useSyncContext();
  const queryClient = useQueryClient();
  const syncAbortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    restoreSyncJob();
  }, [restoreSyncJob]);

  useEffect(() => {
    setLastItemsSyncTimestamp(readItemsSyncCursor(serverUrl, marketContext.seasonId, syncMode));
  }, [serverUrl, marketContext.seasonId, syncMode]);

  useEffect(() => {
    return () => {
      if (syncAbortRef.current) {
        syncAbortRef.current();
        syncAbortRef.current = null;
      }
    };
  }, []);

  const checkServerStatus = async (): Promise<ServerStatus | null> => {
    try {
      const data = await cmd.fetchServerJson<{ success: boolean; data?: ServerStatus }>(`${serverUrl}/status`);
      if (data.success) {
        return data.data ?? null;
      }
      return null;
    } catch {
      return null;
    }
  };

  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: [...queryKeys.serverStatus, serverUrl],
    queryFn: checkServerStatus,
    enabled: false,
    retry: 0,
  });

  useEffect(() => {
    setServerStatus(statusData || null);
    setConnectionStatus(statusData ? "connected" : "disconnected");
  }, [statusData]);

  const syncSinglePage = async (
    records: FireHistoryRecord[] | ItemsHistoryRecord[],
    dataType: DataType,
    marketMode: string,
    marketContext: { seasonId: string }
  ): Promise<{ success: number; failed: number; skipped: number; failures: SyncFailure[] }> => {
    const now = Date.now();

    if (dataType === "fire") {
      const fireRecords = (records as FireHistoryRecord[]).map((record) => ({
        season_id: record.season_id,
        market_mode: marketMode,
        rmb_per_10k_fire: record.rmb_per_10k_fire,
        fire_per_rmb: record.fire_per_rmb,
        increase_ratio: record.increase_ratio ?? 0,
        trading_volume: record.trading_volume,
        source: record.source,
        source_time: record.source_time,
        recorded_at: record.scraped_at,
      }));

      try {
        await cmd.syncFireBatch({
          season_id: marketContext.seasonId,
          market_mode: marketMode,
          records: fireRecords,
        });
        return { success: fireRecords.length, failed: 0, skipped: 0, failures: [] };
      } catch (err) {
        const msg = errorMessage(err);
        return {
          success: 0,
          failed: fireRecords.length,
          skipped: 0,
          failures: [{
            itemId: "batch",
            itemName: "批量同步",
            recordType: dataType,
            reason: msg,
            timestamp: now,
          }],
        };
      }
    } else {
      const items = (records as ItemsHistoryRecord[]).map((record) => ({
        season_id: record.season_id || marketContext.seasonId,
        market_mode: marketMode,
        item_id: record.item_id,
        name: record.name || record.item_id,
        item_type: record.item_type ?? null,
        price: record.price ?? record.fire_price ?? 0,
        last_time: record.last_time ?? record.scraped_at,
        recorded_at: record.scraped_at,
      }));

      try {
        await cmd.syncItemsBatch({
          season_id: marketContext.seasonId,
          market_mode: marketMode,
          items,
        });
        return { success: items.length, failed: 0, skipped: 0, failures: [] };
      } catch (err) {
        const msg = errorMessage(err);
        return {
          success: 0,
          failed: items.length,
          skipped: 0,
          failures: [{
            itemId: "batch",
            itemName: "批量同步",
            recordType: dataType,
            reason: msg,
            timestamp: now,
          }],
        };
      }
    }
  };

  const syncPaginated = useCallback(async () => {
    // Cancel any existing sync
    if (syncAbortRef.current) {
      syncAbortRef.current();
      syncAbortRef.current = null;
    }

    let cancelled = false;
    syncAbortRef.current = () => { cancelled = true; };

    const modeParam = syncMode === "expert" ? "expert" : "normal";
    const rangeSinceTimestamp = getTimeRangeSinceTimestamp(timeRange);
    const marketMode = syncMode === "expert" ? "season_expert" : "season_normal";

    let job = createEmptySyncJob(dataType, syncMode, timeRange);
    job = { ...job, status: "running" as const, startedAt: Date.now() };
    setSyncJob(job);

    let totalSuccess = 0;
    let totalFailed = 0;
    let allFailures: SyncFailure[] = [];
    let hasMore = true;
    let maxScrapedAt = 0;
    let pageCount = 0;
    let lastUiUpdate = Date.now();
    let beforeTimestamp: number | null = null;
    let beforeId: number | null = null;

    try {
      if (dataType === "fire") {
        const timestampParam = rangeSinceTimestamp ? `&since_timestamp=${rangeSinceTimestamp}` : "";
        const baseUrl = `${serverUrl}/fire-history-all?mode=${modeParam}${timestampParam}`;

        while (hasMore && !cancelled) {
          const cursorParam = beforeTimestamp !== null && beforeId !== null
            ? `&before_timestamp=${beforeTimestamp}&before_id=${beforeId}`
            : "";
          const url = `${baseUrl}&limit=${PAGE_SIZE}${cursorParam}`;
          const result = await cmd.fetchServerJson<{ success: boolean; data: FireHistoryRecord[]; error?: string }>(url);
          if (cancelled) break;
          if (!result.success) throw new Error(result.error || "Unknown error");

          const records = result.data as FireHistoryRecord[];

          if (records.length === 0) {
            hasMore = false;
            break;
          }

          const pageResult = await syncSinglePage(records, dataType, marketMode, marketContext);
          if (cancelled) break;
          const lastRecord = records[records.length - 1];
          beforeTimestamp = lastRecord.scraped_at ?? null;
          beforeId = lastRecord.cursor_id ?? null;
          totalSuccess += pageResult.success;
          totalFailed += pageResult.failed;
          allFailures = [...allFailures, ...pageResult.failures];

          const processedCount = totalSuccess + totalFailed;
          job = {
            ...job,
            success: processedCount,
            failed: totalFailed,
            total: records.length < PAGE_SIZE ? processedCount : processedCount + PAGE_SIZE,
            failures: allFailures.slice(0, 10),
          };
          pageCount++;
          const now = Date.now();
          if (pageCount % 5 === 0 || now - lastUiUpdate >= 500 || records.length < PAGE_SIZE) {
            setSyncJob(job);
            lastUiUpdate = now;
          }

          if (records.length < PAGE_SIZE) {
            hasMore = false;
          }
        }
      } else {
        const syncSinceTimestamp = Math.max(rangeSinceTimestamp ?? 0, lastItemsSyncTimestamp ?? 0);
        const timestampParam = syncSinceTimestamp ? `&since_timestamp=${syncSinceTimestamp}` : "";
        const baseUrl = `${serverUrl}/items-history-all?mode=${modeParam}${timestampParam}`;

        while (hasMore && !cancelled) {
          const cursorParam = beforeTimestamp !== null && beforeId !== null
            ? `&before_timestamp=${beforeTimestamp}&before_id=${beforeId}`
            : "";
          const url = `${baseUrl}&limit=${PAGE_SIZE}${cursorParam}`;
          const result = await cmd.fetchServerJson<{ success: boolean; data: ItemsHistoryRecord[]; error?: string }>(url);
          if (cancelled) break;
          if (!result.success) throw new Error(result.error || "Unknown error");

          const records = result.data as ItemsHistoryRecord[];

          if (records.length === 0) {
            hasMore = false;
            break;
          }

          const pageResult = await syncSinglePage(records, dataType, marketMode, marketContext);
          if (cancelled) break;
          const lastRecord = records[records.length - 1];
          beforeTimestamp = lastRecord.scraped_at ?? null;
          beforeId = lastRecord.cursor_id ?? null;
          if (pageResult.success > 0) {
            records.forEach(r => { if (r.scraped_at > maxScrapedAt) maxScrapedAt = r.scraped_at; });
          }
          totalSuccess += pageResult.success;
          totalFailed += pageResult.failed;
          allFailures = [...allFailures, ...pageResult.failures];

          const processedCount = totalSuccess + totalFailed;
          job = {
            ...job,
            success: processedCount,
            failed: totalFailed,
            total: records.length < PAGE_SIZE ? processedCount : processedCount + PAGE_SIZE,
            failures: allFailures.slice(0, 10),
          };
          pageCount++;
          const now = Date.now();
          if (pageCount % 5 === 0 || now - lastUiUpdate >= 500 || records.length < PAGE_SIZE) {
            setSyncJob(job);
            lastUiUpdate = now;
          }

          if (records.length < PAGE_SIZE) {
            hasMore = false;
          }
        }
      }

      if (cancelled) {
        job = { ...job, status: "idle" as const };
        setSyncJob(job);
        syncAbortRef.current = null;
        return;
      }

      job = {
        ...job,
        status: totalFailed > 0 ? (totalSuccess > 0 ? "partial" : "failed") : "success",
        finishedAt: Date.now(),
        firstError: allFailures[0]?.reason ?? null,
      };
      setSyncJob(job);
      syncAbortRef.current = null;

      if (dataType === "items" && totalFailed === 0 && maxScrapedAt > 0) {
        localStorage.setItem(
          getItemsSyncCursorKey(serverUrl, marketContext.seasonId, syncMode),
          maxScrapedAt.toString()
        );
        setLastItemsSyncTimestamp(maxScrapedAt);
      }

      if (totalSuccess + totalFailed === 0) {
        toast.info("没有可同步的数据");
      } else if (job.status === "partial") {
        toast.error(`部分同步成功: 成功 ${totalSuccess}，失败 ${totalFailed}`);
      } else if (job.status === "failed") {
        toast.error(`同步失败: ${errorMessage(allFailures[0]?.reason)}`);
      } else {
        toast.success(`同步成功: ${totalSuccess} 条`);
      }
    } catch (err) {
      job.status = "failed";
      job.finishedAt = Date.now();
      job.firstError = errorMessage(err);
      setSyncJob({ ...job });
      toast.error(`同步失败: ${job.firstError}`);
    }

    refetchStatus();
  }, [dataType, syncMode, timeRange, serverUrl, marketContext, refetchStatus, lastItemsSyncTimestamp, setSyncJob]);

  const handleSaveUrl = () => {
    localStorage.setItem("server_url", serverUrl);
    refetchStatus();
    toast.success("服务器地址已保存");
  };

  const formatUptime = useCallback((seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}小时${minutes}分钟`;
  }, []);

  const formatDuration = useCallback((ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}分钟`;
  }, []);

  const getSyncStatusBadge = () => {
    if (!syncJob) return null;

    switch (syncJob.status) {
      case "running":
        return (
          <StatusBadge variant="info">
            <Loader2 className="w-3 h-3 animate-spin" />
            同步中
          </StatusBadge>
        );
      case "success":
        return (
          <StatusBadge variant="success">
            <CheckCircle className="w-3 h-3" />
            成功
          </StatusBadge>
        );
      case "partial":
        return (
          <StatusBadge variant="warning">
            <AlertCircle className="w-3 h-3" />
            部分成功
          </StatusBadge>
        );
      case "failed":
        return (
          <StatusBadge variant="danger">
            <XCircle className="w-3 h-3" />
            失败
          </StatusBadge>
        );
      default:
        return null;
    }
  };

  const getSyncProgress = () => {
    if (!syncJob || syncJob.total === 0) return 0;
    return Math.round(((syncJob.success + syncJob.failed) / syncJob.total) * 100);
  };

  const normalStatus = serverStatus?.last_collection?.normal;
  const expertStatus = serverStatus?.last_collection?.expert;

  const syncFast = useCallback(async () => {
    const marketMode = syncMode === "expert" ? "season_expert" : "season_normal";
    const mode = syncMode;

    const jobState: SyncJobState = {
      id: `sync-${Date.now()}`,
      dataType: "items",
      mode,
      range: timeRange,
      status: "running",
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      startedAt: Date.now(),
      finishedAt: null,
      firstError: null,
      failures: [],
    };
    setSyncJob(jobState);

    try {
      const startTime = Date.now();
      const baseUrl = serverUrl.replace(/\/$/, "");

      const params = new URLSearchParams({
        season: marketContext.seasonId,
        mode,
      });

      if (timeRange === "season") {
        params.set("min_day", "1");
        params.set("max_day", "70");
      } else if (timeRange === "30d") {
        const day = Math.max(1, 70 - 30);
        params.set("min_day", day.toString());
        params.set("max_day", "70");
      } else if (timeRange === "7d") {
        params.set("min_day", "64");
        params.set("max_day", "70");
      } else if (timeRange === "3d") {
        params.set("min_day", "68");
        params.set("max_day", "70");
      } else {
        params.set("min_day", "69");
        params.set("max_day", "70");
      }

      toast.info("正在获取高效同步数据...");

      const response = await fetch(`${baseUrl}/sync-fast?${params.toString()}`);
      const data = await response.json();

      if (!data.success || !data.data) {
        throw new Error(data.error || "获取数据失败");
      }

      const result: FastSyncResponse = data.data;
      setFastSyncStats({ items: result.total_items, days: result.total_days });

      const allItems: Array<{
        season_id: string;
        market_mode: string;
        item_id: string;
        name: string;
        item_type: string | null;
        price: number;
        last_time: number | null;
        recorded_at: number;
      }> = [];

      for (const item of result.items) {
        for (const dayPrice of item.daily_prices) {
          allItems.push({
            season_id: marketContext.seasonId,
            market_mode: marketMode,
            item_id: item.item_id,
            name: item.name,
            item_type: null,
            price: dayPrice.close,
            last_time: null,
            recorded_at: dayPrice.day * 86400,
          });
        }
      }

      const BATCH_SIZE = 500;
      let successCount = 0;
      for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
        const batch = allItems.slice(i, i + BATCH_SIZE);
        try {
          const result = await cmd.syncItemsBatch({
            season_id: marketContext.seasonId,
            market_mode: marketMode,
            items: batch,
          });
          if (result.success) {
            successCount += batch.length;
          }
        } catch {
          // 批次失败，继续下一个
        }
      }

      const elapsed = Date.now() - startTime;

      const finalState: SyncJobState = {
        ...jobState,
        status: "success",
        total: result.total_items,
        success: successCount,
        failed: allItems.length - successCount,
        skipped: 0,
        finishedAt: Date.now(),
      };
      setSyncJob(finalState);

      toast.success(
        `快速同步完成: ${result.total_items} 个物品, ${result.total_days} 天, ${successCount} 条记录, 耗时 ${(elapsed / 1000).toFixed(1)}s`
      );

      queryClient.invalidateQueries({ queryKey: queryKeys.marketContext });

    } catch (error) {
      const errorMsg = errorMessage(error as Error);
      toast.error(`快速同步失败: ${errorMsg}`);

      const finalState: SyncJobState = {
        ...jobState,
        status: "failed",
        finishedAt: Date.now(),
        firstError: errorMsg,
      };
      setSyncJob(finalState);
    }
  }, [syncMode, timeRange, serverUrl, marketContext.seasonId, setSyncJob, queryClient]);

  const syncLatest = useCallback(async () => {
    const marketMode = syncMode === "expert" ? "season_expert" : "season_normal";
    const mode = syncMode;

    const jobState: SyncJobState = {
      id: `sync-${Date.now()}`,
      dataType: "items",
      mode,
      range: timeRange,
      status: "running",
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      startedAt: Date.now(),
      finishedAt: null,
      firstError: null,
      failures: [],
    };
    setSyncJob(jobState);

    try {
      const startTime = Date.now();
      const baseUrl = serverUrl.replace(/\/$/, "");

      toast.info("正在获取最新价格数据...");

      const response = await fetch(`${baseUrl}/prices-latest?season=${marketContext.seasonId}&mode=${mode}`);
      const data = await response.json();

      if (!data.success || !data.data) {
        throw new Error(data.error || "获取数据失败");
      }

      const result: LatestPricesResponse = data.data;

      const allItems = result.prices.map(price => ({
        season_id: marketContext.seasonId,
        market_mode: marketMode,
        item_id: price.item_id,
        name: price.name,
        item_type: null,
        price: price.fire_price,
        last_time: null,
        recorded_at: Date.now(),
      }));

      const batchResult = await cmd.syncItemsBatch({
        season_id: marketContext.seasonId,
        market_mode: marketMode,
        items: allItems,
      });

      const elapsed = Date.now() - startTime;

      const finalState: SyncJobState = {
        ...jobState,
        status: batchResult.success ? "success" : "partial",
        total: result.prices.length,
        success: batchResult.success ? result.prices.length : 0,
        failed: batchResult.success ? 0 : result.prices.length,
        skipped: 0,
        finishedAt: Date.now(),
      };
      setSyncJob(finalState);

      toast.success(
        `最新价格同步完成: ${result.prices.length} 个物品, 耗时 ${(elapsed / 1000).toFixed(1)}s`
      );

      queryClient.invalidateQueries({ queryKey: queryKeys.marketContext });

    } catch (error) {
      const errorMsg = errorMessage(error as Error);
      toast.error(`最新价格同步失败: ${errorMsg}`);

      const finalState: SyncJobState = {
        ...jobState,
        status: "failed",
        finishedAt: Date.now(),
        firstError: errorMsg,
      };
      setSyncJob(finalState);
    }
  }, [syncMode, timeRange, serverUrl, marketContext.seasonId, setSyncJob, queryClient]);

  const handleSync = useCallback(() => {
    if (syncMethod === "fast") {
      syncFast();
    } else if (syncMethod === "latest") {
      syncLatest();
    } else {
      syncPaginated();
    }
  }, [syncMethod, syncPaginated, syncFast, syncLatest]);

  const isSyncing = syncJob?.status === "running";

  return (
    <PageShell size="xl" className="space-y-5">
      <PageHeader
        title="数据监控"
        description="管理与服务器的数据同步"
        iconAsset="data-monitor"
        actions={
          <ToolbarActions>
            <Button variant="outline" size="sm" onClick={() => refetchStatus()}>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              检测连接
            </Button>
          </ToolbarActions>
        }
      />

      <Surface padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-4 h-4 text-[var(--color-brand)]" />
          <h2 className="text-sm font-semibold text-[var(--color-text)]">服务器连接</h2>
          <div className="ml-auto flex items-center gap-2">
            {connectionStatus === "connected" ? (
              <>
                <Wifi className="w-5 h-5 text-[var(--color-success)]" />
                <span className="text-[var(--color-success)]">已连接</span>
              </>
            ) : connectionStatus === "error" ? (
              <>
                <AlertCircle className="w-5 h-5 text-[var(--color-brand-gold)]" />
                <span className="text-[var(--color-brand-gold)]">连接错误</span>
              </>
            ) : (
              <>
                <WifiOff className="w-5 h-5 text-[var(--color-text-subtle)]" />
                <span className="text-[var(--color-text-subtle)]">未连接</span>
              </>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[var(--color-text-subtle)] mb-1">服务器地址</label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://192.168.1.100:8080"
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
              />
            </div>
            <button
              onClick={handleSaveUrl}
              className="mt-5 px-4 py-2 bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-black text-sm rounded-lg hover:opacity-90 transition-opacity"
            >
              保存
            </button>
          </div>

          {serverStatus && (
            <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-[var(--color-border-soft)]">
              <MetricCard
                label="版本"
                value={serverStatus.version}
                icon={Server}
                iconBg="bg-[rgba(255,184,0,0.08)]"
                iconColor="text-[var(--color-brand)]"
              />
              <MetricCard
                label="运行时长"
                value={formatUptime(serverStatus.uptime_seconds)}
                icon={RefreshCw}
                iconBg="bg-[rgba(34,197,94,0.1)]"
                iconColor="text-[var(--color-success)]"
              />
              <MetricCard
                label="赛季"
                value={serverStatus.season_id}
                icon={Database}
                iconBg="bg-[rgba(167,139,250,0.12)]"
                iconColor="text-[var(--color-ai)]"
              />
              <MetricCard
                label="下次采集"
                value={serverStatus.next_collection ? formatTimestamp(serverStatus.next_collection) : "-"}
                icon={Loader2}
                iconBg="bg-[rgba(255,184,0,0.08)]"
                iconColor="text-[var(--color-brand-gold)]"
              />
            </div>
          )}
        </div>
      </Surface>

      <div className="grid grid-cols-2 gap-4">
        <Surface padding="md">
          <div className="flex items-center gap-2 mb-4">
            <StatusBadge variant="info">普通服</StatusBadge>
          </div>

          {normalStatus ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {normalStatus.fire_success ? (
                    <CheckCircle className="w-4 h-4 text-[var(--color-success)]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-[var(--color-danger)]" />
                  )}
                  <span className="text-sm text-[var(--color-text-muted)]">火价</span>
                </div>
                <span className={`font-medium ${normalStatus.fire_success ? "text-[var(--color-text)]" : "text-[var(--color-danger)]"}`}>
                  {normalStatus.fire_success ? `${normalStatus.fire_price?.toFixed(2)} RMB/10K` : "失败"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {normalStatus.items_success ? (
                    <CheckCircle className="w-4 h-4 text-[var(--color-success)]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-[var(--color-danger)]" />
                  )}
                  <span className="text-sm text-[var(--color-text-muted)]">物品</span>
                </div>
                <span className={`font-medium ${normalStatus.items_success ? "text-[var(--color-text)]" : "text-[var(--color-danger)]"}`}>
                  {normalStatus.items_success ? `${normalStatus.items_count} 个` : "失败"}
                </span>
              </div>
              <div className="text-xs text-[var(--color-text-subtle)] text-right pt-2 border-t border-[var(--color-border-soft)]">
                {formatTimestamp(normalStatus.timestamp)}
              </div>
            </div>
          ) : (
            <EmptyState description="暂无数据" />
          )}
        </Surface>

        <Surface padding="md">
          <div className="flex items-center gap-2 mb-4">
            <StatusBadge variant="default">专家服</StatusBadge>
          </div>

          {expertStatus ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {expertStatus.fire_success ? (
                    <CheckCircle className="w-4 h-4 text-[var(--color-success)]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-[var(--color-danger)]" />
                  )}
                  <span className="text-sm text-[var(--color-text-muted)]">火价</span>
                </div>
                <span className={`font-medium ${expertStatus.fire_success ? "text-[var(--color-text)]" : "text-[var(--color-danger)]"}`}>
                  {expertStatus.fire_success ? `${expertStatus.fire_price?.toFixed(2)} RMB/10K` : "失败"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {expertStatus.items_success ? (
                    <CheckCircle className="w-4 h-4 text-[var(--color-success)]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-[var(--color-danger)]" />
                  )}
                  <span className="text-sm text-[var(--color-text-muted)]">物品</span>
                </div>
                <span className={`font-medium ${expertStatus.items_success ? "text-[var(--color-text)]" : "text-[var(--color-danger)]"}`}>
                  {expertStatus.items_success ? `${expertStatus.items_count} 个` : "失败"}
                </span>
              </div>
              <div className="text-xs text-[var(--color-text-subtle)] text-right pt-2 border-t border-[var(--color-border-soft)]">
                {formatTimestamp(expertStatus.timestamp)}
              </div>
            </div>
          ) : (
            <EmptyState description="暂无数据" />
          )}
        </Surface>
      </div>

      <Surface padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <Download className="w-4 h-4 text-[var(--color-success)]" />
          <h2 className="text-sm font-semibold text-[var(--color-text)]">数据同步</h2>
          {syncJob && getSyncStatusBadge()}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-text-subtle)]">数据类型</label>
            <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
              <button
                onClick={() => setDataType("fire")}
                disabled={isSyncing}
                className={`px-3 py-1.5 text-xs ${
                  dataType === "fire"
                    ? "bg-[var(--color-success)] text-black"
                    : "bg-[var(--color-panel)] text-[var(--color-text-muted)] hover:bg-[var(--color-panel-soft)]"
                } disabled:opacity-50`}
              >
                火价
              </button>
              <button
                onClick={() => setDataType("items")}
                disabled={isSyncing}
                className={`px-3 py-1.5 text-xs ${
                  dataType === "items"
                    ? "bg-[var(--color-success)] text-black"
                    : "bg-[var(--color-panel)] text-[var(--color-text-muted)] hover:bg-[var(--color-panel-soft)]"
                } disabled:opacity-50`}
              >
                物品价格
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-text-subtle)]">服务器模式</label>
            <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
              <button
                onClick={() => setSyncMode("normal")}
                disabled={isSyncing}
                className={`px-3 py-1.5 text-xs ${
                  syncMode === "normal"
                    ? "bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-black"
                    : "bg-[var(--color-panel)] text-[var(--color-text-muted)] hover:bg-[var(--color-panel-soft)]"
                } disabled:opacity-50`}
              >
                普通服
              </button>
              <button
                onClick={() => setSyncMode("expert")}
                disabled={isSyncing}
                className={`px-3 py-1.5 text-xs ${
                  syncMode === "expert"
                    ? "bg-[var(--color-ai)] text-black"
                    : "bg-[var(--color-panel)] text-[var(--color-text-muted)] hover:bg-[var(--color-panel-soft)]"
                } disabled:opacity-50`}
              >
                专家服
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-text-subtle)]">时间范围</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              disabled={isSyncing}
              className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30 disabled:opacity-50"
            >
              <option value="24h">24小时</option>
              <option value="3d">3天</option>
              <option value="7d">7天</option>
              <option value="30d">30天</option>
              <option value="season">整赛季</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-[var(--color-text-subtle)]">
              <input
                type="checkbox"
                checked={timeRange === "season"}
                readOnly
                disabled
                className="rounded border-[var(--color-border)] text-[var(--color-brand)] focus:ring-[var(--color-brand)] disabled:opacity-50"
              />
              自动分页同步（每页 {PAGE_SIZE} 条）
            </label>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-text-subtle)]">同步方式</label>
            <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
              <button
                onClick={() => setSyncMethod("normal")}
                disabled={isSyncing}
                className={`px-3 py-1.5 text-xs flex items-center gap-1 ${
                  syncMethod === "normal"
                    ? "bg-[var(--color-panel)] text-[var(--color-text)] border border-[var(--color-brand)]"
                    : "bg-[var(--color-panel)] text-[var(--color-text-muted)] hover:bg-[var(--color-panel-soft)]"
                } disabled:opacity-50`}
              >
                <RefreshCw className="w-3 h-3" />
                普通
              </button>
              <button
                onClick={() => setSyncMethod("fast")}
                disabled={isSyncing}
                className={`px-3 py-1.5 text-xs flex items-center gap-1 ${
                  syncMethod === "fast"
                    ? "bg-[var(--color-brand)] text-black"
                    : "bg-[var(--color-panel)] text-[var(--color-text-muted)] hover:bg-[var(--color-panel-soft)]"
                } disabled:opacity-50`}
              >
                <Zap className="w-3 h-3" />
                快速
              </button>
              <button
                onClick={() => setSyncMethod("latest")}
                disabled={isSyncing}
                className={`px-3 py-1.5 text-xs flex items-center gap-1 ${
                  syncMethod === "latest"
                    ? "bg-[var(--color-success)] text-black"
                    : "bg-[var(--color-panel)] text-[var(--color-text-muted)] hover:bg-[var(--color-panel-soft)]"
                } disabled:opacity-50`}
              >
                <Download className="w-3 h-3" />
                最新
              </button>
            </div>
            <span className="text-xs text-[var(--color-text-subtle)]">
              {syncMethod === "normal" && "（串行分页，较慢）"}
              {syncMethod === "fast" && "（服务端聚合，推荐）"}
              {syncMethod === "latest" && "（仅最新价格）"}
            </span>
          </div>

          {fastSyncStats && (
            <div className="text-xs text-[var(--color-text-subtle)] bg-[var(--color-panel-soft)] rounded-lg px-3 py-2">
              上次快速同步: {fastSyncStats.items} 个物品, {fastSyncStats.days} 天
            </div>
          )}

          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={handleSync}
              disabled={isSyncing || connectionStatus !== "connected"}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--color-success)] text-black text-sm rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  同步中...
                </>
              ) : (
                <>
                  {syncMethod === "fast" ? <Zap className="w-4 h-4" /> : syncMethod === "latest" ? <Download className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                  {syncMethod === "fast" ? "快速同步" : syncMethod === "latest" ? "获取最新" : "同步数据"}
                </>
              )}
            </button>

            <span className="text-xs text-[var(--color-text-subtle)]">
              同步 {dataType === "fire" ? "火价" : "物品价格"} / {syncMode === "normal" ? "普通服" : "专家服"} / {timeRange === "season" ? "整赛季" : timeRange}
            </span>
          </div>

          {syncJob && syncJob.status === "running" && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-[var(--color-text-subtle)]">
                <span>进度</span>
                <span>{getSyncProgress()}%</span>
              </div>
              <div className="w-full bg-[var(--color-panel)] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(getSyncProgress(), 100)}%` }}
                />
              </div>
              <div className="flex gap-4 text-xs">
                <span className="text-[var(--color-success)]">成功: {syncJob.success.toLocaleString()}</span>
                <span className="text-[var(--color-danger)]">失败: {syncJob.failed.toLocaleString()}</span>
                <span className="text-[var(--color-text-subtle)]">总计: {syncJob.total.toLocaleString()}</span>
              </div>
            </div>
          )}

          {syncJob && syncJob.status !== "idle" && syncJob.status !== "running" && (
            <div className={`p-4 rounded-lg border ${
              syncJob.status === "success" ? "bg-[rgba(34,197,94,0.1)] border-[rgba(34,197,94,0.25)]" :
              syncJob.status === "partial" ? "bg-[rgba(255,184,0,0.08)] border-[rgba(255,184,0,0.25)]" :
              "bg-[rgba(239,68,68,0.1)] border-[rgba(239,68,68,0.25)]"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium">
                  {syncJob.status === "success" ? "同步完成" :
                   syncJob.status === "partial" ? "部分同步成功" : "同步失败"}
                </h3>
                {syncJob.finishedAt && syncJob.startedAt && (
                  <span className="text-xs text-[var(--color-text-subtle)]">
                    耗时: {formatDuration(syncJob.finishedAt - syncJob.startedAt)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-lg font-semibold text-[var(--color-success)]">{syncJob.success}</div>
                  <div className="text-xs text-[var(--color-text-subtle)]">成功</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-[var(--color-danger)]">{syncJob.failed}</div>
                  <div className="text-xs text-[var(--color-text-subtle)]">失败</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-[var(--color-text-muted)]">{syncJob.total}</div>
                  <div className="text-xs text-[var(--color-text-subtle)]">总计</div>
                </div>
              </div>
              {syncJob.firstError && (
                <div className="mt-3 text-xs text-[var(--color-danger)]">
                  第一条错误: {syncJob.firstError}
                </div>
              )}
              {syncJob.failures.length > 0 && (
                <button
                  onClick={() => setShowFailures(!showFailures)}
                  className="mt-2 flex items-center gap-1 text-xs text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
                >
                  {showFailures ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  查看失败详情 ({syncJob.failures.length})
                </button>
              )}
              {showFailures && syncJob.failures.length > 0 && (
                <div className="mt-2 space-y-2 text-xs">
                  {syncJob.failures.map((failure, index) => (
                    <div key={index} className="p-2 bg-[var(--color-panel)] rounded border border-[rgba(239,68,68,0.2)]">
                      <div className="font-medium text-[var(--color-text)]">
                        {failure.itemName || failure.itemId || "记录"}
                      </div>
                      <div className="text-[var(--color-danger)]">{failure.reason}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Surface>

      {connectionStatus !== "connected" && (
        <Surface padding="lg" className="text-center">
          <WifiOff className="w-12 h-12 text-[var(--color-text-subtle)] mx-auto mb-4" />
          <h3 className="text-lg font-medium text-[var(--color-text-muted)] mb-2">未连接到服务器</h3>
          <p className="text-sm text-[var(--color-text-subtle)]">
            请确保服务器采集器正在运行，并检查服务器地址是否正确
          </p>
          <p className="text-xs text-[var(--color-text-subtle)] mt-2">
            服务器采集器运行命令：./server --port 8080
          </p>
        </Surface>
      )}

      <ServerAdminPanel
        serverUrl={serverUrl}
        connectionStatus={connectionStatus}
        serverStatus={serverStatus}
      />
    </PageShell>
  );
}
