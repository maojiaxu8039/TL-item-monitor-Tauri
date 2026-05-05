import { useEffect } from "react";
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
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    const unlisteners: UnlistenFn[] = [];

    (async () => {
      // Fire price updated → invalidate fire history and dashboard summary
      const unlistenFire = await listen("fire-price-updated", () => {
        queryClient.invalidateQueries({ queryKey: ["fire-history"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
        queryClient.invalidateQueries({ queryKey: ["season-summary"] });
        queryClient.invalidateQueries({ queryKey: ["season-trends"] });
      });
      unlisteners.push(unlistenFire);

      // Items updated → invalidate items search and sections
      const unlistenItems = await listen("items-updated", () => {
        queryClient.invalidateQueries({ queryKey: ["items-search"] });
        queryClient.invalidateQueries({ queryKey: ["sections"] });
        queryClient.invalidateQueries({ queryKey: ["section-items"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      });
      unlisteners.push(unlistenItems);

      // Market context changed → invalidate all context-dependent queries
      const unlistenContext = await listen("market-context-changed", () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
        queryClient.invalidateQueries({ queryKey: ["sections"] });
        queryClient.invalidateQueries({ queryKey: ["section-items"] });
        queryClient.invalidateQueries({ queryKey: ["items-search"] });
        queryClient.invalidateQueries({ queryKey: ["fire-history"] });
        queryClient.invalidateQueries({ queryKey: ["season-summary"] });
        queryClient.invalidateQueries({ queryKey: ["season-trends"] });
      });
      unlisteners.push(unlistenContext);

      // Task status changed → invalidate dashboard summary
      const unlistenTask = await listen("task-status-changed", () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      });
      unlisteners.push(unlistenTask);

      // Alert triggered → show toast and invalidate alert events
      const unlistenAlert = await listen<{
        id: string;
        rule_id: string;
        message: string;
        triggered_at: number;
      }>("alert-triggered", (event) => {
        toast.warning("价格预警", {
          description: event.payload.message,
        });
        queryClient.invalidateQueries({ queryKey: ["alert-events"] });
        queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
      });
      unlisteners.push(unlistenAlert);

      // Config changed → invalidate config query
      const unlistenConfig = await listen("config-changed", () => {
        queryClient.invalidateQueries({ queryKey: ["config"] });
      });
      unlisteners.push(unlistenConfig);

      // Database stats updated → invalidate db stats
      const unlistenDb = await listen("database-stats-updated", () => {
        queryClient.invalidateQueries({ queryKey: ["db-stats"] });
      });
      unlisteners.push(unlistenDb);
    })();

    return () => {
      unlisteners.forEach((u) => u());
    };
  }, []);
}
