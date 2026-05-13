import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { cmd, type ItemData } from "../../lib/commands";
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Loader2,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Filter,
  Package,
  CalendarDays,
  GitCompare,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  Tag,
  Database,
} from "lucide-react";
import { ItemPriceTrendModal } from "./ItemPriceTrendModal";
import { ToastContainer } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { Surface } from "@/components/ui/Surface";
import { Toolbar, ToolbarActions } from "@/components/ui/Toolbar";
import { Button } from "@/components/ui/button";

const COLUMN_HELPER = createColumnHelper<ItemData>();

interface ItemPriceCompare {
  item_id: string;
  name: string;
  current_price: number;
  history_price: number | null;
  premium_rate: number | null;
  price_diff: number | null;
  percentile: number | null;
}

function SectionPicker({
  sections,
  onAdd,
}: {
  sections: { id: string; name: string }[];
  onAdd: (sectionId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(v => !v);
        }}
        className="inline-flex items-center gap-1 px-3 py-1.5 bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-white text-xs rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap shadow-sm"
      >
        <Plus className="w-3 h-3 flex-shrink-0" />
        <span>添加</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-20 min-w-[160px] py-1.5 overflow-hidden">
            {sections.length === 0 ? (
              <div className="px-4 py-3 text-xs text-slate-400">暂无分组</div>
            ) : (
              sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => { onAdd(s.id); setOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-[var(--color-brand)]/10 hover:text-[var(--color-brand)] transition-colors"
                >
                  {s.name}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DayRangeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [inputValue, setInputValue] = useState(value === "all" ? "" : value);

  const handleBlur = () => {
    const num = parseInt(inputValue);
    if (!isNaN(num) && num >= 1 && num <= 90) {
      onChange(String(num));
    } else {
      setInputValue("");
      onChange("all");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleBlur();
    }
  };

  return (
    <div className="relative flex items-center">
      <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        type="number"
        min={1}
        max={90}
        placeholder="第几天"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="pl-9 pr-3 py-2 w-28 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-slate-300 transition-all"
      />
    </div>
  );
}

export default function ItemsPage() {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { toasts, addToast, dismissToast } = useToast();
  const [historySeason, setHistorySeason] = useState("ss11");
  const [trendItem, setTrendItem] = useState<{ itemId: string; name: string } | null>(null);
  const [dayFilter, setDayFilter] = useState("all");

  const PAGE_SIZE = 50;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(searchKeyword);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  const { marketContext } = useSectionRefresh();
  const queryClient = useQueryClient();

  const { data: searchResult, isLoading, refetch } = useQuery({
    queryKey: ["items-search", marketContext.seasonId, marketContext.marketMode, debouncedKeyword, typeFilter, page, dayFilter],
    queryFn: () => {
      const keyword = debouncedKeyword;
      return cmd.searchItems(
        keyword, 
        page, 
        PAGE_SIZE, 
        dayFilter === "all" ? undefined : parseInt(dayFilter),
        typeFilter === "all" ? undefined : typeFilter
      );
    },
    placeholderData: (prev) => prev,
    staleTime: 10_000,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["sections", marketContext.seasonId, marketContext.marketMode],
    queryFn: cmd.getSections,
  });

  const { data: itemTypes = [] } = useQuery({
    queryKey: ["item-types"],
    queryFn: cmd.getItemTypes,
  });

  const { data: priceCompareData, isLoading: isCompareLoading, error: compareError } = useQuery({
    queryKey: ["items-compare", marketContext.seasonId, historySeason, marketContext.marketMode, dayFilter],
    queryFn: async () => {
      try {
        const result = await cmd.getItemsPriceCompare(
          historySeason,
          dayFilter === "all" ? undefined : parseInt(dayFilter)
        );
        return result;
      } catch (err) {
        console.error("getItemsPriceCompare error:", err);
        throw err;
      }
    },
    enabled: true,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      await refetch();
      return true;
    },
    onSuccess: () => {
      addToast("success", "物品信息已刷新");
    },
    onError: (error: Error) => {
      const errorMsg = error.message || String(error);
      addToast("error", `刷新失败: ${errorMsg}`);
    },
  });

  const compareMap = useMemo(() => {
    if (!priceCompareData) return new Map<string, ItemPriceCompare>();
    return new Map(priceCompareData.map((c: ItemPriceCompare) => [c.item_id, c]));
  }, [priceCompareData]);

  const getItemCompare = useCallback((itemId: string): ItemPriceCompare | null => {
    return compareMap.get(itemId) ?? null;
  }, [compareMap]);

  const items = searchResult?.items ?? [];
  const total = searchResult?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const startItem = (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, total);

  const stats = useMemo(() => {
    if (!items.length) return null;
    const avgPrice = items.reduce((sum, item) => sum + item.price, 0) / items.length;
    const maxPrice = Math.max(...items.map(item => item.price));
    const minPrice = Math.min(...items.map(item => item.price));
    return { avgPrice, maxPrice, minPrice };
  }, [items]);

  const addToSection = useCallback(
    (sectionId: string, item: ItemData) => {
      if (!item) return;
      cmd
        .addSectionItem(
          sectionId,
          marketContext.seasonId,
          marketContext.marketMode,
          item.item_id,
          item.price,
          1,
          0
        )
        .then(() => {
          addToast("success", `已添加到分组`);
          queryClient.invalidateQueries({ queryKey: ["section-items", marketContext.seasonId, marketContext.marketMode] });
        })
        .catch((err: any) => {
          const errorMsg = String(err);
          if (errorMsg.includes("物品已存在于该分组中")) {
            addToast("error", `"${item.name}" 已存在于该分组中`);
          } else {
            addToast("error", `添加失败: ${err}`);
          }
        });
    },
    [queryClient, marketContext.seasonId, marketContext.marketMode]
  );

  const columns = useMemo(
    () => [
      COLUMN_HELPER.display({
        id: "name",
        header: "物品名称",
        cell: (info) => {
          const row = info.row.original;
          return (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0 border border-slate-100">
                <Package className="w-4 h-4 text-slate-400" />
              </div>
              <div className="min-w-0">
                <div className="text-slate-800 font-medium text-sm truncate">{row.name}</div>
                {row.item_type && (
                  <span className="text-[11px] px-2 py-0.5 bg-slate-50 text-slate-500 rounded-md inline-block mt-0.5 border border-slate-100">
                    {row.item_type}
                  </span>
                )}
              </div>
            </div>
          );
        },
      }),
      COLUMN_HELPER.display({
        id: "compare-fire",
        header: "对比赛季(火价)",
        cell: ({ row }) => {
          const compare = getItemCompare(row.original.item_id);
          if (!compare || !compare.history_price) {
            return <span className="text-slate-400 text-sm">—</span>;
          }
          return (
            <div className="flex items-center gap-1">
              <span className="text-slate-600 font-medium">{compare.history_price.toFixed(2)}</span>
              <span className="text-xs text-slate-400">火</span>
            </div>
          );
        },
      }),
      COLUMN_HELPER.accessor("price", {
        header: "当前赛季(火价)",
        cell: (info) => (
          <div className="flex items-center gap-1">
            <span className="text-slate-800 font-bold">{info.getValue().toFixed(2)}</span>
            <span className="text-xs text-slate-400">火</span>
          </div>
        ),
      }),
      COLUMN_HELPER.display({
        id: "price-change",
        header: "价格变化",
        cell: ({ row }) => {
          const compare = getItemCompare(row.original.item_id);
          if (!compare || !compare.history_price) {
            return <span className="text-slate-400 text-sm">—</span>;
          }
          const diff = compare.price_diff ?? 0;
          const rate = compare.premium_rate ?? 0;
          const isUp = diff > 0;
          return (
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${
                isUp 
                  ? "bg-red-50 text-red-600" 
                  : "bg-green-50 text-green-600"
              }`}>
                {isUp ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {Math.abs(rate).toFixed(1)}%
              </div>
              <span className={`text-xs ${isUp ? "text-red-600" : "text-green-600"}`}>
                {isUp ? "+" : ""}{diff.toFixed(2)}
              </span>
            </div>
          );
        },
      }),
      COLUMN_HELPER.display({
        id: "trend",
        header: "走势",
        cell: ({ row }) => {
          const compare = getItemCompare(row.original.item_id);
          const isUp = compare ? (compare.premium_rate ?? 0) > 0 : false;
          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTrendItem({ itemId: row.original.item_id, name: row.original.name });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all"
              title="查看价格走势图"
            >
              {compare && compare.history_price ? (
                isUp ? (
                  <TrendingUp className="w-3.5 h-3.5 text-red-500" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-green-500" />
                )
              ) : (
                <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="text-slate-600">查看</span>
            </button>
          );
        },
      }),
      COLUMN_HELPER.display({
        id: "actions",
        header: "操作",
        cell: ({ row }) => {
          return (
            <div className="flex items-center">
              <SectionPicker
                sections={sections}
                onAdd={(sectionId) => addToSection(sectionId, row.original)}
              />
            </div>
          );
        },
      }),
    ],
    [sections, addToSection, getItemCompare]
  );

  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedKeyword, typeFilter, dayFilter]);

  return (
    <PageShell size="xl" className="space-y-5">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <PageHeader
        title="物价数据"
        description="查看和管理游戏物品价格信息"
        icon={Database}
        iconBg="bg-blue-50"
        iconColor="text-[var(--color-brand)]"
        actions={
          <ToolbarActions>
            <Button variant="outline" size="sm" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
              获取物品信息
            </Button>
          </ToolbarActions>
        }
      />

      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <MetricCard
            label="平均价格"
            value={stats.avgPrice.toFixed(2)}
            icon={ArrowUpDown}
            iconBg="bg-blue-50"
            iconColor="text-[var(--color-brand)]"
            helper={<span className="text-xs text-slate-400">火</span>}
          />
          <MetricCard
            label="最高价格"
            value={stats.maxPrice.toFixed(2)}
            icon={ArrowUp}
            iconBg="bg-red-50"
            iconColor="text-red-500"
            helper={<span className="text-xs text-slate-400">火</span>}
          />
          <MetricCard
            label="最低价格"
            value={stats.minPrice.toFixed(2)}
            icon={ArrowDown}
            iconBg="bg-green-50"
            iconColor="text-green-500"
            helper={<span className="text-xs text-slate-400">火</span>}
          />
          <MetricCard
            label="物品总数"
            value={total.toString()}
            icon={Tag}
            iconBg="bg-purple-50"
            iconColor="text-[var(--color-ai)]"
            helper={
              <span className="text-xs text-slate-400">
                本页 {startItem}-{endItem}
              </span>
            }
          />
        </div>
      )}

      <Surface padding="md">
        <Toolbar>
          <div className="flex items-center gap-3 flex-wrap flex-1">
            <DayRangeInput value={dayFilter} onChange={setDayFilter} />
            <div className="relative">
              <GitCompare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={historySeason}
                onChange={(e) => setHistorySeason(e.target.value)}
                className="pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none cursor-pointer appearance-none min-w-[160px] hover:border-slate-300 transition-colors focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="ss11">对比赛季 SS11</option>
              </select>
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none cursor-pointer appearance-none min-w-[140px] hover:border-slate-300 transition-colors focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="all">全部类型</option>
                {itemTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索物品名称..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500/30 transition-all w-full"
              />
            </div>
            <div className="text-xs text-slate-500">
              {isCompareLoading ? "加载中..." : compareError ? `错误: ${typeof compareError === 'string' ? compareError : compareError?.message || String(compareError)}` : `对比数据: ${priceCompareData?.length ?? 0} 条`}
            </div>
          </div>
        </Toolbar>
      </Surface>

      <Surface padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {table.getFlatHeaders().map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-xs text-slate-500 font-semibold text-start whitespace-nowrap"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <div className="flex items-center justify-center gap-3 text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm">加载中...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <Package className="w-12 h-12 text-slate-300" />
                      <span className="text-sm">
                        {debouncedKeyword ? `未找到匹配"${debouncedKeyword}"的物品` : "暂无物品数据"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-4 py-3 text-sm first:pl-4 last:pr-4"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              显示 <span className="font-medium text-slate-700">{startItem}-{endItem}</span> / 共 <span className="font-medium text-slate-700">{total}</span> 条
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                上一页
              </button>
              <span className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                下一页
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </Surface>

      {trendItem && (
        <ItemPriceTrendModal
          itemId={trendItem.itemId}
          itemName={trendItem.name}
          historySeason={historySeason}
          currentDay={dayFilter === "all" ? 1 : parseInt(dayFilter)}
          onClose={() => setTrendItem(null)}
        />
      )}
    </PageShell>
  );
}