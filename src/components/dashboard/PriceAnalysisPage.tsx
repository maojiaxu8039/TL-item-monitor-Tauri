import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { cmd } from "@/lib/commands";
import {
  BarChart3,
  ShoppingCart,
  DollarSign,
  Clock,
  Plus,
  ChevronDown,
  Loader2,
  Search,
  BarChart2,
} from "lucide-react";
import { ItemPriceTrendModal } from "./ItemPriceTrendModal";
import { ToastContainer } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

// ─── Types ─────────────────────────────────────────────────────────────────

interface HoardAnalysis {
  item_id: string;
  item_name: string;
  current_price: number;
  avg_price: number;
  min_price: number;
  max_price: number;
  price_trend: string;
  trend_percent: number;
  recommendation: string;
  confidence: number;
  reason: string;
}

interface Section {
  id: string;
  name: string;
}

// ─── Section Picker ─────────────────────────────────────────────────────────

function SectionPicker({
  sections,
  onAdd,
}: {
  sections: Section[];
  onAdd: (sectionId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1 px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
      >
        <Plus className="w-3 h-3" />
        关注
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 min-w-[140px] py-1">
            {sections.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400">暂无分组</div>
            ) : (
              sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    onAdd(s.id);
                    setOpen(false);
                  }}
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

// ─── Hoard Analysis Card ────────────────────────────────────────────────────

function HoardCard({
  analysis,
  sections,
  onAddToSection,
  onViewTrend,
}: {
  analysis: HoardAnalysis;
  sections: Section[];
  onAddToSection: (sectionId: string, itemId: string, itemName: string, price: number) => void;
  onViewTrend: (itemId: string, itemName: string) => void;
}) {
  const isBuy = analysis.recommendation === "buy";
  const isSell = analysis.recommendation === "sell";

  const getConfig = () => {
    if (isBuy)
      return {
        border: "border-green-200",
        bg: "bg-green-50",
        badge: "bg-green-100 text-green-700",
        icon: ShoppingCart,
        label: "建议入手",
      };
    if (isSell)
      return {
        border: "border-red-200",
        bg: "bg-red-50",
        badge: "bg-red-100 text-red-700",
        icon: DollarSign,
        label: "建议出手",
      };
    return {
      border: "border-amber-200",
      bg: "bg-amber-50",
      badge: "bg-amber-100 text-amber-700",
      icon: Clock,
      label: "建议观望",
    };
  };

  const config = getConfig();
  const Icon = config.icon;

  return (
    <div className={`bg-white rounded-xl border ${config.border} p-4 hover:shadow-sm transition-shadow`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${config.bg}`}>
            <Icon className={`w-5 h-5 ${isBuy ? "text-green-600" : isSell ? "text-red-600" : "text-amber-600"}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 
                className="font-semibold text-slate-800 cursor-pointer hover:text-blue-600 transition-colors"
                onClick={() => onViewTrend(analysis.item_id, analysis.item_name)}
                title="点击查看价格走势"
              >
                {analysis.item_name}
              </h4>
              <button
                onClick={() => onViewTrend(analysis.item_id, analysis.item_name)}
                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-slate-200 hover:bg-slate-50 transition-colors"
                title="查看价格走势"
              >
                <BarChart2 className="w-3 h-3 text-blue-500" />
                走势
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{analysis.reason}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-1 rounded ${config.badge}`}>
            {config.label}
          </span>
          <SectionPicker
            sections={sections}
            onAdd={(sectionId) =>
              onAddToSection(sectionId, analysis.item_id, analysis.item_name, analysis.current_price)
            }
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3 mt-4">
        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="text-xs text-slate-400 mb-1">当前价格</div>
          <div className="text-sm font-bold text-slate-700">{analysis.current_price.toFixed(1)}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="text-xs text-slate-400 mb-1">均价</div>
          <div className="text-sm font-bold text-slate-700">{analysis.avg_price.toFixed(1)}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="text-xs text-slate-400 mb-1">价格区间</div>
          <div className="text-sm font-bold text-slate-700">{analysis.min_price.toFixed(1)} - {analysis.max_price.toFixed(1)}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="text-xs text-slate-400 mb-1">趋势</div>
          <div className={`text-sm font-bold ${analysis.trend_percent > 0 ? "text-red-600" : analysis.trend_percent < 0 ? "text-green-600" : "text-slate-700"}`}>
            {analysis.trend_percent > 0 ? "+" : ""}{analysis.trend_percent.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Confidence Bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-slate-400">分析置信度</span>
          <span className="text-slate-600 font-medium">{analysis.confidence}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              analysis.confidence >= 70
                ? "bg-green-500"
                : analysis.confidence >= 40
                ? "bg-amber-500"
                : "bg-red-500"
            }`}
            style={{ width: `${analysis.confidence}%` }}
          />
        </div>
      </div>
    </div>
  );
}



// ─── Main Page ──────────────────────────────────────────────────────────────

export default function PriceAnalysisPage() {
  const { marketContext } = useSectionRefresh();
  const { toasts, addToast, dismissToast } = useToast();
  const [searchKeyword, setSearchKeyword] = useState("");
  const [sortBy, setSortBy] = useState<"price_asc" | "price_desc" | "trend">("trend");
  const [trendItem, setTrendItem] = useState<{ itemId: string; itemName: string } | null>(null);

  // 获取分组列表
  const { data: sections = [] } = useQuery({
    queryKey: ["sections", marketContext.seasonId, marketContext.marketMode],
    queryFn: cmd.getSections,
  });

  // 生成分析数据
  const { data: analysisData = [], isLoading: analysisLoading } = useQuery({
    queryKey: ["item-price-insights", marketContext.seasonId, marketContext.marketMode],
    queryFn: cmd.getItemPriceInsights,
    enabled: !!marketContext.seasonId,
  });

  // 过滤和排序
  const filteredAnalysis = useMemo(() => {
    let data = [...analysisData];

    // Search filter
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      data = data.filter(
        (a) =>
          a.item_name.toLowerCase().includes(keyword)
      );
    }

    // Sort
    data.sort((a, b) => {
      switch (sortBy) {
        case "price_asc":
          return a.current_price - b.current_price;
        case "price_desc":
          return b.current_price - a.current_price;
        case "trend":
          // Sort by recommendation priority: buy > wait > sell
          const order: Record<string, number> = { buy: 0, wait: 1, sell: 2 };
          return order[a.recommendation] - order[b.recommendation];
        default:
          return 0;
      }
    });

    return data;
  }, [analysisData, searchKeyword, sortBy]);

  // 添加到分组
  const handleAddToSection = useCallback(
    (sectionId: string, itemId: string, itemName: string, price: number) => {
      cmd
        .addSectionItem(sectionId, marketContext.seasonId, marketContext.marketMode, itemId, price, 1, 0)
        .then(() => {
          addToast("success", `${itemName} 已添加到分组`);
        })
        .catch(() => addToast("error", "添加失败"));
    },
    [marketContext.seasonId, marketContext.marketMode]
  );

  // 统计
  const stats = useMemo(() => {
    const buy = filteredAnalysis.filter((a) => a.recommendation === "buy").length;
    const sell = filteredAnalysis.filter((a) => a.recommendation === "sell").length;
    const wait = filteredAnalysis.filter((a) => a.recommendation === "wait").length;
    return { buy, sell, wait, total: filteredAnalysis.length };
  }, [filteredAnalysis]);

  return (
    <div className="space-y-5">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">物价分析</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            基于历史价格波动和周期分析，智能推荐囤货/出货时机
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-purple-500" />
            <span className="text-sm text-slate-500">分析物品</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
          <div className="text-xs text-slate-400">件物品</div>
        </div>

        <div className="bg-white rounded-xl border border-green-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="w-4 h-4 text-green-500" />
            <span className="text-sm text-slate-500">建议入手</span>
          </div>
          <div className="text-2xl font-bold text-green-600">{stats.buy}</div>
          <div className="text-xs text-slate-400">件物品</div>
        </div>

        <div className="bg-white rounded-xl border border-red-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-red-500" />
            <span className="text-sm text-slate-500">建议出手</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.sell}</div>
          <div className="text-xs text-slate-400">件物品</div>
        </div>

        <div className="bg-white rounded-xl border border-amber-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-sm text-slate-500">建议观望</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{stats.wait}</div>
          <div className="text-xs text-slate-400">件物品</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
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

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">排序:</span>
          {[
            { key: "trend" as const, label: "趋势" },
            { key: "price_asc" as const, label: "价格低" },
            { key: "price_desc" as const, label: "价格高" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                sortBy === s.key
                  ? "bg-blue-100 text-blue-700"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Analysis List */}
      {analysisLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
          <span className="ml-2 text-sm text-slate-400">分析中...</span>
        </div>
      ) : filteredAnalysis.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-100">
          <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <div className="text-sm">暂无分析数据</div>
          <div className="text-xs mt-1">需要历史价格数据才能进行分析</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAnalysis.map((analysis) => (
            <HoardCard
              key={analysis.item_id}
              analysis={analysis}
              sections={sections}
              onAddToSection={handleAddToSection}
              onViewTrend={(itemId, itemName) => setTrendItem({ itemId, itemName })}
            />
          ))}
        </div>
      )}

      {/* Trend Modal */}
      {trendItem && (
        <ItemPriceTrendModal
          itemId={trendItem.itemId}
          itemName={trendItem.itemName}
          historySeason="ss11"
          currentDay={1}
          onClose={() => setTrendItem(null)}
        />
      )}
    </div>
  );
}
