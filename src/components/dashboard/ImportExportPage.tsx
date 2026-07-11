import { useState } from "react";
import { cmd } from "@/lib/commands";
import { formatTimestamp } from "@/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Download, Upload, Database, Clock, HardDrive, FileText, ChevronDown, ChevronUp, AlertTriangle, Wrench } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { MetricCard } from "@/components/ui/MetricCard";
import { Button } from "@/components/ui/button";
import { invalidateInventoryData, invalidateSectionData, queryKeys } from "@/lib/queryKeys";
import { parseCsv, rowsToCsv, findColumnIndex } from "@/lib/csv";

function formatBytes(kb: number): string {
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

// 一个列的规范：用于把用户上传的 CSV 重整为后端期望的列顺序
interface ColumnSpec {
  // 后端期望的字段名（输出列名）
  key: string;
  // 可识别的别名（用于在用户文件表头中查找列，大小写无关）
  aliases: string[];
  // 是否必须出现在用户文件中（缺失则整份文件无法导入）
  required?: boolean;
  // 当列缺失或单元为空时填充的默认值
  defaultValue?: string;
  // 校验单元格内容；返回字符串表示错误描述并跳过该行
  validate?: (raw: string) => string | null;
}

// 对用户上传的 CSV 做前端预处理：
// 1. 用 RFC 4180 解析器读取（兼容 BOM / CRLF / 双引号转义 / 字段含逗号）
// 2. 根据列名别名匹配每一列，缺失必填列直接返回错误
// 3. 按 spec 的列顺序重新序列化，发给后端
// 4. 收集行级别校验失败，作为 preErrors 返回（不会发往后端）
function preprocessCsv(
  content: string,
  spec: ColumnSpec[],
): { csv: string | null; preErrors: string[]; rowCount: number } {
  const rows = parseCsv(content);
  if (rows.length === 0) {
    return { csv: null, preErrors: ["CSV 文件为空"], rowCount: 0 };
  }
  if (rows.length < 2) {
    return { csv: null, preErrors: ["CSV 文件缺少数据行"], rowCount: 0 };
  }

  const headerRow = rows[0];
  const colIdx = spec.map((s) => findColumnIndex(headerRow, s.key, ...s.aliases));

  // 校验必填列存在
  const missingRequired = spec
    .map((s, i) => ({ spec: s, idx: colIdx[i] }))
    .filter((x) => x.spec.required && x.idx < 0)
    .map((x) => x.spec.key);
  if (missingRequired.length > 0) {
    return {
      csv: null,
      preErrors: [`CSV 缺少必填列: ${missingRequired.join(", ")}`],
      rowCount: 0,
    };
  }

  const outputRows: string[][] = [spec.map((s) => s.key)];
  const preErrors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const lineNo = i + 1;
    const outputRow: string[] = [];
    let rowError: string | null = null;

    for (let c = 0; c < spec.length; c++) {
      const s = spec[c];
      const idx = colIdx[c];
      const raw = idx >= 0 ? (row[idx] ?? "").trim() : "";
      const value = raw === "" ? s.defaultValue ?? "" : raw;
      if (s.validate) {
        const err = s.validate(value);
        if (err) {
          rowError = `第${lineNo}行: ${err}`;
          break;
        }
      }
      outputRow.push(value);
    }

    if (rowError) {
      preErrors.push(rowError);
      continue;
    }
    outputRows.push(outputRow);
  }

  // 后端 csv crate 默认不处理 BOM，前端重新序列化时关闭 BOM，避免污染第一列
  const csv = rowsToCsv(outputRows, { withBom: false, eol: "\n" });
  return { csv, preErrors, rowCount: outputRows.length - 1 };
}

// 校验非负数字；空字符串视为合法（由 defaultValue 兜底）
const validateNumber = (raw: string): string | null => {
  if (raw === "") return null;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return `"${raw}" 不是有效数字`;
  if (n < 0) return `"${raw}" 不能为负数`;
  return null;
};

// 校验非负整数
const validateInteger = (raw: string): string | null => {
  if (raw === "") return null;
  if (!/^\d+$/.test(raw.trim())) return `"${raw}" 不是有效整数`;
  return null;
};

const validateNonEmpty = (label: string) => (raw: string): string | null => {
  if (raw.trim() === "") return `${label} 不能为空`;
  return null;
};

export default function ImportExportPage() {
  const queryClient = useQueryClient();
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [showImportDetails, setShowImportDetails] = useState(false);
  const { marketContext, marketContextReady } = useSectionRefresh();

  const { data: backupInfo, refetch: refetchBackupInfo } = useQuery({
    queryKey: [...queryKeys.backupInfo, marketContext.seasonId, marketContext.marketMode],
    queryFn: cmd.getBackupInfo,
    enabled: marketContextReady,
  });

  const invalidateAfterImport = (kind: "watchlist" | "inventory" | "buyWatches" | "arbitrage") => {
    if (kind === "watchlist") {
      invalidateSectionData(queryClient, {
        seasonId: marketContext.seasonId,
        marketMode: marketContext.marketMode,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.miniWindowFeed });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
      return;
    }

    if (kind === "inventory" || kind === "buyWatches") {
      invalidateInventoryData(queryClient);
      queryClient.invalidateQueries({ queryKey: queryKeys.miniWindowFeed });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
      return;
    }

    queryClient.invalidateQueries({ queryKey: queryKeys.arbitrageRecipes });
    queryClient.invalidateQueries({ queryKey: queryKeys.arbitrageCalculation });
    queryClient.invalidateQueries({ queryKey: queryKeys.miniWindowFeed });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
  };

  // ===== 各导入入口的列规范 =====
  // 关注列表：兼容导出后重导入，也支持用户用“分组名称 + 物品ID”导入。
  const watchlistSpec: ColumnSpec[] = [
    { key: "section_id", aliases: ["分组ID", "section"], defaultValue: "" },
    { key: "section_name", aliases: ["分组名称", "group", "分组"], defaultValue: "" },
    { key: "season_id", aliases: ["赛季ID", "season"], defaultValue: marketContext.seasonId },
    { key: "market_mode", aliases: ["市场模式", "mode"], defaultValue: marketContext.marketMode },
    { key: "item_id", aliases: ["物品ID", "item"], required: true, validate: validateNonEmpty("物品ID") },
    { key: "purchase_fire_price", aliases: ["购买火价", "fire_price", "price"], defaultValue: "0", validate: validateNumber },
    { key: "count", aliases: ["数量", "qty", "quantity"], defaultValue: "1", validate: validateInteger },
    { key: "more_value", aliases: ["更多价值", "extra_value"], defaultValue: "0", validate: validateNumber },
  ];

  // 持仓：对应后端 import_inventory_csv
  const inventorySpec: ColumnSpec[] = [
    { key: "item_id", aliases: ["物品ID", "id"], required: true, validate: validateNonEmpty("物品ID") },
    { key: "item_name", aliases: ["物品名称", "name"], required: true, validate: validateNonEmpty("物品名称") },
    { key: "buy_price", aliases: ["买入价格", "price"], required: true, validate: (raw) => {
      if (raw.trim() === "") return "买入价格不能为空";
      const n = Number.parseFloat(raw);
      if (!Number.isFinite(n) || n <= 0) return `买入价格 "${raw}" 必须为正数`;
      return null;
    } },
    { key: "quantity", aliases: ["数量", "qty"], defaultValue: "1", validate: validateInteger },
    { key: "target_sell_price", aliases: ["目标卖价", "sell_price"], defaultValue: "" },
    { key: "total_cost", aliases: ["总成本", "cost"], defaultValue: "0", validate: validateNumber },
    { key: "note", aliases: ["备注", "remark"], defaultValue: "" },
    { key: "bought_at", aliases: ["买入时间", "created_at"], defaultValue: "" },
  ];

  // 买入监控：对应后端 import_buy_watches_csv
  const buyWatchesSpec: ColumnSpec[] = [
    { key: "item_id", aliases: ["物品ID", "id"], required: true, validate: validateNonEmpty("物品ID") },
    { key: "item_name", aliases: ["物品名称", "name"], required: true, validate: validateNonEmpty("物品名称") },
    { key: "target_buy_price", aliases: ["目标买入价", "buy_price", "price"], required: true, validate: (raw) => {
      if (raw.trim() === "") return "目标买入价不能为空";
      const n = Number.parseFloat(raw);
      if (!Number.isFinite(n) || n <= 0) return `目标买入价 "${raw}" 必须为正数`;
      return null;
    } },
    { key: "max_quantity", aliases: ["最大数量", "qty"], defaultValue: "" },
    { key: "note", aliases: ["备注", "remark"], defaultValue: "" },
  ];

  // 套利配方：对应后端 import_arbitrage_recipes_csv
  const arbitrageSpec: ColumnSpec[] = [
    { key: "name", aliases: ["配方名称"], required: true, validate: validateNonEmpty("配方名称") },
    { key: "recipe_type", aliases: ["配方类型", "type"], defaultValue: "normal" },
    { key: "season_id", aliases: ["赛季ID", "season"], defaultValue: marketContext.seasonId },
    { key: "market_mode", aliases: ["市场模式", "mode"], defaultValue: marketContext.marketMode },
    { key: "enabled", aliases: ["启用"], defaultValue: "true" },
  ];

  // 共享的 CSV 导入流水线：选文件 → 预处理 → 调后端 → 合并错误
  const runCsvImport = async (
    spec: ColumnSpec[],
    backendCall: (csv: string) => Promise<{ imported: number; errors: string[] }>,
  ): Promise<{ result: { imported: number; errors: string[] }; fileName: string } | null> => {
    const file = await open({
      multiple: false,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!file) return null;

    const content = await readTextFile(file);
    const { csv, preErrors } = preprocessCsv(content, spec);

    if (csv === null) {
      // 必填列缺失等严重错误，直接展示错误，不调后端
      return { result: { imported: 0, errors: preErrors }, fileName: file };
    }

    const result = await backendCall(csv);
    return {
      result: {
        imported: result.imported,
        errors: [...preErrors, ...result.errors],
      },
      fileName: file,
    };
  };

  const importCsvMutation = useMutation({
    mutationFn: () => runCsvImport(watchlistSpec, cmd.importWatchlistCsv),
    onSuccess: (data) => {
      if (!data) return;
      setImportResult(data.result);
      setShowImportDetails(false);
      invalidateAfterImport("watchlist");
    },
    onError: (err) => {
      toast.error(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const importInventoryMutation = useMutation({
    mutationFn: () => runCsvImport(inventorySpec, cmd.importInventoryCsv),
    onSuccess: (data) => {
      if (!data) return;
      setImportResult(data.result);
      setShowImportDetails(false);
      invalidateAfterImport("inventory");
    },
    onError: (err) => {
      toast.error(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const importBuyWatchesMutation = useMutation({
    mutationFn: () => runCsvImport(buyWatchesSpec, cmd.importBuyWatchesCsv),
    onSuccess: (data) => {
      if (!data) return;
      setImportResult(data.result);
      setShowImportDetails(false);
      invalidateAfterImport("buyWatches");
    },
    onError: (err) => {
      toast.error(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const importArbitrageMutation = useMutation({
    mutationFn: () => runCsvImport(arbitrageSpec, cmd.importArbitrageRecipesCsv),
    onSuccess: (data) => {
      if (!data) return;
      setImportResult(data.result);
      setShowImportDetails(false);
      invalidateAfterImport("arbitrage");
    },
    onError: (err) => {
      toast.error(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const importAlertRulesMutation = useMutation({
    mutationFn: async () => {
      const file = await open({
        multiple: false,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const content = await readTextFile(file);
      const result = await cmd.importAlertRulesCsv(content);
      return { result };
    },
    onSuccess: (data) => {
      if (!data) return;
      setImportResult(data.result);
      setShowImportDetails(false);
    },
    onError: (err) => {
      toast.error(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const importStrategiesMutation = useMutation({
    mutationFn: async () => {
      const file = await open({
        multiple: false,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const content = await readTextFile(file);
      const result = await cmd.importStrategiesCsv(content);
      return { result };
    },
    onSuccess: (data) => {
      if (!data) return;
      setImportResult(data.result);
      setShowImportDetails(false);
    },
    onError: (err) => {
      toast.error(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const importSeasonsMutation = useMutation({
    mutationFn: async () => {
      const file = await open({
        multiple: false,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const content = await readTextFile(file);
      const result = await cmd.importSeasonsCsv(content);
      return { result };
    },
    onSuccess: (data) => {
      if (!data) return;
      setImportResult(data.result);
      setShowImportDetails(false);
    },
    onError: (err) => {
      toast.error(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const importFireHistoryMutation = useMutation({
    mutationFn: async () => {
      const file = await open({
        multiple: false,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const content = await readTextFile(file);
      const result = await cmd.importFireHistoryCsv(content);
      return { result };
    },
    onSuccess: (data) => {
      if (!data) return;
      setImportResult(data.result);
      setShowImportDetails(false);
    },
    onError: (err) => {
      toast.error(`导入失败: ${err instanceof Error ? err.message : String(err)}`);
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
      const csv = await cmd.exportArbitrageRecipesCsv();
      await writeTextFile(file, csv);
      return file;
    },
    onSuccess: (file) => {
      if (!file) return;
      toast.success("套利比价 CSV 导出成功");
    },
  });

  const exportAlertRulesMutation = useMutation({
    mutationFn: async () => {
      const file = await save({
        defaultPath: "torchscan_alert_rules.csv",
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const csv = await cmd.exportAlertRulesCsv();
      await writeTextFile(file, csv);
      return file;
    },
    onSuccess: (file) => {
      if (!file) return;
      toast.success("预警规则 CSV 导出成功");
    },
  });

  const exportStrategiesMutation = useMutation({
    mutationFn: async () => {
      const file = await save({
        defaultPath: "torchscan_strategies.csv",
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const csv = await cmd.exportStrategiesCsv();
      await writeTextFile(file, csv);
      return file;
    },
    onSuccess: (file) => {
      if (!file) return;
      toast.success("策略 CSV 导出成功");
    },
  });

  const exportSeasonsMutation = useMutation({
    mutationFn: async () => {
      const file = await save({
        defaultPath: "torchscan_seasons.csv",
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!file) return null;
      const csv = await cmd.exportSeasonsCsv();
      await writeTextFile(file, csv);
      return file;
    },
    onSuccess: (file) => {
      if (!file) return;
      toast.success("赛季配置 CSV 导出成功");
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

  const maintenanceMutation = useMutation({
    mutationFn: cmd.maintainDatabase,
    onSuccess: (result) => {
      refetchBackupInfo();
      toast.success(`数据库维护完成，释放 ${formatBytes(result.freed_kb)}`);
    },
    onError: () => {
      toast.error("数据库维护失败");
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
        <div className="grid grid-cols-4 gap-3">
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
                onClick={() => maintenanceMutation.mutate()}
                disabled={maintenanceMutation.isPending}
              >
                <Wrench className="w-4 h-4 mr-1.5" />
                {maintenanceMutation.isPending ? "维护中..." : "维护"}
              </Button>
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

      <div className="grid grid-cols-2 gap-5">
        <Surface padding="none">
          <div className="px-5 py-4 border-b border-[var(--color-border-soft)] bg-[var(--color-panel-soft)]">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-[var(--color-brand-gold)]" />
              <h2 className="text-sm font-semibold text-[var(--color-text)]">导入数据</h2>
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
                onClick={() => importCsvMutation.mutate()}
                disabled={importCsvMutation.isPending}
                variant="warning"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                {importCsvMutation.isPending ? "导入中..." : "导入 CSV"}
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
                onClick={() => importInventoryMutation.mutate()}
                disabled={importInventoryMutation.isPending}
                variant="warning"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                {importInventoryMutation.isPending ? "导入中..." : "导入 CSV"}
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
                onClick={() => importBuyWatchesMutation.mutate()}
                disabled={importBuyWatchesMutation.isPending}
                variant="warning"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                {importBuyWatchesMutation.isPending ? "导入中..." : "导入 CSV"}
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
                onClick={() => importArbitrageMutation.mutate()}
                disabled={importArbitrageMutation.isPending}
                variant="warning"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                {importArbitrageMutation.isPending ? "导入中..." : "导入 CSV"}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                  <span className="text-sm font-medium text-[var(--color-text)]">预警规则</span>
                </div>
              </div>
              <Button
                onClick={() => importAlertRulesMutation.mutate()}
                disabled={importAlertRulesMutation.isPending}
                variant="warning"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                {importAlertRulesMutation.isPending ? "导入中..." : "导入 CSV"}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                  <span className="text-sm font-medium text-[var(--color-text)]">策略</span>
                </div>
              </div>
              <Button
                onClick={() => importStrategiesMutation.mutate()}
                disabled={importStrategiesMutation.isPending}
                variant="warning"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                {importStrategiesMutation.isPending ? "导入中..." : "导入 CSV"}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                  <span className="text-sm font-medium text-[var(--color-text)]">赛季配置</span>
                </div>
              </div>
              <Button
                onClick={() => importSeasonsMutation.mutate()}
                disabled={importSeasonsMutation.isPending}
                variant="warning"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                {importSeasonsMutation.isPending ? "导入中..." : "导入 CSV"}
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
                onClick={() => importFireHistoryMutation.mutate()}
                disabled={importFireHistoryMutation.isPending}
                variant="warning"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                {importFireHistoryMutation.isPending ? "导入中..." : "导入 CSV"}
              </Button>
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
                variant="success"
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
                variant="success"
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
                variant="success"
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
                variant="success"
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
                variant="success"
              >
                <Download className="w-4 h-4 mr-1.5" />
                {exportArbitrageMutation.isPending ? "导出中..." : "导出"}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                  <span className="text-sm font-medium text-[var(--color-text)]">预警规则</span>
                </div>
              </div>
              <Button
                onClick={() => handleExport(exportAlertRulesMutation)}
                disabled={exportAlertRulesMutation.isPending}
                variant="success"
              >
                <Download className="w-4 h-4 mr-1.5" />
                {exportAlertRulesMutation.isPending ? "导出中..." : "导出"}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                  <span className="text-sm font-medium text-[var(--color-text)]">策略</span>
                </div>
              </div>
              <Button
                onClick={() => handleExport(exportStrategiesMutation)}
                disabled={exportStrategiesMutation.isPending}
                variant="success"
              >
                <Download className="w-4 h-4 mr-1.5" />
                {exportStrategiesMutation.isPending ? "导出中..." : "导出"}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] pt-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-text-subtle)]" />
                  <span className="text-sm font-medium text-[var(--color-text)]">赛季配置</span>
                </div>
              </div>
              <Button
                onClick={() => handleExport(exportSeasonsMutation)}
                disabled={exportSeasonsMutation.isPending}
                variant="success"
              >
                <Download className="w-4 h-4 mr-1.5" />
                {exportSeasonsMutation.isPending ? "导出中..." : "导出"}
              </Button>
            </div>
          </div>
        </Surface>
      </div>
    </PageShell>
  );
}
