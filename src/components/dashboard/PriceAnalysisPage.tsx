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
  Zap,
  ArrowRight,
  Search,
  Filter,
  BarChart2,
} from "lucide-react";
import { ItemPriceTrendModal } from "./ItemPriceTrendModal";
import { ToastContainer, useToast } from "@/components/ui/Toast";

// ─── Types ─────────────────────────────────────────────────────────────────

interface HoardAnalysis {
  item_id: string;
  item_name: string;
  item_type: string | null;
  volatility_score: number;
  cycle_period: number;
  price_range: number;
  current_price: number;
  avg_price: number;
  min_price: number;
  max_price: number;
  best_buy_day: number;
  best_buy_hour: number;
  best_buy_price: number;
  best_sell_day: number;
  best_sell_hour: number;
  best_sell_price: number;
  expected_profit: number;
  confidence: number;
  recommendation: "hoard" | "sell" | "watch";
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
  const isHoard = analysis.recommendation === "hoard";
  const isSell = analysis.recommendation === "sell";

  const getConfig = () => {
    if (isHoard)
      return {
        border: "border-green-200",
        bg: "bg-green-50",
        badge: "bg-green-100 text-green-700",
        icon: ShoppingCart,
        label: "建议囤货",
      };
    if (isSell)
      return {
        border: "border-red-200",
        bg: "bg-red-50",
        badge: "bg-red-100 text-red-700",
        icon: DollarSign,
        label: "建议出货",
      };
    return {
      border: "border-amber-200",
      bg: "bg-amber-50",
      badge: "bg-amber-100 text-amber-700",
      icon: Clock,
      label: "继续观望",
    };
  };

  const config = getConfig();
  const Icon = config.icon;

  return (
    <div className={`bg-white rounded-xl border ${config.border} p-4 hover:shadow-sm transition-shadow`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${config.bg}`}>
            <Icon className={`w-5 h-5 ${isHoard ? "text-green-600" : isSell ? "text-red-600" : "text-amber-600"}`} />
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
              {analysis.item_type && (
                <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                  {analysis.item_type}
                </span>
              )}
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
          <div className="text-xs text-slate-400 mb-1">波动评分</div>
          <div className="text-sm font-bold text-slate-700">{analysis.volatility_score}/100</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="text-xs text-slate-400 mb-1">周期</div>
          <div className="text-sm font-bold text-slate-700">{analysis.cycle_period}h</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="text-xs text-slate-400 mb-1">价格区间</div>
          <div className="text-sm font-bold text-slate-700">{analysis.price_range.toFixed(2)}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="text-xs text-slate-400 mb-1">预期收益</div>
          <div className={`text-sm font-bold ${analysis.expected_profit > 0 ? "text-green-600" : "text-red-600"}`}>
            {analysis.expected_profit > 0 ? "+" : ""}
            {analysis.expected_profit.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Buy/Sell Timeline */}
      <div className="mt-4 flex items-center gap-4">
        <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <ShoppingCart className="w-3.5 h-3.5 text-green-600" />
            <span className="text-xs font-medium text-green-700">最佳入手</span>
          </div>
          <div className="text-sm font-bold text-green-800">
            {analysis.best_buy_price.toFixed(2)} 火
          </div>
          <div className="text-xs text-green-600 mt-0.5">
            第{analysis.best_buy_day}天 {String(analysis.best_buy_hour).padStart(2, "0")}:00
          </div>
        </div>

        <ArrowRight className="w-5 h-5 text-slate-300 flex-shrink-0" />

        <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <DollarSign className="w-3.5 h-3.5 text-red-600" />
            <span className="text-xs font-medium text-red-700">最佳出手</span>
          </div>
          <div className="text-sm font-bold text-red-800">
            {analysis.best_sell_price.toFixed(2)} 火
          </div>
          <div className="text-xs text-red-600 mt-0.5">
            第{analysis.best_sell_day}天 {String(analysis.best_sell_hour).padStart(2, "0")}:00
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
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [sortBy, setSortBy] = useState<"volatility" | "profit" | "confidence">("volatility");
  const [trendItem, setTrendItem] = useState<{ itemId: string; itemName: string } | null>(null);

  // 获取物品列表
  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ["items-search", marketContext.seasonId, marketContext.marketMode, "", "all", 1],
    queryFn: () => cmd.searchItems("", 1, 100),
  });

  // 获取动态物品类型列表
  const { data: itemTypes = [] } = useQuery({
    queryKey: ["item-types"],
    queryFn: cmd.getItemTypes,
  });

  // 获取分组列表
  const { data: sections = [] } = useQuery({
    queryKey: ["sections", marketContext.seasonId, marketContext.marketMode],
    queryFn: cmd.getSections,
  });

  // 生成分析数据
  const analysisData = useMemo(() => {
    // TODO: 等待后端实现真实的囤货分析功能
    // 目前暂时返回空数组
    return [];
  }, [itemsData]);

  // 过滤和排序
  const filteredAnalysis = useMemo(() => {
    let data = [...analysisData];

    // Category filter
    if (selectedCategory !== "all") {
      data = data.filter((a) => a.item_type === selectedCategory);
    }

    // Search filter
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      data = data.filter(
        (a) =>
          a.item_name.toLowerCase().includes(keyword) ||
          (a.item_type && a.item_type.toLowerCase().includes(keyword))
      );
    }

    // Sort
    data.sort((a, b) => {
      switch (sortBy) {
        case "volatility":
          return b.volatility_score - a.volatility_score;
        case "profit":
          return b.expected_profit - a.expected_profit;
        case "confidence":
          return b.confidence - a.confidence;
        default:
          return 0;
      }
    });

    return data;
  }, [analysisData, selectedCategory, searchKeyword, sortBy]);

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
    const hoard = filteredAnalysis.filter((a) => a.recommendation === "hoard").length;
    const sell = filteredAnalysis.filter((a) => a.recommendation === "sell").length;
    const watch = filteredAnalysis.filter((a) => a.recommendation === "watch").length;
    return { hoard, sell, watch, total: filteredAnalysis.length };
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
            <Zap className="w-4 h-4 text-purple-500" />
            <span className="text-sm text-slate-500">分析物品</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
          <div className="text-xs text-slate-400">件物品</div>
        </div>

        <div className="bg-white rounded-xl border border-green-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="w-4 h-4 text-green-500" />
            <span className="text-sm text-slate-500">建议囤货</span>
          </div>
          <div className="text-2xl font-bold text-green-600">{stats.hoard}</div>
          <div className="text-xs text-slate-400">件物品</div>
        </div>

        <div className="bg-white rounded-xl border border-red-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-red-500" />
            <span className="text-sm text-slate-500">建议出货</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.sell}</div>
          <div className="text-xs text-slate-400">件物品</div>
        </div>

        <div className="bg-white rounded-xl border border-amber-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-sm text-slate-500">继续观望</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{stats.watch}</div>
          <div className="text-xs text-slate-400">件物品</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Type filter dropdown */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
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

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">排序:</span>
          {[
            { key: "volatility" as const, label: "波动评分" },
            { key: "profit" as const, label: "预期收益" },
            { key: "confidence" as const, label: "置信度" },
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
      {itemsLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
          <span className="ml-2 text-sm text-slate-400">分析中...</span>
        </div>
      ) : filteredAnalysis.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-white rounded-xl border border-slate-100">
          <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <div className="text-sm">暂无分析数据</div>
          <div className="text-xs mt-1">请先获取物品数据</div>
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
