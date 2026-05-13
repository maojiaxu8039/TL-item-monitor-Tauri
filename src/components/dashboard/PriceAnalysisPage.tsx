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
import { useToast } from "@/hooks/useToast";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Toolbar } from "@/components/ui/Toolbar";
import { Button } from "@/components/ui/button";

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
      <Button
        size="sm"
        variant="default"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Plus className="w-3 h-3 mr-1" />
        关注
        <ChevronDown className="w-3 h-3 ml-1" />
      </Button>
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
        badge: "success",
        icon: ShoppingCart,
        label: "建议入手",
      };
    if (isSell)
      return {
        border: "border-red-200",
        bg: "bg-red-50",
        badge: "danger",
        icon: DollarSign,
        label: "建议出手",
      };
    return {
      border: "border-amber-200",
      bg: "bg-amber-50",
      badge: "warning",
      icon: Clock,
      label: "建议观望",
    };
  };

  const config = getConfig();
  const Icon = config.icon;

  return (
    <Surface padding="md" className={`${config.border}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", config.bg)}>
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
          <StatusBadge variant={config.badge as any}>{config.label}</StatusBadge>
          <SectionPicker
            sections={sections}
            onAdd={(sectionId) =>
              onAddToSection(sectionId, analysis.item_id, analysis.item_name, analysis.current_price)
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mt-4">
        <Surface padding="sm" className="bg-slate-50">
          <div className="text-xs text-slate-400 mb-1">当前价格</div>
          <div className="text-sm font-bold text-slate-700">{analysis.current_price.toFixed(1)}</div>
        </Surface>
        <Surface padding="sm" className="bg-slate-50">
          <div className="text-xs text-slate-400 mb-1">均价</div>
          <div className="text-sm font-bold text-slate-700">{analysis.avg_price.toFixed(1)}</div>
        </Surface>
        <Surface padding="sm" className="bg-slate-50">
          <div className="text-xs text-slate-400 mb-1">价格区间</div>
          <div className="text-sm font-bold text-slate-700">{analysis.min_price.toFixed(1)} - {analysis.max_price.toFixed(1)}</div>
        </Surface>
        <Surface padding="sm" className="bg-slate-50">
          <div className="text-xs text-slate-400 mb-1">趋势</div>
          <div className={`text-sm font-bold ${analysis.trend_percent > 0 ? "text-red-600" : analysis.trend_percent < 0 ? "text-green-600" : "text-slate-700"}`}>
            {analysis.trend_percent > 0 ? "+" : ""}{analysis.trend_percent.toFixed(1)}%
          </div>
        </Surface>
      </div>

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
    </Surface>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function PriceAnalysisPage() {
  const { marketContext } = useSectionRefresh();
  const { addToast } = useToast();
  const [searchKeyword, setSearchKeyword] = useState("");
  const [sortBy, setSortBy] = useState<"price_asc" | "price_desc" | "trend">("trend");
  const [trendItem, setTrendItem] = useState<{ itemId: string; itemName: string } | null>(null);

  const { data: sections = [] } = useQuery({
    queryKey: ["sections", marketContext.seasonId, marketContext.marketMode],
    queryFn: cmd.getSections,
  });

  const { data: analysisData = [], isLoading: analysisLoading } = useQuery({
    queryKey: ["item-price-insights", marketContext.seasonId, marketContext.marketMode],
    queryFn: cmd.getItemPriceInsights,
    enabled: !!marketContext.seasonId,
  });

  const filteredAnalysis = useMemo(() => {
    let data = [...analysisData];

    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      data = data.filter(
        (a) =>
          a.item_name.toLowerCase().includes(keyword)
      );
    }

    data.sort((a, b) => {
      switch (sortBy) {
        case "price_asc":
          return a.current_price - b.current_price;
        case "price_desc":
          return b.current_price - a.current_price;
        case "trend":
          const order: Record<string, number> = { buy: 0, wait: 1, sell: 2 };
          return order[a.recommendation] - order[b.recommendation];
        default:
          return 0;
      }
    });

    return data;
  }, [analysisData, searchKeyword, sortBy]);

  const handleAddToSection = useCallback(
    (sectionId: string, itemId: string, itemName: string, price: number) => {
      cmd
        .addSectionItem(sectionId, marketContext.seasonId, marketContext.marketMode, itemId, price, 1, 0)
        .then(() => {
          addToast("success", `${itemName} 已添加到分组`);
        })
        .catch(() => addToast("error", "添加失败"));
    },
    [marketContext.seasonId, marketContext.marketMode, addToast]
  );

  const stats = useMemo(() => {
    const buy = filteredAnalysis.filter((a) => a.recommendation === "buy").length;
    const sell = filteredAnalysis.filter((a) => a.recommendation === "sell").length;
    const wait = filteredAnalysis.filter((a) => a.recommendation === "wait").length;
    return { buy, sell, wait, total: filteredAnalysis.length };
  }, [filteredAnalysis]);

  return (
    <PageShell size="xl" className="space-y-5">
      <PageHeader
        title="物价分析"
        description="基于历史价格波动和周期分析，智能推荐囤货/出货时机"
        iconAsset="price-analysis"
      />

      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          label="分析物品"
          value={stats.total}
          icon={BarChart3}
          iconBg="bg-purple-50"
          iconColor="text-purple-500"
          helper={<span className="text-xs text-slate-400">件物品</span>}
        />
        <MetricCard
          label="建议入手"
          value={stats.buy}
          icon={ShoppingCart}
          iconBg="bg-green-50"
          iconColor="text-green-500"
          helper={<span className="text-xs text-green-500">件物品</span>}
          className="border-green-100"
        />
        <MetricCard
          label="建议出手"
          value={stats.sell}
          icon={DollarSign}
          iconBg="bg-red-50"
          iconColor="text-red-500"
          helper={<span className="text-xs text-red-500">件物品</span>}
          className="border-red-100"
        />
        <MetricCard
          label="建议观望"
          value={stats.wait}
          icon={Clock}
          iconBg="bg-amber-50"
          iconColor="text-amber-500"
          helper={<span className="text-xs text-amber-500">件物品</span>}
          className="border-amber-100"
        />
      </div>

      <Surface padding="sm">
        <Toolbar className="flex items-center gap-3 flex-wrap">
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
        </Toolbar>
      </Surface>

      {analysisLoading ? (
        <Surface padding="md">
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
            <span className="ml-2 text-sm text-slate-400">分析中...</span>
          </div>
        </Surface>
      ) : filteredAnalysis.length === 0 ? (
        <Surface padding="md">
          <EmptyState
            title="暂无分析数据"
            description="需要历史价格数据才能进行分析"
            icon={BarChart3}
          />
        </Surface>
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

      {trendItem && (
        <ItemPriceTrendModal
          itemId={trendItem.itemId}
          itemName={trendItem.itemName}
          historySeason="ss11"
          currentDay={1}
          onClose={() => setTrendItem(null)}
        />
      )}
    </PageShell>
  );
}
