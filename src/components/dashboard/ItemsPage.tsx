import { useState, useEffect, useMemo, useCallback } from "react";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  X,
  Check,
  Loader2,
  TrendingUp,
  Eye,
  BarChart3,
} from "lucide-react";
import { ItemPriceTrendModal } from "./ItemPriceTrendModal";

const COLUMN_HELPER = createColumnHelper<ItemData>();

// ─── Types ─────────────────────────────────────────────────────────────────

interface Toast {
  id: string;
  message: string;
  type: "success" | "error";
}

interface ItemPriceCompare {
  item_id: string;
  name: string;
  current_price: number;
  history_price: number | null;
  premium_rate: number | null;
  price_diff: number | null;
  percentile: number | null;
}

// ─── Toast ──────────────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {toast.type === "success" ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-red-500" />}
          {toast.message}
          <button onClick={() => onDismiss(toast.id)} className="ml-1 opacity-60 hover:opacity-100">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Section Picker ─────────────────────────────────────────────────────────

function SectionPicker({
  sections,
  onAdd,
  onClose,
}: {
  sections: { id: string; name: string }[];
  onAdd: (sectionId: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        添加到分组
        <ChevronDown className="w-3 h-3" />
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

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ItemsPage() {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("price_desc");
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<ItemData | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dataSource, setDataSource] = useState<"api" | "local">("api");
  const [historySeason, setHistorySeason] = useState("ss11");
  const [trendItem, setTrendItem] = useState<{ itemId: string; name: string } | null>(null);

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
    queryKey: ["items-search", marketContext.seasonId, marketContext.marketMode, debouncedKeyword, typeFilter, sortOrder, page],
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
      addToast("success", "物价数据已刷新");
    },
    onError: (error: Error) => {
      const errorMsg = error.message || String(error);
      if (dataSource === "api") {
        addToast("error", `网络抓取失败: ${errorMsg}，请尝试手动刷新`);
      } else {
        addToast("error", `本地文件读取失败: ${errorMsg}，建议切换到网络数据源`);
      }
    },
  });

  // ─── Toast helpers ───────────────────────────────────────────────────────
  const addToast = (type: "success" | "error", message: string) => {
    const id = String(Date.now());
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  // ─── Sort items client-side ──────────────────────────────────────────────
  const items = useMemo(() => {
    if (!searchResult?.items) return [];
    let list = [...searchResult.items];
    switch (sortOrder) {
      case "price_desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "price_asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "updated":
        list.sort((a, b) => {
          const ta = a.updated_at ?? "";
          const tb = b.updated_at ?? "";
          return tb.localeCompare(ta);
        });
        break;
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    return list;
  }, [searchResult?.items, sortOrder]);

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

  // ─── Reset selection when filters change ────────────────────────────────
  useEffect(() => {
    setSelectedItem(null);
  }, [debouncedKeyword, typeFilter, sortOrder]);

  // ─── Add item to section ─────────────────────────────────────────────────
  const selectedItemRef = selectedItem;
  const addToSection = useCallback(
    (sectionId: string) => {
      const item = selectedItemRef;
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
          setSelectedItem(null);
        })
        .catch(() => addToast("error", "添加失败"));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ─── Columns (stable definition, minimal rebuilds) ──────────────────────
  const selectedItemId = selectedItem?.item_id ?? null;

  const columns = useMemo(
    () => [
      COLUMN_HELPER.accessor("name", {
        header: "物品名称",
        cell: (info) => {
          const row = info.row.original;
          const isSelected = selectedItemId === row.item_id;
          return (
            <div className="flex items-center gap-2">
              <span className={isSelected ? "text-blue-600 font-medium" : "text-slate-900"}>
                {row.name}
              </span>
            </div>
          );
        },
      }),
      COLUMN_HELPER.accessor("price", {
        header: "当前价格(火)",
        cell: (info) => (
          <span className="text-orange-600 font-medium">
            {info.getValue().toFixed(2)}
          </span>
        ),
      }),
      COLUMN_HELPER.display({
        id: "compare",
        header: "历史对比",
        cell: ({ row }) => {
          const compare = getItemCompare(row.original.item_id);
          if (!compare || !compare.history_price) {
            return <span className="text-slate-400 text-xs">—</span>;
          }
          const premium = compare.premium_rate ?? 0;
          const isHigh = premium > 0;
          return (
            <div className="flex flex-col gap-0.5">
              <span className={`text-xs font-medium ${isHigh ? "text-red-500" : "text-green-500"}`}>
                {isHigh ? "↑" : "↓"} {Math.abs(premium).toFixed(1)}%
              </span>
              <span className="text-xs text-slate-400">
                历史: {compare.history_price.toFixed(2)}
              </span>
            </div>
          );
        },
      }),
      COLUMN_HELPER.display({
        id: "percentile",
        header: "历史分位",
        cell: ({ row }) => {
          const compare = getItemCompare(row.original.item_id);
          if (!compare || compare.percentile === null) {
            return <span className="text-slate-400 text-xs">—</span>;
          }
          const p = compare.percentile;
          let color = "text-slate-500";
          if (p > 80) color = "text-red-500";
          else if (p < 20) color = "text-green-500";
          return (
            <span className={`text-xs font-medium ${color}`}>
              {p.toFixed(0)}%
            </span>
          );
        },
      }),
      COLUMN_HELPER.accessor("updated_at", {
        header: "更新时间",
        cell: (info) => {
          const val = info.getValue();
          if (!val) return <span className="text-slate-400">—</span>;
          const d = new Date(val);
          return (
            <span className="text-slate-500 text-xs">
              {d.toLocaleString("zh-CN", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          );
        },
      }),
      COLUMN_HELPER.display({
        id: "actions",
        header: "操作",
        cell: ({ row }) => {
          const isSelected = selectedItemId === row.original.item_id;
          return (
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setTrendItem({ itemId: row.original.item_id, name: row.original.name });
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
              >
                <BarChart3 className="w-3 h-3" />
                走势
              </button>
              {isSelected && (
                <SectionPicker
                  sections={sections}
                  onAdd={addToSection}
                  onClose={() => setSelectedItem(null)}
                />
              )}
            </div>
          );
        },
      }),
    ],
    [selectedItemId, sections, addToSection, getItemCompare]
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
  }, [debouncedKeyword, typeFilter, sortOrder]);

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
        <div className="flex items-center gap-3">
          <select
            value={historySeason}
            onChange={(e) => setHistorySeason(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded text-sm bg-white outline-none"
          >
            <option value="ss11">对比 SS11</option>
            <option value="ss10">对比 SS10</option>
            <option value="ss09">对比 SS09</option>
          </select>
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            刷新物价
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索物品名称..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded text-sm bg-white outline-none focus:border-blue-400"
          />
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded text-sm bg-white outline-none cursor-pointer"
        >
          <option value="all">全部类型</option>
          <option value="weapon">武器</option>
          <option value="armor">护甲</option>
          <option value="accessory">饰品</option>
          <option value="consumable">消耗品</option>
          <option value="quest">任务道具</option>
          <option value="">未分类</option>
        </select>

        {/* Sort */}
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded text-sm bg-white outline-none cursor-pointer"
        >
          <option value="price_desc">按价格火↓</option>
          <option value="price_asc">按价格火↑</option>
          <option value="updated">按更新时间</option>
          <option value="name">按名称</option>
        </select>
      </div>

      {/* ── Table card ── */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {table.getFlatHeaders().map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-2.5 text-xs text-slate-500 font-medium text-start whitespace-nowrap"
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
                    className={`border-b border-slate-50 cursor-pointer transition-colors ${
                      selectedItem?.item_id === row.original.item_id
                        ? "bg-blue-50/60 hover:bg-blue-50"
                        : "hover:bg-slate-50/60"
                    }`}
                    onClick={() =>
                      setSelectedItem((prev) =>
                        prev?.item_id === row.original.item_id ? null : row.original
                      )
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-4 py-2.5 text-sm first:pl-4 last:pr-4"
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
