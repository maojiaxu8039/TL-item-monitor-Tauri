import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { devLog } from "@/lib/devLog";
import {
  Shield,
  Plus,
  Trash2,
  Edit3,
  X,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Layers,
  Zap,
  ChevronDown,
  ChevronRight,
  Image,
} from "lucide-react";
import { cmd, StrategyWithCosts, ItemData } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { toast } from "sonner";
import { type StrategyTemplate } from "@/lib/strategyTemplates";
import { calculateRecommendations as calculateRecommendationsImpl } from "@/lib/strategyRecommend";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { ToolbarActions } from "@/components/ui/Toolbar";
import { Button } from "@/components/ui/button";
import { StrategyFormDialog } from "./strategies/StrategyFormDialog";
import { StrategyItemAddDialog } from "./strategies/StrategyItemAddDialog";
import { ImagePreviewDialog } from "./strategies/ImagePreviewDialog";
import { StrategyTemplateLibrary } from "./strategies/StrategyTemplateLibrary";
import { StrategyRecommendations } from "./strategies/StrategyRecommendations";
import type {
  EditStrategyForm,
  CostForm,
  OutputForm,
  StrategyTab,
  StrategyRecommendation,
} from "./strategies/types";

export default function StrategiesPage() {
  const { marketContext, marketContextReady } = useSectionRefresh();
  const [activeTab, setActiveTab] = useState<StrategyTab>("strategies");
  const [strategies, setStrategies] = useState<StrategyWithCosts[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCostDialog, setShowCostDialog] = useState<string | null>(null);
  const [showOutputDialog, setShowOutputDialog] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [itemSearchResults, setItemSearchResults] = useState<ItemData[]>([]);
  const [, setSearchLoading] = useState(false);


  const [editForm, setEditForm] = useState<EditStrategyForm>({
    name: "",
    label: "K8-1",
    difficulty: "普通",
    output_value: 0,
    defense_value: 0,
    remark: "",
    image_url: "",
  });

  const [costForm, setCostForm] = useState<CostForm>({
    strategy_id: "",
    cost_type: "回响",
    item_id: "",
    item_name: "",
    count: 1,
    is_realtime: true,
  });

  const [outputForm, setOutputForm] = useState<OutputForm>({
    strategy_id: "",
    item_name: "",
    item_type: "",
    count: 1,
  });

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadStrategies = useCallback(async () => {
    try {
      const data = await cmd.getAllStrategiesWithCosts(marketContext.marketMode);
      if (!mountedRef.current) return;
      const sorted = [...data].sort((a, b) => b.profit_ratio - a.profit_ratio);
      setStrategies(sorted);
    } catch {
      if (!mountedRef.current) return;
      toast.error("加载策略失败");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [marketContext.marketMode]);

  useEffect(() => {
    if (!marketContextReady) return;
    loadStrategies();
  }, [marketContextReady, loadStrategies]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const searchItems = async (keyword: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!keyword.trim()) {
      setItemSearchResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const result = await cmd.searchItems(keyword, 1, 20);
        setItemSearchResults(result.items);
      } catch (e) {
        devLog.error("Search failed:", e);
        setItemSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  const resetForm = useCallback(() => {
    setEditForm({
      name: "",
      label: "K8-1",
      difficulty: "普通",
      output_value: 0,
      defense_value: 0,
      remark: "",
      image_url: "",
    });
  }, []);

  const resetCostForm = useCallback(() => {
    setCostForm({
      strategy_id: "",
      cost_type: "回响",
      item_id: "",
      item_name: "",
      count: 1,
      is_realtime: true,
    });
    setItemSearchResults([]);
  }, []);

  const resetOutputForm = useCallback(() => {
    setOutputForm({
      strategy_id: "",
      item_name: "",
      item_type: "",
      count: 1,
    });
    setItemSearchResults([]);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!editForm.name.trim()) {
      toast.warning("请输入策略名称");
      return;
    }
    try {
      await cmd.createStrategyDetail({
        name: editForm.name,
        label: editForm.label,
        difficulty: editForm.difficulty,
        output_value: editForm.output_value,
        defense_value: editForm.defense_value,
        remark: editForm.remark || null,
        image_url: editForm.image_url || null,
      });
      toast.success("策略创建成功");
      setShowCreateDialog(false);
      resetForm();
      loadStrategies();
    } catch (e) {
      toast.error(`创建策略失败: ${e}`);
    }
  }, [editForm, resetForm, loadStrategies]);

  const handleEdit = useCallback((strategy: StrategyWithCosts) => {
    setEditForm({
      id: strategy.id,
      name: strategy.name,
      label: strategy.label,
      difficulty: strategy.difficulty,
      output_value: strategy.output_value,
      defense_value: strategy.defense_value,
      remark: strategy.remark || "",
      image_url: strategy.image_url || "",
    });
    setShowEditDialog(true);
  }, []);

  const handleUpdate = useCallback(async () => {
    if (!editForm.id || !editForm.name.trim()) {
      toast.warning("请输入策略名称");
      return;
    }
    try {
      await cmd.updateStrategyDetail({
        id: editForm.id,
        name: editForm.name,
        label: editForm.label,
        difficulty: editForm.difficulty,
        output_value: editForm.output_value,
        defense_value: editForm.defense_value,
        remark: editForm.remark || null,
        image_url: editForm.image_url || null,
      });
      toast.success("策略更新成功");
      setShowEditDialog(false);
      resetForm();
      loadStrategies();
    } catch (e) {
      toast.error(`更新策略失败: ${e}`);
    }
  }, [editForm, resetForm, loadStrategies]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("确定要删除这个策略吗？")) return;
    try {
      await cmd.deleteStrategyDetail(id);
      toast.success("策略已删除");
      loadStrategies();
    } catch {
      toast.error("删除策略失败");
    }
  }, [loadStrategies]);

  const handleAddCost = useCallback(async () => {
    if (!costForm.item_id.trim() && !costForm.item_name.trim()) {
      toast.warning("请选择或输入物品");
      return;
    }
    try {
      await cmd.addStrategyCost({
        strategy_id: costForm.strategy_id,
        cost_type: costForm.cost_type,
        item_id: costForm.item_id,
        item_name: costForm.item_name || null,
        count: costForm.count,
        is_realtime: costForm.is_realtime,
      });
      toast.success("成本添加成功");
      setShowCostDialog(null);
      resetCostForm();
      loadStrategies();
    } catch {
      toast.error("添加成本失败");
    }
  }, [costForm, resetCostForm, loadStrategies]);

  const handleAddOutput = useCallback(async () => {
    if (!outputForm.item_name.trim()) {
      toast.warning("请选择物品");
      return;
    }
    try {
      await cmd.addStrategyOutput({
        strategy_id: outputForm.strategy_id,
        item_name: outputForm.item_name,
        item_type: outputForm.item_type,
        count: outputForm.count,
        estimated_value: 0,
        remark: null,
      });
      toast.success("产出添加成功");
      setShowOutputDialog(null);
      resetOutputForm();
      loadStrategies();
    } catch {
      toast.error("添加产出失败");
    }
  }, [outputForm, resetOutputForm, loadStrategies]);

  const handleDeleteCost = useCallback(async (id: string) => {
    try {
      await cmd.deleteStrategyCost(id);
      toast.success("成本已删除");
      loadStrategies();
    } catch {
      toast.error("删除成本失败");
    }
  }, [loadStrategies]);

  const handleDeleteOutput = useCallback(async (id: string) => {
    try {
      await cmd.deleteStrategyOutput(id);
      toast.success("产出已删除");
      loadStrategies();
    } catch {
      toast.error("删除产出失败");
    }
  }, [loadStrategies]);

  const handleRefreshPrices = useCallback(async (strategyId: string) => {
    setRefreshing(strategyId);
    try {
      await cmd.refreshStrategyFirePrices(strategyId);
      toast.success("火价已刷新");
      loadStrategies();
    } catch {
      toast.error("刷新火价失败");
    } finally {
      setRefreshing(null);
    }
  }, [loadStrategies]);

  const openCostDialog = useCallback((strategyId: string) => {
    setCostForm({
      strategy_id: strategyId,
      cost_type: "回响",
      item_id: "",
      item_name: "",
      count: 1,
      is_realtime: true,
    });
    setItemSearchResults([]);
    setShowCostDialog(strategyId);
  }, []);

  const openOutputDialog = useCallback((strategyId: string) => {
    setOutputForm({
      strategy_id: strategyId,
      item_name: "",
      item_type: "",
      count: 1,
    });
    setItemSearchResults([]);
    setShowOutputDialog(strategyId);
  }, []);

  const guessCostType = (itemName: string, itemType: string): string => {
    const name = itemName.toLowerCase();
    const type = itemType.toLowerCase();
    if (name.includes("回响") || type.includes("回响")) return "回响";
    if (name.includes("信标") || type.includes("信标")) return "信标";
    if (name.includes("探针") || type.includes("探针")) return "探针";
    if (name.includes("罗盘") || name.includes("指南针") || type.includes("罗盘")) return "罗盘";
    return "材料";
  };

  const handleCreateFromTemplate = useCallback(async (template: StrategyTemplate) => {
    try {
      const result = await cmd.createStrategyDetail({
        name: template.name,
        label: template.label,
        difficulty: template.difficulty,
        output_value: template.output_value,
        defense_value: template.defense_value,
        remark: template.remark,
        image_url: null,
      });
      const strategyId = result;
      for (const cost of template.costs) {
        await cmd.addStrategyCost({
          strategy_id: strategyId,
          cost_type: cost.cost_type,
          item_id: cost.item_keyword,
          item_name: null,
          count: cost.default_count,
          is_realtime: cost.is_realtime,
        });
      }
      for (const output of template.outputs) {
        await cmd.addStrategyOutput({
          strategy_id: strategyId,
          item_name: output.item_keyword,
          item_type: output.item_type,
          count: output.default_count,
          estimated_value: 0,
          remark: null,
        });
      }
      toast.success(`已从模板 "${template.name}" 创建策略`);
      setActiveTab("strategies");
      loadStrategies();
    } catch (e) {
      toast.error(`从模板创建失败: ${e}`);
    }
  }, [loadStrategies]);

  const handleItemSelect = useCallback((item: ItemData) => {
    if (showCostDialog) {
      setCostForm(prev => ({
        ...prev,
        item_id: item.item_id,
        item_name: item.name,
        cost_type: guessCostType(item.name, item.item_type),
      }));
      setItemSearchResults([]);
    } else if (showOutputDialog) {
      setOutputForm(prev => ({
        ...prev,
        item_name: item.name,
        item_type: item.item_type,
      }));
      setItemSearchResults([]);
    }
  }, [showCostDialog, showOutputDialog]);

  const getLabelColor = useCallback((label: string) => {
    switch (label) {
      case "K7": return "bg-[rgba(34,197,94,0.15)] text-[var(--color-success)]";
      case "K8-1": return "bg-[rgba(255,184,0,0.15)] text-[var(--color-brand-gold)]";
      case "K8-2": return "bg-[rgba(239,68,68,0.15)] text-[var(--color-danger)]";
      case "U8": return "bg-[rgba(167,139,250,0.15)] text-[var(--color-ai)]";
      case "深空": return "bg-[rgba(255,106,0,0.15)] text-[var(--color-brand)]";
      case "九红深空": return "bg-[rgba(255,184,0,0.12)] text-[var(--color-brand-gold)]";
      default: return "bg-[var(--color-panel)] text-[var(--color-text-muted)]";
    }
  }, []);

  const getProfitColor = useCallback((ratio: number) => {
    if (ratio > 0) return "text-[var(--color-danger)]";
    if (ratio < 0) return "text-[var(--color-success)]";
    return "text-[var(--color-text-muted)]";
  }, []);

  const getRecommendationLevelColor = useCallback((level: StrategyRecommendation["level"]) => {
    switch (level) {
      case "strong": return "bg-[rgba(34,197,94,0.12)] text-[var(--color-success)] border-[rgba(34,197,94,0.25)]";
      case "good": return "bg-[var(--color-brand)]/15 text-[var(--color-brand)] border-[var(--color-brand)]/30";
      case "watch": return "bg-[rgba(255,184,0,0.12)] text-[var(--color-brand-gold)] border-[rgba(255,184,0,0.25)]";
      case "avoid": return "bg-[rgba(239,68,68,0.12)] text-[var(--color-danger)] border-[rgba(239,68,68,0.25)]";
    }
  }, []);

  const getRecommendationLevelText = useCallback((level: StrategyRecommendation["level"]) => {
    switch (level) {
      case "strong": return "强烈推荐";
      case "good": return "可跑";
      case "watch": return "观望";
      case "avoid": return "不建议";
    }
  }, []);

  const getRiskColor = useCallback((risk: StrategyRecommendation["risk_level"]) => {
    switch (risk) {
      case "low": return "text-[var(--color-success)] bg-[rgba(34,197,94,0.1)]";
      case "medium": return "text-[var(--color-brand-gold)] bg-[rgba(255,184,0,0.1)]";
      case "high": return "text-[var(--color-danger)] bg-[rgba(239,68,68,0.1)]";
    }
  }, []);

  const strategyMap = useMemo(() => new Map(strategies.map(s => [s.id, s])), [strategies]);

  const calculateRecommendations = useMemo(() => calculateRecommendationsImpl(strategies), [strategies]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--color-text-subtle)]">加载中...</div>
      </div>
    );
  }

  return (
    <PageShell size="xl" className="space-y-5">
      <PageHeader
        title="策略管理"
        description="管理游戏策略、成本和产出数据"
        iconAsset="strategies"
        actions={
          activeTab === "strategies" && (
            <ToolbarActions>
              <Button variant="default" size="sm" onClick={() => { resetForm(); setShowCreateDialog(true); }}>
                <Plus className="w-4 h-4 mr-1.5" />
                新建策略
              </Button>
            </ToolbarActions>
          )
        }
      />

      <Surface padding="none">
        <button
          onClick={() => setActiveTab("strategies")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "strategies"
              ? "border-[var(--color-brand)] text-[var(--color-brand)]"
              : "border-transparent text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
          }`}
        >
          我的策略
        </button>
        <button
          onClick={() => setActiveTab("templates")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "templates"
              ? "border-[var(--color-brand)] text-[var(--color-brand)]"
              : "border-transparent text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
          }`}
        >
          模板库
        </button>
        <button
          onClick={() => setActiveTab("recommendations")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "recommendations"
              ? "border-[var(--color-brand)] text-[var(--color-brand)]"
              : "border-transparent text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
          }`}
        >
          推荐榜
        </button>
      </Surface>

      {activeTab === "templates" && (
        <StrategyTemplateLibrary
          getLabelColor={getLabelColor}
          onCreateFromTemplate={handleCreateFromTemplate}
        />
      )}

      {activeTab === "recommendations" && (
        <StrategyRecommendations
          strategies={strategies}
          recommendations={calculateRecommendations}
          strategyMap={strategyMap}
          getRecommendationLevelColor={getRecommendationLevelColor}
          getRecommendationLevelText={getRecommendationLevelText}
          getRiskColor={getRiskColor}
          onPreviewImage={(url) => setPreviewImage(url)}
        />
      )}

      {activeTab === "strategies" && (
        <>
          {strategies.length === 0 ? (
            <div className="bg-[var(--color-panel)] rounded-lg border border-[var(--color-border)] py-16 text-center">
              <Target className="w-16 h-16 text-[var(--color-text-subtle)] mx-auto mb-4" />
              <div className="text-sm text-[var(--color-text-subtle)] mb-2">暂无策略</div>
              <div className="text-xs text-[var(--color-text-subtle)]">点击右上角"新建策略"开始分析</div>
            </div>
          ) : (
        <div className="space-y-2">
          {strategies.map((strategy) => {
            const isExpanded = expandedIds.has(strategy.id);
            return (
              <div key={strategy.id} className="bg-[var(--color-panel)] rounded-lg border border-[var(--color-border)] overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-[var(--color-panel-soft)] transition-colors"
                  onClick={() => toggleExpand(strategy.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-[var(--color-text-subtle)]" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-[var(--color-text-subtle)]" />
                      )}
                      <div className="text-lg font-semibold text-[var(--color-text)]">{strategy.name}</div>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getLabelColor(strategy.label)}`}>
                        {strategy.label}
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-[var(--color-panel)] text-[var(--color-text-muted)] rounded-full">
                        {strategy.difficulty}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-[var(--color-text-subtle)]" />
                        <span className={`font-medium ${getProfitColor(strategy.profit_ratio)}`}>
                          {strategy.profit_ratio >= 0 ? "+" : ""}{strategy.profit_ratio.toFixed(1)}%
                        </span>
                      </div>
                      <div className={`flex items-center gap-1 text-sm font-medium ${getProfitColor(strategy.profit_ratio)}`}>
                        {strategy.profit_ratio >= 0 ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        <span>
                          {strategy.total_output_value - strategy.total_cost_fire >= 0 ? "+" : ""}
                          {(strategy.total_output_value - strategy.total_cost_fire).toFixed(0)} 火
                        </span>
                      </div>
                    </div>
                  </div>
                  {strategy.remark && (
                    <div className="mt-2 text-sm text-[var(--color-text-subtle)] ml-7">{strategy.remark}</div>
                  )}
                  <div className="mt-2 flex items-center gap-6 ml-7 text-xs text-[var(--color-text-subtle)]">
                    <span>成本: <span className="text-[var(--color-danger)]">{strategy.total_cost_fire.toFixed(0)} 火</span></span>
                    <span>产出: <span className="text-[var(--color-success)]">{strategy.total_output_value.toFixed(0)} 火</span></span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-[var(--color-border-soft)]">
                    <div className="p-4 grid grid-cols-2 gap-6">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium text-[var(--color-text)] flex items-center gap-1.5">
                            <Zap className="w-4 h-4 text-[var(--color-danger)]" />
                            成本消耗
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); openCostDialog(strategy.id); }}
                            className="text-xs text-[var(--color-brand)] hover:text-[var(--color-brand)] flex items-center gap-0.5"
                          >
                            <Plus className="w-3 h-3" /> 添加
                          </button>
                        </div>
                        {strategy.costs.length === 0 ? (
                          <div className="text-sm text-[var(--color-text-subtle)] py-4 text-center border border-dashed border-[var(--color-border)] rounded-lg">
                            暂无成本
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {strategy.costs.map((cost) => (
                              <div key={cost.id} className="flex items-center justify-between p-2 bg-[var(--color-panel-soft)] rounded-lg text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="px-1.5 py-0.5 bg-[rgba(239,68,68,0.1)] text-[var(--color-danger)] text-xs rounded">
                                    {cost.cost_type}
                                  </span>
                                  <span className="text-[var(--color-text)]">{cost.item_name || cost.item_id}</span>
                                  <span className="text-[var(--color-text-subtle)]">×{cost.count}</span>
                                  {cost.is_realtime && (
                                    <span className="px-1 py-0.5 bg-[var(--color-success)]/20 text-[var(--color-success)] text-xs rounded">
                                      实时
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[var(--color-text-muted)]">
                                    {cost.total_fire.toFixed(1)} 火
                                  </span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteCost(cost.id); }}
                                    className="p-1 text-[var(--color-text-subtle)] hover:text-[var(--color-danger)]"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium text-[var(--color-text)] flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4 text-[var(--color-success)]" />
                            产出收益
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); openOutputDialog(strategy.id); }}
                            className="text-xs text-[var(--color-brand)] hover:text-[var(--color-brand)] flex items-center gap-0.5"
                          >
                            <Plus className="w-3 h-3" /> 添加
                          </button>
                        </div>
                        {strategy.outputs.length === 0 ? (
                          <div className="text-sm text-[var(--color-text-subtle)] py-4 text-center border border-dashed border-[var(--color-border)] rounded-lg">
                            暂无产出
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {strategy.outputs.map((output) => (
                              <div key={output.id} className="flex items-center justify-between p-2 bg-[var(--color-panel-soft)] rounded-lg text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="text-[var(--color-text)]">{output.item_name}</span>
                                  <span className="px-1 py-0.5 bg-[var(--color-panel)] text-[var(--color-text-muted)] text-xs rounded">
                                    {output.item_type}
                                  </span>
                                  <span className="text-[var(--color-text-subtle)]">×{output.count}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[var(--color-text-muted)]">
                                    {(output.realtime_value * output.count).toFixed(0)} 火
                                  </span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteOutput(output.id); }}
                                    className="p-1 text-[var(--color-text-subtle)] hover:text-[var(--color-danger)]"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {strategy.image_url && (
                      <div className="px-4 py-3 border-t border-[var(--color-border-soft)]">
                        <div className="text-xs text-[var(--color-text-subtle)] mb-2 flex items-center gap-1">
                          <Image className="w-3 h-3" />
                          加点图片
                        </div>
                        <img
                          src={strategy.image_url}
                          alt="加点图"
                          className="max-h-32 rounded-lg border border-[var(--color-border)] cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(strategy.image_url);
                          }}
                        />
                      </div>
                    )}

                    <div className="px-4 py-3 bg-[var(--color-panel-soft)] border-t border-[var(--color-border-soft)] flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-1.5 text-sm">
                          <Layers className="w-4 h-4 text-[var(--color-text-subtle)]" />
                          <span className="text-[var(--color-text-subtle)]">输出值:</span>
                          <span className="font-medium text-[var(--color-text)]">{strategy.output_value.toFixed(0)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm">
                          <Shield className="w-4 h-4 text-[var(--color-text-subtle)]" />
                          <span className="text-[var(--color-text-subtle)]">防御值:</span>
                          <span className="font-medium text-[var(--color-text)]">{strategy.defense_value.toFixed(0)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRefreshPrices(strategy.id); }}
                          disabled={refreshing === strategy.id}
                          className="p-1.5 text-[var(--color-text-subtle)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand)]/10 rounded-lg transition-colors disabled:opacity-50"
                          title="刷新火价"
                        >
                          <RefreshCw className={`w-4 h-4 ${refreshing === strategy.id ? "animate-spin" : ""}`} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEdit(strategy); }}
                          className="p-1.5 text-[var(--color-text-subtle)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand)]/10 rounded-lg transition-colors"
                          title="编辑策略"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(strategy.id); }}
                          className="p-1.5 text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] hover:bg-[rgba(239,68,68,0.1)] rounded-lg transition-colors"
                          title="删除策略"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <StrategyFormDialog
        mode="create"
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        form={editForm}
        onFormChange={setEditForm}
        onSubmit={handleCreate}
      />

      <StrategyFormDialog
        mode="edit"
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        form={editForm}
        onFormChange={setEditForm}
        onSubmit={handleUpdate}
      />

      <StrategyItemAddDialog
        mode="cost"
        open={!!showCostDialog}
        onClose={() => { setShowCostDialog(null); setItemSearchResults([]); }}
        onSubmit={handleAddCost}
        costForm={costForm}
        setCostForm={setCostForm}
        outputForm={outputForm}
        setOutputForm={setOutputForm}
        itemSearchResults={itemSearchResults}
        onSearch={searchItems}
        onItemSelect={handleItemSelect}
      />

      <StrategyItemAddDialog
        mode="output"
        open={!!showOutputDialog}
        onClose={() => { setShowOutputDialog(null); setItemSearchResults([]); }}
        onSubmit={handleAddOutput}
        costForm={costForm}
        setCostForm={setCostForm}
        outputForm={outputForm}
        setOutputForm={setOutputForm}
        itemSearchResults={itemSearchResults}
        onSearch={searchItems}
        onItemSelect={handleItemSelect}
      />

        </>
      )}

      <ImagePreviewDialog
        image={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </PageShell>
  );
}
