import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { queryClient } from "@/lib/query";
import { toast } from "sonner";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/**
 * Global Tauri event listener hook.
 * Listens to all backend events and performs appropriate cache invalidation
 * and UI notifications.
 * Skips registration in non-Tauri environments (e.g. Vite browser dev).
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

    const setupListeners = async () => {
      try {
        // Fire price updated → invalidate fire history and dashboard summary, then refetch
        const unlistenFire = await listen("fire-price-updated", () => {
          if (!mountedRef.current) return;
          queryClient.invalidateQueries({ queryKey: ["fire-history"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
          queryClient.invalidateQueries({ queryKey: ["season-summary"] });
          queryClient.invalidateQueries({ queryKey: ["season-trends"] });
          queryClient.refetchQueries({ queryKey: ["dashboard-summary"], type: "active" });
        });
        if (cleanupCalled) {
          unlistenFire();
          return;
        }
        unlisteners.push(unlistenFire);

        // Items updated → invalidate items search and sections
        const unlistenItems = await listen("items-updated", () => {
          if (!mountedRef.current) return;
          queryClient.invalidateQueries({ queryKey: ["items-search"] });
          queryClient.invalidateQueries({ queryKey: ["sections"] });
          queryClient.invalidateQueries({ queryKey: ["section-items"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
        });
        if (cleanupCalled) {
          unlistenItems();
          return;
        }
        unlisteners.push(unlistenItems);

        // Market context changed → invalidate and refetch all context-dependent queries
        const unlistenContext = await listen("market-context-changed", () => {
          if (!mountedRef.current) return;
          queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
          queryClient.invalidateQueries({ queryKey: ["sections"] });
          queryClient.invalidateQueries({ queryKey: ["section-items"] });
          queryClient.invalidateQueries({ queryKey: ["items-search"] });
          queryClient.invalidateQueries({ queryKey: ["fire-history"] });
          queryClient.invalidateQueries({ queryKey: ["season-summary"] });
          queryClient.invalidateQueries({ queryKey: ["season-trends"] });
          queryClient.invalidateQueries({ queryKey: ["realtime-fire-changes"] });
          queryClient.refetchQueries({ queryKey: ["dashboard-summary"], type: "active" });
        });
        if (cleanupCalled) {
          unlistenContext();
          return;
        }
        unlisteners.push(unlistenContext);

        // Task status changed → invalidate dashboard summary
        const unlistenTask = await listen("task-status-changed", () => {
          if (!mountedRef.current) return;
          queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
        });
        if (cleanupCalled) {
          unlistenTask();
          return;
        }
        unlisteners.push(unlistenTask);

        // Alert triggered → show toast and invalidate alert events
        const unlistenAlert = await listen<{
          id: string;
          rule_id: string;
          message: string;
          triggered_at: number;
        }>("alert-triggered", (event) => {
          if (!mountedRef.current) return;
          toast.warning("价格预警", {
            description: event.payload.message,
          });
          queryClient.invalidateQueries({ queryKey: ["alert-events"] });
          queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
        });
        if (cleanupCalled) {
          unlistenAlert();
          return;
        }
        unlisteners.push(unlistenAlert);

        // Config changed → invalidate config query
        const unlistenConfig = await listen("config-changed", () => {
          if (!mountedRef.current) return;
          queryClient.invalidateQueries({ queryKey: ["config"] });
        });
        if (cleanupCalled) {
          unlistenConfig();
          return;
        }
        unlisteners.push(unlistenConfig);

        // Database stats updated → invalidate db stats
        const unlistenDb = await listen("database-stats-updated", () => {
          if (!mountedRef.current) return;
          queryClient.invalidateQueries({ queryKey: ["db-stats"] });
        });
        if (cleanupCalled) {
          unlistenDb();
          return;
        }
        unlisteners.push(unlistenDb);

        // 注册完成后主动刷新一次 dashboard-summary，捕获可能在监听器注册前已更新的数据
        queryClient.refetchQueries({ queryKey: ["dashboard-summary"] });
      } catch (error) {
        console.error("[useTauriEvents] Failed to setup listeners:", error);
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
          console.warn("[useTauriEvents] Error during cleanup:", e);
        }
      });
    };
  }, []);
}
