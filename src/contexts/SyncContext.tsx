import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import { devLog } from "@/lib/devLog";
import type { SyncJobState } from "@/lib/commands";

interface SyncState {
  syncJob: SyncJobState | null;
  setSyncJob: (job: SyncJobState | null) => void;
  isSyncing: boolean;
}

interface SyncContextType extends SyncState {
  restoreSyncJob: () => void;
  clearSyncJob: () => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

const STORAGE_KEY = "sync_state";

interface PersistedSyncState {
  syncJob: SyncJobState | null;
  timestamp: number;
}

function loadSyncState(): PersistedSyncState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const state = JSON.parse(stored) as PersistedSyncState;
    const age = Date.now() - state.timestamp;
    if (age > 30 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

function saveSyncState(job: SyncJobState | null) {
  try {
    const state: PersistedSyncState = {
      syncJob: job,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    devLog.error("[SyncContext] Failed to save state:", e);
  }
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [syncJob, setSyncJobState] = useState<SyncJobState | null>(() => {
    const saved = loadSyncState();
    return saved?.syncJob ?? null;
  });

  const isSyncing = syncJob?.status === "running";

  const setSyncJob = useCallback((job: SyncJobState | null) => {
    setSyncJobState(job);
    saveSyncState(job);
  }, []);

  const restoreSyncJob = useCallback(() => {
    const saved = loadSyncState();
    if (saved?.syncJob && saved.syncJob.status === "running") {
      setSyncJob({ ...saved.syncJob, status: "idle" });
    }
  }, [setSyncJob]);

  const clearSyncJob = useCallback(() => {
    setSyncJobState(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(() => ({
    syncJob,
    setSyncJob,
    isSyncing,
    restoreSyncJob,
    clearSyncJob,
  }), [syncJob, setSyncJob, isSyncing, restoreSyncJob, clearSyncJob]);

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSyncContext() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSyncContext must be used within SyncProvider");
  }
  return context;
}
