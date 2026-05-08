import { useState } from "react";
import { cmd } from "@/lib/commands";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Download, Upload, Database, Clock, HardDrive, FileText, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";

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
    },
  });

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
  });

  const exportFireMutation = useMutation({
    mutationFn: async () => {
      const file = await save({
        defaultPath: `tl_fire_history_168h.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const csv = await cmd.exportFireHistoryCsv(168);
      await writeTextFile(file, csv);
      return file;
    },
  });

  const handleExport = (mutation: any, _name: string) => {
    mutation.mutate();
  };

  return (
    <div className="h-full overflow-auto p-6 bg-slate-50">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-blue-500" />
          <h1 className="text-lg font-semibold text-slate-800">导入导出</h1>
        </div>

        {/* Database Info */}
        {backupInfo && (
          <div className="bg-white rounded-lg border border-slate-100 p-4 shadow-sm">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-sm">
                <HardDrive className="w-4 h-4 text-slate-400" />
                <span className="text-slate-500">数据库大小</span>
                <span className="font-medium text-slate-700">{formatBytes(backupInfo.db_size_kb)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-slate-500">上次备份</span>
                <span className="font-medium text-slate-700">{formatTimestamp(backupInfo.last_backup_at)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Import Section */}
        <div className="bg-white rounded-lg border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-orange-500" />
              <h2 className="text-sm font-semibold text-slate-700">导入数据</h2>
            </div>
          </div>
          
          <div className="p-5 space-y-5">
            {/* Import Watchlist CSV */}
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">导入关注列表 CSV</span>
                </div>
                <p className="text-xs text-slate-400 ml-6">
                  CSV 格式：section_id, item_id, purchase_fire_price, count, more_value
                </p>
              </div>
              <div className="ml-6">
                <button
                  onClick={() => importCsvMutation.mutate()}
                  disabled={importCsvMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {importCsvMutation.isPending ? "导入中..." : "选择 CSV 文件"}
                </button>
              </div>
            </div>

            {/* Import Result */}
            {importResult && (
              <div className={`rounded-lg p-4 ${importResult.errors.length > 0 ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {importResult.errors.length > 0 ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  )}
                  <span className={`text-sm font-medium ${importResult.errors.length > 0 ? "text-amber-700" : "text-green-700"}`}>
                    导入完成：成功 {importResult.imported} 条
                    {importResult.errors.length > 0 && `，失败 ${importResult.errors.length} 条`}
                  </span>
                </div>
                
                {importResult.errors.length > 0 && (
                  <>
                    <button
                      onClick={() => setShowImportDetails(!showImportDetails)}
                      className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
                    >
                      {showImportDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {showImportDetails ? "收起详情" : "查看失败详情"}
                    </button>
                    
                    {showImportDetails && (
                      <div className="mt-2 space-y-1">
                        {importResult.errors.slice(0, 10).map((err, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-amber-600">
                            <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span>{err}</span>
                          </div>
                        ))}
                        {importResult.errors.length > 10 && (
                          <div className="text-xs text-amber-500 mt-1">
                            ...还有 {importResult.errors.length - 10} 条错误
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="border-t border-slate-100 pt-5">
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Database className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">导入数据库备份</span>
                  </div>
                  <p className="text-xs text-slate-400 ml-6">
                    恢复之前导出的 .db 备份文件。操作会覆盖当前数据，建议先备份。
                  </p>
                </div>
                <div className="ml-6">
                  <button
                    onClick={() => restoreMutation.mutate()}
                    disabled={restoreMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    <Database className="w-4 h-4" />
                    {restoreMutation.isPending ? "恢复中..." : "选择 .db 文件"}
                  </button>
                  {restoreMutation.isSuccess && (
                    <p className="mt-2 text-xs text-amber-600">
                      数据库已恢复，请重启应用
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Export Section */}
        <div className="bg-white rounded-lg border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-green-500" />
              <h2 className="text-sm font-semibold text-slate-700">导出数据</h2>
            </div>
          </div>
          
          <div className="p-5 space-y-5">
            {/* Export Watchlist */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">导出关注列表</span>
                </div>
                <p className="text-xs text-slate-400 ml-6 mt-1">
                  导出所有分组的物品关注列表为 CSV 格式
                </p>
              </div>
              <button
                onClick={() => handleExport(exportCsvMutation, "关注列表")}
                disabled={exportCsvMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                {exportCsvMutation.isPending ? "导出中..." : "导出 CSV"}
              </button>
            </div>

            {/* Export Fire History */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-5">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">导出火价历史</span>
                </div>
                <p className="text-xs text-slate-400 ml-6 mt-1">
                  导出最近 7 天的火价记录
                </p>
              </div>
              <button
                onClick={() => handleExport(exportFireMutation, "火价历史")}
                disabled={exportFireMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                {exportFireMutation.isPending ? "导出中..." : "导出 CSV"}
              </button>
            </div>

            {/* Backup Database */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-5">
              <div>
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">备份数据库</span>
                </div>
                <p className="text-xs text-slate-400 ml-6 mt-1">
                  完整备份当前 SQLite 数据库
                </p>
              </div>
              <button
                onClick={() => handleExport(backupMutation, "数据库备份")}
                disabled={backupMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                <Database className="w-4 h-4" />
                {backupMutation.isPending ? "备份中..." : "备份数据库"}
              </button>
            </div>
          </div>
        </div>

        {/* Export Success Toast */}
        {exportCsvMutation.isSuccess && (
          <div className="fixed bottom-6 right-6 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            关注列表 CSV 导出成功
          </div>
        )}
        {exportFireMutation.isSuccess && (
          <div className="fixed bottom-6 right-6 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            火价历史 CSV 导出成功
          </div>
        )}
        {backupMutation.isSuccess && (
          <div className="fixed bottom-6 right-6 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            数据库备份成功
          </div>
        )}
      </div>
    </div>
  );
}