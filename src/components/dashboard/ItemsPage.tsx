import { useState, useEffect, useMemo, useCallback } from "react";
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
  SlidersHorizontal,
} from "lucide-react";
import { ItemPriceTrendModal } from "./ItemPriceTrendModal";
import { ToastContainer, useToast } from "@/components/ui/Toast";

const COLUMN_HELPER = createColumnHelper<ItemData>();

// ─── Types ─────────────────────────────────────────────────────────────────

interface ItemPriceCompare {
  item_id: string;
  name: string;
  current_price: number;
  history_price: number | null;
  premium_rate: number | null;
  price_diff: number | null;
  percentile: number | null;
}

// ─── Section Picker ─────────────────────────────────────────────────────────

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
        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors whitespace-nowrap"
      >
        <Plus className="w-3 h-3 flex-shrink-0" />
        <span>分组</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 min-w-[140px] py-1">
            {sections.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400">暂无分组</div>
            ) : (
              sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => { onAdd(s.id); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
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

// ─── Day Range Input ────────────────────────────────────────────────────────

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
        className="pl-9 pr-3 py-2 w-28 border border-slate-200 rounded text-sm bg-white outline-none focus:border-blue-400 placeholder:text-slate-300"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">天</span>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ItemsPage() {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { toasts, addToast, dismissToast } = useToast();
  const [dataSource, setDataSource] = useState<"api" | "local">("api");
  const [historySeason, setHistorySeason] = useState("ss11");
  const [trendItem, setTrendItem] = useState<{ itemId: string; name: string } | null>(null);
  const [dayFilter, setDayFilter] = useState("all");

  const PAGE_SIZE = 50;

  // ─── Debounce search ─────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(searchKeyword);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  useEffect(() => {
    cmd.getConfig().then((cfg) => {
      setDataSource(cfg.scrape.items_source === "local" ? "local" : "api");
    }).catch(() => {});
  }, []);

  // ─── Data queries ───────────────────────────────────────────────────────
  const { marketContext } = useSectionRefresh();

  const { data: searchResult, isLoading, refetch } = useQuery({
    queryKey: ["items-search", marketContext.seasonId, marketContext.marketMode, debouncedKeyword, typeFilter, page],
    queryFn: () => {
      const keyword = debouncedKeyword;
      return cmd.searchItems(keyword, page, PAGE_SIZE);
    },
    placeholderData: (prev) => prev,
    staleTime: 10_000,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["sections", marketContext.seasonId, marketContext.marketMode],
    queryFn: cmd.getSections,
  });

  // 获取动态物品类型列表
  const { data: itemTypes = [] } = useQuery({
    queryKey: ["item-types"],
    queryFn: cmd.getItemTypes,
  });

  // 获取物品价格对比数据
  const { data: priceCompareData } = useQuery({
    queryKey: ["items-compare", marketContext.seasonId, historySeason, marketContext.marketMode],
    queryFn: () => cmd.getItemsPriceCompare(historySeason),
    enabled: !!marketContext.seasonId,
  });

  const refreshMutation = useMutation({
    mutationFn: cmd.refreshItems,
    onSuccess: () => {
      refetch();
      addToast("success", "物品信息已获取");
    },
    onError: (error: Error) => {
      const errorMsg = error.message || String(error);
      if (dataSource === "api") {
        addToast("error", `网络抓取失败: ${errorMsg}，请尝试手动获取`);
      } else {
        addToast("error", `本地文件读取失败: ${errorMsg}，建议切换到网络数据源`);
      }
    },
  });

  // ─── Filter and sort items client-side ───────────────────────────────────
  const items = useMemo(() => {
    if (!searchResult?.items) return [];
    let list = [...searchResult.items];
    
    // Type filter
    if (typeFilter !== "all") {
      list = list.filter(item => item.item_type === typeFilter);
    }
    
    // Sort by price desc by default
    list.sort((a, b) => b.price - a.price);
    
    return list;
  }, [searchResult?.items, typeFilter]);

  // 获取物品的对比数据
  const getItemCompare = useCallback((itemId: string): ItemPriceCompare | null => {
    if (!priceCompareData) return null;
    const compare = priceCompareData.find((c: any) => c.item_id === itemId);
    if (!compare) return null;
    return compare;
  }, [priceCompareData]);

  const total = searchResult?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const startItem = (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, total);

  // ─── Add item to section ─────────────────────────────────────────────────
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
        })
        .catch(() => addToast("error", "添加失败"));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ─── Columns with explicit widths ────────────────────────────────────────
  const columns = useMemo(
    () => [
      COLUMN_HELPER.display({
        id: "name",
        header: "物品名称",
        cell: (info) => {
          const row = info.row.original;
          return (
            <div className="flex items-center gap-2 w-[220px]">
              <Package className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="text-slate-900 font-medium truncate">
                {row.name}
              </span>
              {row.item_type && (
                <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded flex-shrink-0">
                  {row.item_type}
                </span>
              )}
            </div>
          );
        },
      }),
      COLUMN_HELPER.accessor("price", {
        header: "当前价格(火)",
        cell: (info) => (
          <span className="text-orange-600 font-semibold whitespace-nowrap block w-[100px]">
            {info.getValue().toFixed(2)}
          </span>
        ),
      }),
      COLUMN_HELPER.display({
        id: "compare-fire",
        header: "对比赛季(火)",
        cell: ({ row }) => {
          const compare = getItemCompare(row.original.item_id);
          if (!compare || !compare.history_price) {
            return <span className="text-slate-400 text-xs block w-[100px]">—</span>;
          }
          return (
            <span className="text-slate-600 font-medium whitespace-nowrap block w-[100px]">
              {compare.history_price.toFixed(2)}
            </span>
          );
        },
      }),
      COLUMN_HELPER.display({
        id: "price-change",
        header: "价格变化",
        cell: ({ row }) => {
          const compare = getItemCompare(row.original.item_id);
          if (!compare || !compare.history_price) {
            return <span className="text-slate-400 text-xs block w-[80px]">—</span>;
          }
          const diff = compare.price_diff ?? 0;
          const rate = compare.premium_rate ?? 0;
          const isUp = diff > 0;
          return (
            <div className="flex flex-col gap-0.5 w-[80px]">
              <span className={`text-xs font-bold ${isUp ? "text-red-500" : "text-green-500"}`}>
                {isUp ? "↑" : "↓"} {Math.abs(rate).toFixed(1)}%
              </span>
              <span className="text-xs text-slate-400">
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
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-50 transition-colors"
              title="查看价格走势图"
            >
              {compare && compare.history_price ? (
                isUp ? (
                  <TrendingUp className="w-3.5 h-3.5 text-red-500" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-green-500" />
                )
              ) : (
                <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
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

  // ─── Table setup ────────────────────────────────────────────────────────
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // ─── Reset page when filters change ────────────────────────────────────
  useEffect(() => {
    setPage(1);
  }, [debouncedKeyword, typeFilter]);

  return (
    <div className="space-y-4">
      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-900">物价数据</h1>
          {total > 0 && (
            <span className="text-sm text-slate-400">共 {total} 件物品</span>
          )}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Type filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="pl-9 pr-8 py-2 border border-slate-200 rounded text-sm bg-white outline-none cursor-pointer appearance-none min-w-[120px]"
          >
            <option value="all">全部类型</option>
            {itemTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索物品名称..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded text-sm bg-white outline-none focus:border-blue-400"
          />
        </div>

        {/* History season compare - 统一样式 */}
        <div className="relative">
          <GitCompare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={historySeason}
            onChange={(e) => setHistorySeason(e.target.value)}
            className="pl-9 pr-8 py-2 border border-slate-200 rounded text-sm bg-white outline-none cursor-pointer appearance-none min-w-[140px]"
          >
            <option value="ss11">对比赛季 SS11</option>
            <option value="ss10">对比赛季 SS10</option>
            <option value="ss09">对比赛季 SS09</option>
          </select>
        </div>

        {/* Day filter - 数字输入框 */}
        <DayRangeInput value={dayFilter} onChange={setDayFilter} />

        {/* Refresh button */}
        <button
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          获取物品信息
        </button>
      </div>

      {/* ── Table card ── */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <colgroup>
              <col style={{ width: '240px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '80px' }} />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {table.getFlatHeaders().map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-3 text-xs text-slate-500 font-semibold text-start whitespace-nowrap"
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
                    <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      加载中...
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <div className="text-slate-400 text-sm">
                      {debouncedKeyword ? `未找到匹配"${debouncedKeyword}"的物品` : "暂无物品数据"}
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-3 py-2.5 text-sm first:pl-3 last:pr-3"
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

        {/* ── Pagination ── */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <span className="text-xs text-slate-500">
              显示 {startItem}-{endItem} / 共 {total} 条
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-0.5 px-2.5 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                上一页
              </button>
              <span className="px-3 py-1.5 text-xs text-slate-500">
                第 {page} / {totalPages} 页
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-0.5 px-2.5 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下一页
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Trend Modal ── */}
      {trendItem && (
        <ItemPriceTrendModal
          itemId={trendItem.itemId}
          itemName={trendItem.name}
          historySeason={historySeason}
          onClose={() => setTrendItem(null)}
        />
      )}
    </div>
  );
}
