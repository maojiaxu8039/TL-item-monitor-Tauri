import { useState } from "react";
import { cmd } from "@/lib/commands";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Download, Upload, Database, Clock, HardDrive, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { MetricCard } from "@/components/ui/MetricCard";
import { Button } from "@/components/ui/button";

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
  const [showImportDetails, setShowImportDetails] = useState(false);
  const { marketContext } = useSectionRefresh();

  const { data: backupInfo, refetch: refetchBackupInfo } = useQuery({
    queryKey: ["backup-info", marketContext.seasonId, marketContext.marketMode],
    queryFn: cmd.getBackupInfo,
  });

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
      setShowImportDetails(false);
    },
  });

  const exportCsvMutation = useMutation({
    mutationFn: async () => {
      const file = await save({
        defaultPath: "torchscan_watchlist.csv",
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const csv = await cmd.exportWatchlistCsv();
      await writeTextFile(file, csv);
      return file;
    },
    onSuccess: (file) => {
      if (!file) return;
      toast.success("关注列表 CSV 导出成功");
    },
  });

  const backupMutation = useMutation({
    mutationFn: async () => {
      const file = await save({
        defaultPath: `torchscan_backup_${Date.now()}.db`,
        filters: [{ name: "SQLite", extensions: ["db"] }],
      });
      if (!file) return null;
      await cmd.backupDatabase(file);
      refetchBackupInfo();
      return file;
    },
    onSuccess: (file) => {
      if (!file) return;
      toast.success("数据库备份成功");
    },
  });

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
      toast.warning("数据库已恢复，请重启应用");
    },
    onError: () => {
      toast.error("数据库恢复失败");
    },
  });

  const exportFireMutation = useMutation({
    mutationFn: async () => {
      const file = await save({
        defaultPath: `torchscan_fire_history_168h.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const csv = await cmd.exportFireHistoryCsv(168);
      await writeTextFile(file, csv);
      return file;
    },
    onSuccess: (file) => {
      if (!file) return;
      toast.success("火价历史 CSV 导出成功");
    },
  });

  const handleExport = (mutation: any) => {
    mutation.mutate();
  };

  return (
    <PageShell size="md" className="space-y-5">
      <PageHeader
        title="导入导出"
        description="管理数据的导入和导出"
        iconAsset="import-export"
      />

      {backupInfo && (
        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            label="数据库大小"
            value={formatBytes(backupInfo.db_size_kb)}
            icon={HardDrive}
            iconBg="bg-[rgba(255,184,0,0.08)]"
            iconColor="text-[var(--color-brand)]"
          />
          <MetricCard
            label="上次备份"
            value={formatTimestamp(backupInfo.last_backup_at)}
            icon={Clock}
            iconBg="bg-[rgba(255,184,0,0.08)]"
            iconColor="text-[var(--color-brand-gold)]"
          />
        </div>
      )}

      <Surface padding="none">
        <div className="px-5 py-4 border-b border-[var(--color-border-soft)] bg-[var(--color-panel-soft)]">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-[var(--color-brand-gold)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">导入数据</h2>
          </div>
        </div>
        
        <div className="p-5 space-y-5">
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                <span className="text-sm font-medium text-[var(--color-text)]">导入关注列表 CSV</span>
              </div>
              <p className="text-xs text-[var(--color-text-subtle)] ml-6">
                CSV 格式：section_id, item_id, purchase_fire_price, count, more_value
              </p>
            </div>
            <div className="ml-6">
              <Button
                onClick={() => importCsvMutation.mutate()}
                disabled={importCsvMutation.isPending}
                className="bg-[var(--color-brand-gold)] hover:opacity-90 text-black"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                {importCsvMutation.isPending ? "导入中..." : "选择 CSV 文件"}
              </Button>
            </div>
          </div>

          {importResult && (
            <Surface padding="md" className={importResult.errors.length > 0 ? "bg-[rgba(255,184,0,0.08)] border-[rgba(255,184,0,0.25)]" : "bg-[rgba(34,197,94,0.1)] border-[rgba(34,197,94,0.25)]"}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm font-medium ${importResult.errors.length > 0 ? "text-[var(--color-brand-gold)]" : "text-[var(--color-success)]"}`}>
                  导入完成：成功 {importResult.imported} 条
                  {importResult.errors.length > 0 && `，失败 ${importResult.errors.length} 条`}
                </span>
              </div>
              
              {importResult.errors.length > 0 && (
                <>
                  <button
                    onClick={() => setShowImportDetails(!showImportDetails)}
                    className="flex items-center gap-1 text-xs text-[var(--color-brand-gold)] hover:text-[var(--color-brand-gold)]"
                  >
                    {showImportDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {showImportDetails ? "收起详情" : "查看失败详情"}
                  </button>
                  
                  {showImportDetails && (
                    <div className="mt-2 space-y-1">
                      {importResult.errors.slice(0, 10).map((err, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-[var(--color-brand-gold)]">
                          <span className="text-[var(--color-brand-gold)]">×</span>
                          <span>{err}</span>
                        </div>
                      ))}
                      {importResult.errors.length > 10 && (
                        <div className="text-xs text-[var(--color-brand-gold)] mt-1">
                          ...还有 {importResult.errors.length - 10} 条错误
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </Surface>
          )}

          <div className="border-t border-[var(--color-border-soft)] pt-5">
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Database className="w-4 h-4 text-[var(--color-text-subtle)]" />
                  <span className="text-sm font-medium text-[var(--color-text)]">导入数据库备份</span>
                </div>
                <p className="text-xs text-[var(--color-text-subtle)] ml-6">
                  恢复之前导出的 .db 备份文件。操作会覆盖当前数据，建议先备份。
                </p>
              </div>
              <div className="ml-6">
                <Button
                  variant="outline"
                  onClick={() => restoreMutation.mutate()}
                  disabled={restoreMutation.isPending}
                >
                  <Database className="w-4 h-4 mr-1.5" />
                  {restoreMutation.isPending ? "恢复中..." : "选择 .db 文件"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Surface>

      <Surface padding="none">
        <div className="px-5 py-4 border-b border-[var(--color-border-soft)] bg-[var(--color-panel-soft)]">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-[var(--color-success)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">导出数据</h2>
          </div>
        </div>
        
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                <span className="text-sm font-medium text-[var(--color-text)]">导出关注列表</span>
              </div>
              <p className="text-xs text-[var(--color-text-subtle)] ml-6 mt-1">
                导出所有分组的物品关注列表为 CSV 格式
              </p>
            </div>
            <Button
              onClick={() => handleExport(exportCsvMutation)}
              disabled={exportCsvMutation.isPending}
              className="bg-[var(--color-success)] hover:opacity-90 text-black"
            >
              <Download className="w-4 h-4 mr-1.5" />
              {exportCsvMutation.isPending ? "导出中..." : "导出 CSV"}
            </Button>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-5">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                <span className="text-sm font-medium text-[var(--color-text)]">导出火价历史</span>
              </div>
              <p className="text-xs text-[var(--color-text-subtle)] ml-6 mt-1">
                导出最近 7 天的火价记录
              </p>
            </div>
            <Button
              onClick={() => handleExport(exportFireMutation)}
              disabled={exportFireMutation.isPending}
              className="bg-[var(--color-success)] hover:opacity-90 text-black"
            >
              <Download className="w-4 h-4 mr-1.5" />
              {exportFireMutation.isPending ? "导出中..." : "导出 CSV"}
            </Button>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-5">
            <div>
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[var(--color-text-subtle)]" />
                <span className="text-sm font-medium text-[var(--color-text)]">备份数据库</span>
              </div>
              <p className="text-xs text-[var(--color-text-subtle)] ml-6 mt-1">
                完整备份当前 SQLite 数据库
              </p>
            </div>
            <Button
              onClick={() => handleExport(backupMutation)}
              disabled={backupMutation.isPending}
              className="bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] hover:opacity-90 text-black"
            >
              <Database className="w-4 h-4 mr-1.5" />
              {backupMutation.isPending ? "备份中..." : "备份数据库"}
            </Button>
          </div>
        </div>
      </Surface>
    </PageShell>
  );
}
