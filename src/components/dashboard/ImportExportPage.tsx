import { useState } from "react";
import { cmd } from "@/lib/commands";
import { formatTimestamp } from "@/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Download, Upload, Database, Clock, HardDrive, FileText, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { MetricCard } from "@/components/ui/MetricCard";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/queryKeys";

function formatBytes(kb: number): string {
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export default function ImportExportPage() {
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [showImportDetails, setShowImportDetails] = useState(false);
  const { marketContext, marketContextReady } = useSectionRefresh();

  const { data: backupInfo, refetch: refetchBackupInfo } = useQuery({
    queryKey: [...queryKeys.backupInfo, marketContext.seasonId, marketContext.marketMode],
    queryFn: cmd.getBackupInfo,
    enabled: marketContextReady,
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

  const importInventoryMutation = useMutation({
    mutationFn: async () => {
      const file = await open({
        multiple: false,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      await readTextFile(file);
      toast.info("持仓导入功能开发中");
      return { fileName: file };
    },
    onSuccess: (data) => {
      if (!data) return;
      toast.success("持仓导入功能开发中");
    },
  });

  const importBuyWatchesMutation = useMutation({
    mutationFn: async () => {
      const file = await open({
        multiple: false,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      await readTextFile(file);
      toast.info("买入监控导入功能开发中");
      return { fileName: file };
    },
    onSuccess: (data) => {
      if (!data) return;
      toast.success("买入监控导入功能开发中");
    },
  });

  const importArbitrageMutation = useMutation({
    mutationFn: async () => {
      const file = await open({
        multiple: false,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const content = await readTextFile(file);
      const result = await cmd.importArbitrageRecipesCsv(content);
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

  const exportInventoryMutation = useMutation({
    mutationFn: async () => {
      const file = await save({
        defaultPath: `torchscan_positions_${marketContext.seasonId}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const csv = await cmd.exportInventoryCsv(marketContext.seasonId, marketContext.marketMode);
      await writeTextFile(file, csv);
      return file;
    },
    onSuccess: (file) => {
      if (!file) return;
      toast.success("持仓数据 CSV 导出成功");
    },
  });

  const exportBuyWatchesMutation = useMutation({
    mutationFn: async () => {
      const file = await save({
        defaultPath: `torchscan_watches_${marketContext.seasonId}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const csv = await cmd.exportBuyWatchesCsv(marketContext.seasonId, marketContext.marketMode);
      await writeTextFile(file, csv);
      return file;
    },
    onSuccess: (file) => {
      if (!file) return;
      toast.success("买入监控 CSV 导出成功");
    },
  });

  const exportArbitrageMutation = useMutation({
    mutationFn: async () => {
      const file = await save({
        defaultPath: `torchscan_arbitrage_${marketContext.seasonId}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const csv = await cmd.exportArbitrageRecipesCsv(marketContext.seasonId, marketContext.marketMode);
      await writeTextFile(file, csv);
      return file;
    },
    onSuccess: (file) => {
      if (!file) return;
      toast.success("套利比价 CSV 导出成功");
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

  const handleExport = (mutation: { mutate: () => void }) => {
    mutation.mutate();
  };

  return (
    <PageShell size="full" className="space-y-5">
      <PageHeader
        title="导入导出"
        description="管理数据的导入和导出"
        iconAsset="import-export"
      />

      {backupInfo && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="数据库大小"
            value={formatBytes(backupInfo.db_size_kb)}
            icon={HardDrive}
            iconBg="bg-[rgba(255,184,0,0.08)]"
            iconColor="text-[var(--color-brand)]"
          />
          <MetricCard
            label="上次备份"
            value={backupInfo.last_backup_at ? formatTimestamp(backupInfo.last_backup_at) : "从未"}
            icon={Clock}
            iconBg="bg-[rgba(255,184,0,0.08)]"
            iconColor="text-[var(--color-brand-gold)]"
          />
        </div>
      )}

      <Surface padding="none">
        <div className="px-5 py-4 border-b border-[var(--color-border-soft)] bg-[var(--color-panel-soft)]">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[var(--color-brand)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">数据库备份</h2>
          </div>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--color-text-subtle)]">
                完整备份 SQLite 数据库，包括所有数据
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => restoreMutation.mutate()}
                disabled={restoreMutation.isPending}
              >
                <Upload className="w-4 h-4 mr-1.5" />
                恢复
              </Button>
              <Button
                onClick={() => handleExport(backupMutation)}
                disabled={backupMutation.isPending}
                className="bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] hover:opacity-90 text-black"
              >
                <Download className="w-4 h-4 mr-1.5" />
                {backupMutation.isPending ? "备份中..." : "备份"}
              </Button>
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 p-3 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] rounded-lg">
            <AlertTriangle className="w-4 h-4 text-[var(--color-danger)] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[var(--color-text-subtle)]">
              恢复数据库会覆盖当前所有数据，建议先进行备份操作
            </p>
          </div>
        </div>
      </Surface>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Surface padding="none">
          <div className="px-5 py-4 border-b border-[var(--color-border-soft)] bg-[var(--color-panel-soft)]">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-[var(--color-brand-gold)]" />
              <h2 className="text-sm font-semibold text-[var(--color-text)]">导入数据</h2>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                <span className="text-sm font-medium text-[var(--color-text)]">关注列表</span>
              </div>
              <p className="text-xs text-[var(--color-text-subtle)] ml-6 mb-2">
                CSV 格式：section_id, season_id, market_mode, item_id, purchase_fire_price, count, more_value
              </p>
              <div className="ml-6">
                <Button
                  onClick={() => importCsvMutation.mutate()}
                  disabled={importCsvMutation.isPending}
                  className="bg-[var(--color-brand-gold)] hover:opacity-90 text-black"
                >
                  <Upload className="w-4 h-4 mr-1.5" />
                  {importCsvMutation.isPending ? "导入中..." : "导入 CSV"}
                </Button>
              </div>
            </div>

            <div className="border-t border-[var(--color-border-soft)] pt-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                <span className="text-sm font-medium text-[var(--color-text)]">持仓数据</span>
              </div>
              <p className="text-xs text-[var(--color-text-subtle)] ml-6 mb-2">
                导入持仓 CSV 文件
              </p>
              <div className="ml-6">
                <Button
                  variant="outline"
                  onClick={() => importInventoryMutation.mutate()}
                  disabled={importInventoryMutation.isPending}
                >
                  <Upload className="w-4 h-4 mr-1.5" />
                  导入 CSV
                </Button>
              </div>
            </div>

            <div className="border-t border-[var(--color-border-soft)] pt-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                <span className="text-sm font-medium text-[var(--color-text)]">买入监控</span>
              </div>
              <p className="text-xs text-[var(--color-text-subtle)] ml-6 mb-2">
                导入买入监控 CSV 文件
              </p>
              <div className="ml-6">
                <Button
                  variant="outline"
                  onClick={() => importBuyWatchesMutation.mutate()}
                  disabled={importBuyWatchesMutation.isPending}
                >
                  <Upload className="w-4 h-4 mr-1.5" />
                  导入 CSV
                </Button>
              </div>
            </div>

            <div className="border-t border-[var(--color-border-soft)] pt-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                <span className="text-sm font-medium text-[var(--color-text)]">套利比价</span>
              </div>
              <p className="text-xs text-[var(--color-text-subtle)] ml-6 mb-2">
                CSV 格式：name, recipe_type, season_id, market_mode, enabled
              </p>
              <div className="ml-6">
                <Button
                  variant="outline"
                  onClick={() => importArbitrageMutation.mutate()}
                  disabled={importArbitrageMutation.isPending}
                >
                  <Upload className="w-4 h-4 mr-1.5" />
                  {importArbitrageMutation.isPending ? "导入中..." : "导入 CSV"}
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
          </div>
        </Surface>

        <Surface padding="none">
          <div className="px-5 py-4 border-b border-[var(--color-border-soft)] bg-[var(--color-panel-soft)]">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-[var(--color-success)]" />
              <h2 className="text-sm font-semibold text-[var(--color-text)]">导出数据</h2>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                  <span className="text-sm font-medium text-[var(--color-text)]">关注列表</span>
                </div>
              </div>
              <Button
                onClick={() => handleExport(exportCsvMutation)}
                disabled={exportCsvMutation.isPending}
                className="bg-[var(--color-success)] hover:opacity-90 text-black"
              >
                <Download className="w-4 h-4 mr-1.5" />
                {exportCsvMutation.isPending ? "导出中..." : "导出"}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                  <span className="text-sm font-medium text-[var(--color-text)]">火价历史</span>
                </div>
              </div>
              <Button
                onClick={() => handleExport(exportFireMutation)}
                disabled={exportFireMutation.isPending}
                className="bg-[var(--color-success)] hover:opacity-90 text-black"
              >
                <Download className="w-4 h-4 mr-1.5" />
                {exportFireMutation.isPending ? "导出中..." : "导出"}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                  <span className="text-sm font-medium text-[var(--color-text)]">持仓数据</span>
                </div>
              </div>
              <Button
                onClick={() => handleExport(exportInventoryMutation)}
                disabled={exportInventoryMutation.isPending}
                className="bg-[var(--color-success)] hover:opacity-90 text-black"
              >
                <Download className="w-4 h-4 mr-1.5" />
                {exportInventoryMutation.isPending ? "导出中..." : "导出"}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                  <span className="text-sm font-medium text-[var(--color-text)]">买入监控</span>
                </div>
              </div>
              <Button
                onClick={() => handleExport(exportBuyWatchesMutation)}
                disabled={exportBuyWatchesMutation.isPending}
                className="bg-[var(--color-success)] hover:opacity-90 text-black"
              >
                <Download className="w-4 h-4 mr-1.5" />
                {exportBuyWatchesMutation.isPending ? "导出中..." : "导出"}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                  <span className="text-sm font-medium text-[var(--color-text)]">套利比价</span>
                </div>
              </div>
              <Button
                onClick={() => handleExport(exportArbitrageMutation)}
                disabled={exportArbitrageMutation.isPending}
                className="bg-[var(--color-success)] hover:opacity-90 text-black"
              >
                <Download className="w-4 h-4 mr-1.5" />
                {exportArbitrageMutation.isPending ? "导出中..." : "导出"}
              </Button>
            </div>
          </div>
        </Surface>
      </div>
    </PageShell>
  );
}
