import { useState, useEffect } from "react";
import { cmd, type BackupInfo } from "../../lib/commands";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Download, Upload, Database, Clock, HardDrive } from "lucide-react";

function formatBytes(kb: number): string {
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return "从未";
  const d = new Date(ts * 1000);
  return d.toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ImportExportPage() {
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const { marketContext } = useSectionRefresh();

  // Backup info
  const { data: backupInfo, refetch: refetchBackupInfo } = useQuery({
    queryKey: ["backup-info", marketContext.seasonId, marketContext.marketMode],
    queryFn: cmd.getBackupInfo,
  });

  // Import watchlist CSV
  const importCsvMutation = useMutation({
    mutationFn: async () => {
      const file = await open({
        multiple: false,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const content = await readTextFile(file);
      const result = await cmd.importWatchlistCsv(content);
      return { result, fileName: file };
    },
    onSuccess: (data) => {
      if (!data) return;
      setImportResult(data.result);
      setLastAction(`导入关注列表 CSV：成功 ${data.result.imported} 条${data.result.errors.length > 0 ? `，失败 ${data.result.errors.length} 条` : ""}`);
      setTimeout(() => setImportResult(null), 5000);
    },
  });

  // Export watchlist CSV
  const exportCsvMutation = useMutation({
    mutationFn: async () => {
      const file = await save({
        defaultPath: "tl_watchlist.csv",
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const csv = await cmd.exportWatchlistCsv();
      await writeTextFile(file, csv);
      return file;
    },
    onSuccess: (file) => {
      if (!file) return;
      setLastAction(`导出关注列表 CSV 已保存至：${file}`);
      setTimeout(() => setLastAction(null), 5000);
    },
  });

  // Backup database
  const backupMutation = useMutation({
    mutationFn: async () => {
      const file = await save({
        defaultPath: `tl_backup_${Date.now()}.db`,
        filters: [{ name: "SQLite", extensions: ["db"] }],
      });
      if (!file) return null;
      await cmd.backupDatabase(file);
      refetchBackupInfo();
      return file;
    },
    onSuccess: (file) => {
      if (!file) return;
      setLastAction(`数据库备份已保存至：${file}`);
      setTimeout(() => setLastAction(null), 5000);
    },
  });

  // Restore database
  const restoreMutation = useMutation({
    mutationFn: async () => {
      const file = await open({
        multiple: false,
        filters: [{ name: "SQLite", extensions: ["db"] }],
      });
      if (!file) return null;
      await cmd.restoreDatabase(file);
      return file;
    },
    onSuccess: (file) => {
      if (!file) return;
      setLastAction(`数据库已从 ${file} 恢复，请重启应用`);
      setTimeout(() => setLastAction(null), 5000);
    },
  });

  // Export fire history CSV
  const exportFireMutation = useMutation({
    mutationFn: async () => {
      const file = await save({
        defaultPath: `tl_fire_history_168h.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const csv = await cmd.exportFireHistoryCsv(168); // 7 days
      await writeTextFile(file, csv);
      return file;
    },
    onSuccess: (file) => {
      if (!file) return;
      setLastAction(`火价历史 CSV（7天）已保存至：${file}`);
      setTimeout(() => setLastAction(null), 5000);
    },
  });

  return (
    <div className="p-6 max-w-2xl space-y-6 bg-app-bg min-h-screen">
      {/* Page title */}
      <div className="flex items-center gap-2 mb-2">
        <Download className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-semibold text-text-strong">导入导出</h1>
      </div>

      {/* Backup info card */}
      {backupInfo && (
        <section className="bg-white border border-border rounded-card shadow-card p-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm text-text">
              <HardDrive className="w-4 h-4 text-text-muted" />
              <span className="text-text-muted">数据库大小</span>
              <span className="font-medium text-text-strong">{formatBytes(backupInfo.db_size_kb)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-text">
              <Clock className="w-4 h-4 text-text-muted" />
              <span className="text-text-muted">上次备份</span>
              <span className="font-medium text-text-strong">{formatTimestamp(backupInfo.last_backup_at)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Import section */}
      <section className="bg-white border border-border rounded-card shadow-card p-5">
        <h2 className="text-base font-medium text-text-strong mb-4 flex items-center gap-2">
          <Upload className="w-4 h-4 text-primary" />
          导入
        </h2>

        <div className="space-y-4">
          {/* Import watchlist CSV */}
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-text mb-1">导入关注列表 CSV</div>
              <div className="text-xs text-text-muted mb-2">
                CSV 格式（无 BOM）：<code className="bg-surface-muted px-1 rounded">section_id,item_id,item_name,item_type,price,count,more_per_fire</code>
              </div>
              <button
                onClick={() => importCsvMutation.mutate()}
                disabled={importCsvMutation.isPending}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-md text-text hover:bg-surface-muted transition-colors disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                {importCsvMutation.isPending ? "导入中…" : "选择 CSV 文件"}
              </button>
            </div>
          </div>

          {/* Import DB backup */}
          <div className="flex items-start gap-4 pt-2 border-t border-border/50">
            <div className="flex-1">
              <div className="text-sm font-medium text-text mb-1">导入数据库备份</div>
              <div className="text-xs text-text-muted mb-2">
                恢复之前导出的 .db 备份文件。操作会覆盖当前数据，建议先备份。
              </div>
              <button
                onClick={() => restoreMutation.mutate()}
                disabled={restoreMutation.isPending}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-md text-text hover:bg-surface-muted transition-colors disabled:opacity-50"
              >
                <Database className="w-3.5 h-3.5" />
                {restoreMutation.isPending ? "恢复中…" : "选择 .db 文件"}
              </button>
            </div>
          </div>

          {/* Import result */}
          {importResult && (
            <div className={`text-sm px-3 py-2 rounded-md ${importResult.errors.length > 0 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
              导入完成：成功 {importResult.imported} 条
              {importResult.errors.length > 0 && `，失败 ${importResult.errors.length} 条`}
              {importResult.errors.length > 0 && (
                <div className="mt-1 text-xs opacity-80">
                  {importResult.errors.slice(0, 3).join("；")}
                  {importResult.errors.length > 3 && `…等 ${importResult.errors.length} 条错误`}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Export section */}
      <section className="bg-white border border-border rounded-card shadow-card p-5">
        <h2 className="text-base font-medium text-text-strong mb-4 flex items-center gap-2">
          <Download className="w-4 h-4 text-primary" />
          导出
        </h2>

        <div className="space-y-4">
          {/* Export watchlist CSV */}
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-text mb-1">导出关注列表 CSV</div>
              <div className="text-xs text-text-muted mb-2">
                导出所有分组的物品关注列表为 CSV 格式
              </div>
              <button
                onClick={() => exportCsvMutation.mutate()}
                disabled={exportCsvMutation.isPending}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-md text-text hover:bg-surface-muted transition-colors disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                {exportCsvMutation.isPending ? "导出中…" : "导出 CSV"}
              </button>
            </div>
          </div>

          {/* Export fire history CSV */}
          <div className="flex items-start gap-4 pt-2 border-t border-border/50">
            <div className="flex-1">
              <div className="text-sm font-medium text-text mb-1">导出火价历史 CSV</div>
              <div className="text-xs text-text-muted mb-2">
                导出最近 7 天的火价记录（rmb_per_10k_fire, fire_per_rmb, increase_ratio, scraped_at）
              </div>
              <button
                onClick={() => exportFireMutation.mutate()}
                disabled={exportFireMutation.isPending}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-md text-text hover:bg-surface-muted transition-colors disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                {exportFireMutation.isPending ? "导出中…" : "导出火价历史 CSV"}
              </button>
            </div>
          </div>

          {/* Backup database */}
          <div className="flex items-start gap-4 pt-2 border-t border-border/50">
            <div className="flex-1">
              <div className="text-sm font-medium text-text mb-1">导出数据库备份</div>
              <div className="text-xs text-text-muted mb-2">
                完整备份当前 SQLite 数据库，可用于数据迁移或灾难恢复
              </div>
              <button
                onClick={() => backupMutation.mutate()}
                disabled={backupMutation.isPending}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-md text-text hover:bg-surface-muted transition-colors disabled:opacity-50"
              >
                <Database className="w-3.5 h-3.5" />
                {backupMutation.isPending ? "备份中…" : "备份数据库"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Last action feedback */}
      {lastAction && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-card px-4 py-3">
          {lastAction}
        </div>
      )}
    </div>
  );
}
