import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { queryClient } from "@/lib/query";
import {
  invalidateFireData,
  invalidateInventoryData,
  invalidateItemsData,
  invalidateMarketContextData,
  queryKeys,
} from "@/lib/queryKeys";
import { toast } from "sonner";
import { devLog } from "@/lib/devLog";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/**
 * 全局 Tauri 事件监听 hook。
 * 监听所有后端事件，执行相应的缓存失效和 UI 通知。
 * 在非 Tauri 环境（如 Vite 浏览器开发模式）下跳过注册。
 */
export function useTauriEvents() {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (!isTauriRuntime()) {
      return;
    }

    const unlisteners: UnlistenFn[] = [];
    let cleanupCalled = false;

    // 注册单个事件监听器，统一处理组件卸载竞态与 mounted 检查
    const safeListen = async <T = void>(
      event: string,
      handler: (payload: T) => void
    ): Promise<void> => {
      const unlisten = await listen<T>(event, (e) => {
        if (!mountedRef.current) return;
        handler(e.payload);
      });
      if (cleanupCalled) {
        unlisten();
        return;
      }
      unlisteners.push(unlisten);
    };

    const setupListeners = async () => {
      try {
        // 火价更新 → 失效火价历史和仪表盘摘要，然后重新拉取
        await safeListen("fire-price-updated", () => {
          invalidateFireData(queryClient);
          invalidateInventoryData(queryClient);
          queryClient.invalidateQueries({ queryKey: queryKeys.miniWindowFeed });
          queryClient.refetchQueries({ queryKey: queryKeys.dashboardSummary, type: "active" });
        });

        // 物品更新 → 失效物品搜索、分组、库存估值和小窗口数据
        await safeListen("items-updated", () => {
          invalidateItemsData(queryClient);
        });

        // 市场上下文切换 → 失效并重新拉取所有依赖上下文的查询
        await safeListen("market-context-changed", () => {
          invalidateMarketContextData(queryClient);
          queryClient.refetchQueries({ queryKey: queryKeys.dashboardSummary, type: "active" });
        });

        // 任务状态变更 → 失效仪表盘摘要
        await safeListen("task-status-changed", () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
        });

        // 预警触发 → 显示 toast 并失效预警事件
        await safeListen<{
          id: string;
          rule_id: string;
          message: string;
          triggered_at: number;
        }>("alert-triggered", (payload) => {
          toast.warning("价格预警", {
            description: payload.message,
          });
          queryClient.invalidateQueries({ queryKey: queryKeys.alertEvents });
          queryClient.invalidateQueries({ queryKey: queryKeys.alertRules });
        });

        // 配置变更 → 失效配置查询
        await safeListen("config-changed", () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.config });
        });

        // 数据库统计更新 → 失效数据库统计
        await safeListen("database-stats-updated", () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.dbStats });
        });

        // 注册完成后主动刷新一次 dashboard-summary，捕获可能在监听器注册前已更新的数据
        queryClient.refetchQueries({ queryKey: queryKeys.dashboardSummary });
      } catch (error) {
        devLog.error("[useTauriEvents] Failed to setup listeners:", error);
      }
    };

    setupListeners();

    return () => {
      cleanupCalled = true;
      mountedRef.current = false;
      unlisteners.forEach((u) => {
        try {
          u();
        } catch (e) {
          devLog.warn("[useTauriEvents] Error during cleanup:", e);
        }
      });
    };
  }, []);
}
