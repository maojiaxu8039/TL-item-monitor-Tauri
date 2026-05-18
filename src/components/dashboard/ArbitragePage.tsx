import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Calculator,
  Plus,
  Trash2,
  Edit3,
  X,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Layers,
  ToggleLeft,
  ToggleRight,
  ArrowRightLeft,
  Package,
  Coins,
} from "lucide-react";
import { cmd, ArbitrageRecipe, ArbitrageCalculationResult, ItemSearchResult, CreateRecipeRequest, CreateIngredientRequest, CreateOutputRequest } from "@/lib/commands";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { MetricCard } from "@/components/ui/MetricCard";
import { Toolbar, ToolbarActions } from "@/components/ui/Toolbar";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";

const RECIPE_TYPES = [
  { value: "decompose", label: "分解" },
  { value: "synthesize", label: "合成" },
  { value: "exchange", label: "兑换" },
];

function formatPrice(price: number): string {
  return price.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatProfitMargin(margin: number): string {
  const sign = margin >= 0 ? "+" : "";
  return `${sign}${margin.toFixed(1)}%`;
}

function getRecipeTypeStyle(type: string) {
  switch (type) {
    case "decompose": return { badge: "bg-[rgba(239,68,68,0.12)] text-[var(--color-danger)] border-[rgba(239,68,68,0.2)]", icon: "text-[var(--color-danger)]" };
    case "synthesize": return { badge: "bg-[rgba(34,197,94,0.12)] text-[var(--color-success)] border-[rgba(34,197,94,0.2)]", icon: "text-[var(--color-success)]" };
    case "exchange": return { badge: "bg-[rgba(255,184,0,0.12)] text-[var(--color-brand-gold)] border-[rgba(255,184,0,0.2)]", icon: "text-[var(--color-brand-gold)]" };
    default: return { badge: "bg-[var(--color-panel-soft)] text-[var(--color-text-muted)]", icon: "text-[var(--color-text-muted)]" };
  }
}

export default function ArbitragePage() {
  const { marketContext, marketContextReady } = useSectionRefresh();
  const [recipes, setRecipes] = useState<ArbitrageRecipe[]>([]);
  const [calculationResult, setCalculationResult] = useState<ArbitrageCalculationResult[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState<ArbitrageRecipe | null>(null);
  const [showIngredientDialog, setShowIngredientDialog] = useState<ArbitrageRecipe | null>(null);
  const [showOutputDialog, setShowOutputDialog] = useState<ArbitrageRecipe | null>(null);
  const [refreshingPrice, setRefreshingPrice] = useState(false);
  const [lastCalculatedAt, setLastCalculatedAt] = useState<number | null>(null);
  const [showAllRecipes, setShowAllRecipes] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [contextKey, setContextKey] = useState(`${marketContext.seasonId}-${marketContext.marketMode}`);

  const [newRecipe, setNewRecipe] = useState({
    name: "",
    recipe_type: "decompose",
    enabled: true,
    ingredients: [] as CreateIngredientRequest[],
    outputs: [] as CreateOutputRequest[],
  });

  const [editRecipe, setEditRecipe] = useState({
    name: "",
    recipe_type: "decompose",
    enabled: true,
  });

  const [ingredientSearch, setIngredientSearch] = useState("");
  const [ingredientResults, setIngredientResults] = useState<ItemSearchResult[]>([]);
  const [ingredientDraft, setIngredientDraft] = useState<CreateIngredientRequest>({ item_name: "", count: 1 });

  const [outputSearch, setOutputSearch] = useState("");
  const [outputResults, setOutputResults] = useState<ItemSearchResult[]>([]);
  const [outputDraft, setOutputDraft] = useState<CreateOutputRequest>({ item_name: "", count: 1 });

  const [editIngredients, setEditIngredients] = useState<CreateIngredientRequest[]>([]);
  const [editOutputs, setEditOutputs] = useState<CreateOutputRequest[]>([]);

  const totalProfitable = useMemo(() => calculationResult.filter(r => r.is_profitable).length, [calculationResult]);
  const totalLoss = useMemo(() => calculationResult.filter(r => !r.is_profitable).length, [calculationResult]);

  // Color mapping per design spec: red = positive/fire/up, green = negative/down/save
  const profitColor = "var(--color-danger)";
  const lossColor = "var(--color-success)";
  const profitBg = "rgba(239,68,68,0.12)";
  const lossBg = "rgba(34,197,94,0.12)";
  const profitBorder = "rgba(239,68,68,0.2)";
  const lossBorder = "rgba(34,197,94,0.2)";

  const filteredResults = useMemo(() => {
    if (typeFilter === "all") return calculationResult;
    return calculationResult.filter(r => r.recipe_type === typeFilter);
  }, [calculationResult, typeFilter]);

  const loadRecipes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cmd.getArbitrageRecipes();
      setRecipes(data);
    } catch (err) {
      console.error("[Arbitrage] loadRecipes error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const calculateAll = useCallback(async (forceShowAll?: boolean) => {
    setCalculating(true);
    try {
      const result = await cmd.calculateArbitrage(undefined, undefined, forceShowAll ?? showAllRecipes);
      setCalculationResult(result.recipes);
      setLastCalculatedAt(result.calculated_at);
      if (result.total_profitable > 0 && result.total_loss > 0) {
        toast.success(`计算出 ${result.total_profitable} 个盈利 + ${result.total_loss} 个亏损配方`);
      } else if (result.total_profitable > 0) {
        toast.success(`计算出 ${result.total_profitable} 个可套利配方`);
      } else if (result.total_loss > 0) {
        toast.warning(`全部 ${result.total_loss} 个配方亏损`);
      } else {
        toast.warning("暂无套利数据");
      }
    } catch (err) {
      console.error("[Arbitrage] calculateAll error:", err);
    } finally {
      setCalculating(false);
    }
  }, [showAllRecipes]);

  // 当赛季/模式切换时，重新计算套利
  useEffect(() => {
    if (!marketContextReady) return;
    const newKey = `${marketContext.seasonId}-${marketContext.marketMode}`;
    if (newKey !== contextKey) {
      setContextKey(newKey);
      calculateAll();
    }
  }, [marketContext.seasonId, marketContext.marketMode, marketContextReady, contextKey, calculateAll]);

  const refreshPrices = async () => {
    setRefreshingPrice(true);
    try {
      await calculateAll();
      toast.success("价格已刷新");
    } catch (err) {
      toast.error(`刷新失败: ${err}`);
    } finally {
      setRefreshingPrice(false);
    }
  };

  const toggleShowAll = () => {
    const newShowAll = !showAllRecipes;
    setShowAllRecipes(newShowAll);
    calculateAll(newShowAll);
  };

  const createRecipe = async () => {
    if (!newRecipe.name.trim()) {
      toast.error("请输入配方名称");
      return;
    }
    if (newRecipe.ingredients.length === 0) {
      toast.error("请添加至少一个原料");
      return;
    }
    if (newRecipe.outputs.length === 0) {
      toast.error("请添加至少一个产物");
      return;
    }
    try {
      const request: CreateRecipeRequest = {
        name: newRecipe.name,
        recipe_type: newRecipe.recipe_type,
        enabled: newRecipe.enabled,
        ingredients: newRecipe.ingredients,
        outputs: newRecipe.outputs,
      };
      await cmd.createArbitrageRecipe(request);
      await loadRecipes();
      await calculateAll();
      setShowCreateDialog(false);
      setNewRecipe({ name: "", recipe_type: "decompose", enabled: true, ingredients: [], outputs: [] });
      toast.success("配方创建成功");
    } catch (err) {
      toast.error(`创建失败: ${err}`);
    }
  };

  const deleteRecipe = async (recipeId: string) => {
    try {
      await cmd.deleteArbitrageRecipe(recipeId);
      toast.success("配方已删除");
      await loadRecipes();
      await calculateAll();
    } catch (err) {
      toast.error(`删除失败: ${err}`);
    }
  };

  const toggleRecipeEnabled = async (recipe: ArbitrageRecipe) => {
    try {
      await cmd.toggleArbitrageRecipeEnabled(recipe.id, recipe.enabled === 0);
      await loadRecipes();
      await calculateAll();
    } catch (err) {
      toast.error(`切换状态失败: ${err}`);
    }
  };

  const updateRecipeInfo = async () => {
    if (!showEditDialog) return;
    try {
      await cmd.updateArbitrageRecipe(showEditDialog.id, {
        name: editRecipe.name,
        recipe_type: editRecipe.recipe_type,
        enabled: editRecipe.enabled,
      });
      await cmd.updateArbitrageIngredients(showEditDialog.id, { ingredients: editIngredients });
      await cmd.updateArbitrageOutputs(showEditDialog.id, { outputs: editOutputs });
      toast.success("配方已更新");
      setShowEditDialog(null);
      await loadRecipes();
      await calculateAll();
    } catch (err) {
      toast.error(`更新失败: ${err}`);
    }
  };

  const loadRecipeDetails = async (recipeId: string) => {
    try {
      return await cmd.getArbitrageRecipeDetail(recipeId);
    } catch {
      return null;
    }
  };

  const openEditIngredients = async (recipe: ArbitrageRecipe) => {
    const details = await loadRecipeDetails(recipe.id);
    if (details) {
      setEditIngredients(details.ingredients.map(i => ({
        item_name: i.item_name,
        count: i.count,
      })));
      setShowIngredientDialog(recipe);
    }
  };

  const openEditOutputs = async (recipe: ArbitrageRecipe) => {
    const details = await loadRecipeDetails(recipe.id);
    if (details) {
      setEditOutputs(details.outputs.map(o => ({
        item_name: o.item_name,
        count: o.count,
      })));
      setShowOutputDialog(recipe);
    }
  };

  const openEditDialog = async (recipe: ArbitrageRecipe) => {
    const details = await loadRecipeDetails(recipe.id);
    if (details) {
      setEditIngredients(details.ingredients.map(i => ({
        item_name: i.item_name,
        count: i.count,
      })));
      setEditOutputs(details.outputs.map(o => ({
        item_name: o.item_name,
        count: o.count,
      })));
    } else {
      setEditIngredients([]);
      setEditOutputs([]);
    }
    setEditRecipe({
      name: recipe.name,
      recipe_type: recipe.recipe_type,
      enabled: recipe.enabled === 1,
    });
    setShowEditDialog(recipe);
  };

  const saveIngredients = async () => {
    if (!showIngredientDialog) return;
    try {
      await cmd.updateArbitrageIngredients(showIngredientDialog.id, { ingredients: editIngredients });
      toast.success("原料已更新");
      setShowIngredientDialog(null);
      await calculateAll();
    } catch (err) {
      toast.error(`更新失败: ${err}`);
    }
  };

  const saveOutputs = async () => {
    if (!showOutputDialog) return;
    try {
      await cmd.updateArbitrageOutputs(showOutputDialog.id, { outputs: editOutputs });
      toast.success("产物已更新");
      setShowOutputDialog(null);
      await calculateAll();
    } catch (err) {
      toast.error(`更新失败: ${err}`);
    }
  };

  const searchIngredients = async (keyword: string) => {
    setIngredientSearch(keyword);
    if (keyword.length < 1) {
      setIngredientResults([]);
      return;
    }
    try {
      const results = await cmd.searchItemsForArbitrage(keyword);
      setIngredientResults(results);
    } catch (err) {
      console.error("[Arbitrage] Search ingredients error:", err);
      setIngredientResults([]);
    }
  };

  const searchOutputs = async (keyword: string) => {
    setOutputSearch(keyword);
    if (keyword.length < 1) {
      setOutputResults([]);
      return;
    }
    try {
      const results = await cmd.searchItemsForArbitrage(keyword);
      setOutputResults(results);
    } catch (err) {
      console.error("[Arbitrage] Search outputs error:", err);
      setOutputResults([]);
    }
  };

  const addIngredientFromDraft = () => {
    if (!ingredientDraft.item_name || ingredientDraft.count <= 0) {
      toast.error("请选择物品并设置数量");
      return;
    }
    if (newRecipe.ingredients.some(i => i.item_name === ingredientDraft.item_name)) {
      toast.error("该物品已在原料列表中");
      return;
    }
    setNewRecipe(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { ...ingredientDraft }],
    }));
    setIngredientDraft({ item_name: "", count: 1 });
    setIngredientSearch("");
    setIngredientResults([]);
  };

  const addOutputFromDraft = () => {
    if (!outputDraft.item_name || outputDraft.count <= 0) {
      toast.error("请选择物品并设置数量");
      return;
    }
    if (newRecipe.outputs.some(o => o.item_name === outputDraft.item_name)) {
      toast.error("该物品已在产物列表中");
      return;
    }
    setNewRecipe(prev => ({
      ...prev,
      outputs: [...prev.outputs, { ...outputDraft }],
    }));
    setOutputDraft({ item_name: "", count: 1 });
    setOutputSearch("");
    setOutputResults([]);
  };

  const removeNewIngredient = (itemName: string) => {
    setNewRecipe(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter(i => i.item_name !== itemName),
    }));
  };

  const removeNewOutput = (itemName: string) => {
    setNewRecipe(prev => ({
      ...prev,
      outputs: prev.outputs.filter(o => o.item_name !== itemName),
    }));
  };

  const addEditIngredient = (item: ItemSearchResult) => {
    if (editIngredients.some(i => i.item_name === item.name)) {
      toast.error("该物品已在列表中");
      return;
    }
    setEditIngredients(prev => [...prev, { item_name: item.name, count: 1 }]);
    setIngredientSearch("");
    setIngredientResults([]);
  };

  const addEditOutput = (item: ItemSearchResult) => {
    if (editOutputs.some(o => o.item_name === item.name)) {
      toast.error("该物品已在列表中");
      return;
    }
    setEditOutputs(prev => [...prev, { item_name: item.name, count: 1 }]);
    setOutputSearch("");
    setOutputResults([]);
  };

  const removeEditIngredient = (itemName: string) => {
    setEditIngredients(prev => prev.filter(i => i.item_name !== itemName));
  };

  const removeEditOutput = (itemName: string) => {
    setEditOutputs(prev => prev.filter(o => o.item_name !== itemName));
  };

  const updateEditIngredientCount = (itemName: string, count: number) => {
    setEditIngredients(prev => prev.map(i => i.item_name === itemName ? { ...i, count } : i));
  };

  const updateEditOutputCount = (itemName: string, count: number) => {
    setEditOutputs(prev => prev.map(o => o.item_name === itemName ? { ...o, count } : o));
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getRecipeTypeLabel = (type: string) => {
    return RECIPE_TYPES.find(t => t.value === type)?.label || type;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  useEffect(() => {
    if (!marketContextReady) return;
    loadRecipes().then(() => calculateAll());
  }, [marketContextReady, loadRecipes, calculateAll]);

  return (
    <PageShell size="xl" className="space-y-5">
      <PageHeader
        title="套利比价"
        description="分解、合成、材料兑换 全场景比价分析"
        iconAsset="arbitrage"
        actions={
          <ToolbarActions>
            <Button variant="outline" size="sm" onClick={refreshPrices} disabled={refreshingPrice || calculating}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshingPrice || calculating ? "animate-spin" : ""}`} />
              刷新价格
            </Button>
            <Button variant="outline" size="sm" onClick={toggleShowAll} disabled={calculating}>
              <ArrowRightLeft className="w-4 h-4 mr-1.5" />
              {showAllRecipes ? "只看盈利" : "显示全部"}
            </Button>
            <Button variant="default" size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              新增配方
            </Button>
          </ToolbarActions>
        }
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          label="可套利配方"
          value={totalProfitable}
          icon={TrendingUp}
          iconBg="bg-[rgba(239,68,68,0.1)]"
          iconColor="text-[var(--color-danger)]"
          helper={<span className="text-xs text-[var(--color-danger)]">个盈利</span>}
          className="border-[rgba(239,68,68,0.2)]"
        />
        <MetricCard
          label="亏损配方"
          value={totalLoss}
          icon={TrendingDown}
          iconBg="bg-[rgba(34,197,94,0.1)]"
          iconColor="text-[var(--color-success)]"
          helper={<span className="text-xs text-[var(--color-success)]">个亏损</span>}
          className="border-[rgba(34,197,94,0.2)]"
        />
        <MetricCard
          label="配方总数"
          value={recipes.length}
          icon={Layers}
          iconBg="bg-[rgba(255,184,0,0.08)]"
          iconColor="text-[var(--color-brand-gold)]"
          helper={<span className="text-xs text-[var(--color-brand-gold)]">个</span>}
          className="border-[rgba(255,184,0,0.2)]"
        />
      </div>

      {/* Results List */}
      <Surface padding="none">
        <div className="px-4 py-3 border-b border-[var(--color-border-soft)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-[var(--color-text)]">套利结果</span>
            <div className="flex items-center gap-1 bg-[var(--color-panel-soft)] rounded-lg p-1">
              {["all", "decompose", "synthesize", "exchange"].map(type => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    typeFilter === type
                      ? "bg-[var(--color-brand)]/20 text-[var(--color-brand)] font-medium border border-[var(--color-brand)]/30"
                      : "text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {type === "all" ? "全部" : getRecipeTypeLabel(type)}
                </button>
              ))}
            </div>
          </div>
          {lastCalculatedAt && (
            <span className="text-xs text-[var(--color-text-subtle)]">
              计算时间: {formatTime(lastCalculatedAt)}
            </span>
          )}
        </div>
        <div className="divide-y divide-[var(--color-border-soft)]">
          {filteredResults.length === 0 ? (
            <div className="px-4 py-8 text-center">
              {loading ? (
                <div className="text-sm text-[var(--color-text-subtle)]">加载中...</div>
              ) : (
                <EmptyState
                  title="暂无套利数据"
                  description="点击刷新价格获取最新结果"
                  icon={Calculator}
                />
              )}
            </div>
          ) : (
            filteredResults.map(result => {
              const isExpanded = expandedIds.has(result.recipe_id);
              const typeStyle = getRecipeTypeStyle(result.recipe_type);
              return (
              <div
                key={result.recipe_id}
                className="px-4 py-3 hover:bg-[rgba(255,184,0,0.04)] transition-colors cursor-pointer group"
                onClick={() => toggleExpanded(result.recipe_id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleExpanded(result.recipe_id); }}
                      className="p-1 rounded-lg hover:bg-[var(--color-panel-soft)] transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-[var(--color-text-subtle)]" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-[var(--color-text-subtle)]" />
                      )}
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--color-text)]">{result.recipe_name}</span>
                      <span className={`px-2 py-0.5 text-xs rounded border ${typeStyle.badge}`}>
                        {getRecipeTypeLabel(result.recipe_type)}
                      </span>
                      {result.used_lowest_price && (
                        <StatusBadge variant="warning">最低价</StatusBadge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        <span className="text-[var(--color-text-muted)]">利润: </span>
                        <span className={result.is_profitable ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}>
                          {result.is_profitable ? "+" : ""}{formatPrice(result.profit)} 火
                        </span>
                      </div>
                      <div className="text-xs">
                        <span className="text-[var(--color-text-subtle)]">利润率: </span>
                        <span className={result.is_profitable ? "text-[var(--color-brand-gold)]" : "text-[var(--color-success)]"}>
                          {formatProfitMargin(result.profit_margin)}
                        </span>
                      </div>
                    </div>
                    <div className={`p-1.5 rounded-lg ${result.is_profitable ? "bg-[rgba(239,68,68,0.12)]" : "bg-[rgba(34,197,94,0.12)]"}`}>
                      {result.is_profitable ? (
                        <TrendingUp className="h-4 w-4 text-[var(--color-danger)]" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-[var(--color-success)]" />
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const recipe = recipes.find(r => r.id === result.recipe_id);
                          if (recipe) openEditDialog(recipe);
                        }}
                        className="p-1.5 rounded-lg hover:bg-[var(--color-panel-soft)] transition-colors text-[var(--color-text-subtle)] hover:text-[var(--color-brand-gold)]"
                        title="编辑配方"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteRecipe(result.recipe_id); }}
                        className="p-1.5 rounded-lg hover:bg-[rgba(239,68,68,0.1)] transition-colors text-[var(--color-text-subtle)] hover:text-[var(--color-danger)]"
                        title="删除配方"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pl-8 space-y-3" onClick={(e) => e.stopPropagation()}>
                    <div className="grid grid-cols-2 gap-4">
                      <Surface padding="sm" className="bg-[var(--color-panel-soft)] border-[var(--color-border)]">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-subtle)] mb-2">
                          <Package className="w-3.5 h-3.5 text-[var(--color-danger)]" />
                          原料成本
                        </div>
                        <div className="space-y-1">
                          {result.ingredients_detail.map(ing => (
                            <div key={ing.item_name} className="flex items-center justify-between text-sm">
                              <span className="text-[var(--color-text-muted)]">{ing.item_name} × {ing.count}</span>
                              <span className="text-[var(--color-text)] font-medium">{formatPrice(ing.unit_price)} × {ing.count} = {formatPrice(ing.total_cost)}</span>
                            </div>
                          ))}
                          <div className="pt-1.5 border-t border-[var(--color-border)] flex items-center justify-between font-medium">
                            <span className="text-[var(--color-text-muted)] text-sm">总成本</span>
                            <span className="text-[var(--color-danger)] text-sm">{formatPrice(result.total_cost)} 火</span>
                          </div>
                        </div>
                      </Surface>
                      <Surface padding="sm" className="bg-[var(--color-panel-soft)] border-[var(--color-border)]">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-subtle)] mb-2">
                          <Coins className="w-3.5 h-3.5 text-[var(--color-success)]" />
                          产物收入（12.5%手续费后）
                        </div>
                        <div className="space-y-1">
                          {result.outputs_detail.map(out => (
                            <div key={out.item_name} className="flex items-center justify-between text-sm">
                              <span className="text-[var(--color-text-muted)]">{out.item_name} × {out.count}</span>
                              <span className="text-[var(--color-text)] font-medium">{formatPrice(out.unit_price)} × {out.count} = {formatPrice(out.after_tax_value)}</span>
                            </div>
                          ))}
                          <div className="pt-1.5 border-t border-[var(--color-border)] flex items-center justify-between font-medium">
                            <span className="text-[var(--color-text-muted)] text-sm">税后总收入</span>
                            <span className="text-[var(--color-success)] text-sm">{formatPrice(result.total_output_value)} 火</span>
                          </div>
                        </div>
                      </Surface>
                    </div>
                  </div>
                )}
              </div>
            );
            })
          )}
        </div>
      </Surface>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <div className="bg-[var(--color-panel)] rounded-xl shadow-xl w-full max-w-lg mx-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-soft)]">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">新增套利配方</h3>
            <button onClick={() => setShowCreateDialog(false)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] transition-colors">✕</button>
          </div>
          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">配方名称</label>
              <Input
                value={newRecipe.name}
                onChange={e => setNewRecipe(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如：传说装备分解"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">配方类型</label>
              <Select
                value={newRecipe.recipe_type}
                onChange={e => setNewRecipe(prev => ({ ...prev, recipe_type: e.target.value }))}
              >
                {RECIPE_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </Select>
            </div>

            {/* Ingredients */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-[var(--color-text)]">原料列表</label>
                <button
                  onClick={() => setNewRecipe(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className="flex items-center gap-1 text-sm text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] transition-colors"
                >
                  {newRecipe.enabled ? <ToggleRight className="h-5 w-5 text-[var(--color-success)]" /> : <ToggleLeft className="h-5 w-5" />}
                  启用
                </button>
              </div>
              {newRecipe.ingredients.length > 0 && (
                <div className="mb-2 space-y-1">
                  {newRecipe.ingredients.map(ing => (
                    <div key={ing.item_name} className="flex items-center justify-between px-3 py-2 bg-[var(--color-panel-soft)] rounded-lg text-sm border border-[var(--color-border)]">
                      <span className="text-[var(--color-text)]">{ing.item_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--color-text-subtle)]">× {ing.count}</span>
                        <button onClick={() => removeNewIngredient(ing.item_name)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-subtle)]" />
                  <Input
                    value={ingredientDraft.item_name}
                    onChange={e => {
                      setIngredientDraft(prev => ({ ...prev, item_name: e.target.value }));
                      searchIngredients(e.target.value);
                    }}
                    placeholder="搜索物品..."
                    className="pl-10"
                  />
                </div>
                <Input
                  type="number"
                  value={ingredientDraft.count}
                  onChange={e => setIngredientDraft(prev => ({ ...prev, count: parseInt(e.target.value) || 1 }))}
                  className="w-20 text-center"
                  min="1"
                />
                <Button variant="outline" size="sm" onClick={addIngredientFromDraft}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {ingredientResults.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border-soft)]">
                  {ingredientResults.map(item => (
                    <button
                      type="button"
                      key={item.item_id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIngredientDraft({ item_name: item.name, count: 1 });
                        setIngredientResults([]);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-brand)]/10 transition-colors flex items-center justify-between"
                    >
                      <span className="text-[var(--color-text)]">{item.name}</span>
                      <span className="text-[var(--color-text-subtle)] text-xs">{formatPrice(item.price)} 火</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Outputs */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">产物列表</label>
              {newRecipe.outputs.length > 0 && (
                <div className="mb-2 space-y-1">
                  {newRecipe.outputs.map(out => (
                    <div key={out.item_name} className="flex items-center justify-between px-3 py-2 bg-[var(--color-panel-soft)] rounded-lg text-sm border border-[var(--color-border)]">
                      <span className="text-[var(--color-text)]">{out.item_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--color-text-subtle)]">× {out.count}</span>
                        <button onClick={() => removeNewOutput(out.item_name)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-subtle)]" />
                  <Input
                    value={outputDraft.item_name}
                    onChange={e => {
                      setOutputDraft(prev => ({ ...prev, item_name: e.target.value }));
                      searchOutputs(e.target.value);
                    }}
                    placeholder="搜索产物..."
                    className="pl-10"
                  />
                </div>
                <Input
                  type="number"
                  value={outputDraft.count}
                  onChange={e => setOutputDraft(prev => ({ ...prev, count: parseInt(e.target.value) || 1 }))}
                  className="w-20 text-center"
                  min="1"
                />
                <Button variant="outline" size="sm" onClick={addOutputFromDraft}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {outputResults.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border-soft)]">
                  {outputResults.map(item => (
                    <button
                      type="button"
                      key={item.item_id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOutputDraft({ item_name: item.name, count: 1 });
                        setOutputResults([]);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-brand)]/10 transition-colors flex items-center justify-between"
                    >
                      <span className="text-[var(--color-text)]">{item.name}</span>
                      <span className="text-[var(--color-text-subtle)] text-xs">{formatPrice(item.price)} 火</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border-soft)]">
            <Button variant="ghost" size="sm" onClick={() => setShowCreateDialog(false)}>取消</Button>
            <Button variant="default" size="sm" onClick={createRecipe}>创建配方</Button>
          </div>
        </div>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!showEditDialog} onOpenChange={() => setShowEditDialog(null)}>
        <div className="bg-[var(--color-panel)] rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-soft)] shrink-0">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">编辑配方</h3>
            <button onClick={() => setShowEditDialog(null)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] transition-colors">✕</button>
          </div>
          <div className="p-5 space-y-4 overflow-y-auto">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">配方名称</label>
              <Input
                value={editRecipe.name}
                onChange={e => setEditRecipe(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">配方类型</label>
              <Select
                value={editRecipe.recipe_type}
                onChange={e => setEditRecipe(prev => ({ ...prev, recipe_type: e.target.value }))}
              >
                {RECIPE_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </Select>
            </div>

            {/* Edit Ingredients */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-[var(--color-text)]">原料列表</label>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-subtle)]" />
                    <Input
                      value={ingredientSearch}
                      onChange={e => searchIngredients(e.target.value)}
                      placeholder="搜索添加..."
                      className="pl-8 h-8 text-xs w-36"
                    />
                  </div>
                  <button
                    onClick={() => setEditRecipe(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className="text-xs text-[var(--color-text-subtle)] flex items-center gap-1 hover:text-[var(--color-text-muted)] transition-colors"
                  >
                    {editRecipe.enabled ? <ToggleRight className="h-4 w-4 text-[var(--color-success)]" /> : <ToggleLeft className="h-4 w-4" />}
                    启用
                  </button>
                </div>
              </div>
              {editIngredients.length > 0 ? (
                <div className="space-y-1 mb-2">
                  {editIngredients.map(ing => (
                    <div key={ing.item_name} className="flex items-center gap-2 px-3 py-2 bg-[var(--color-panel-soft)] rounded-lg border border-[var(--color-border)]">
                      <span className="flex-1 text-sm text-[var(--color-text)]">{ing.item_name}</span>
                      <Input
                        type="number"
                        value={ing.count}
                        onChange={e => updateEditIngredientCount(ing.item_name, parseInt(e.target.value) || 1)}
                        className="w-16 h-7 text-xs text-center px-1"
                        min="1"
                      />
                      <button onClick={() => removeEditIngredient(ing.item_name)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-colors p-1">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--color-text-subtle)] mb-2 py-2 text-center border border-dashed border-[var(--color-border)] rounded-lg">暂无原料</div>
              )}
              {ingredientResults.length > 0 && (
                <div className="max-h-32 overflow-y-auto border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border-soft)]">
                  {ingredientResults.map(item => (
                    <button
                      key={item.item_id}
                      onClick={() => addEditIngredient(item)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-brand)]/10 transition-colors flex items-center justify-between"
                    >
                      <span className="text-[var(--color-text)]">{item.name}</span>
                      <span className="text-[var(--color-text-subtle)] text-xs">{formatPrice(item.price)} 火</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Edit Outputs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-[var(--color-text)]">产物列表</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-subtle)]" />
                  <Input
                    value={outputSearch}
                    onChange={e => searchOutputs(e.target.value)}
                    placeholder="搜索添加..."
                    className="pl-8 h-8 text-xs w-36"
                  />
                </div>
              </div>
              {editOutputs.length > 0 ? (
                <div className="space-y-1 mb-2">
                  {editOutputs.map(out => (
                    <div key={out.item_name} className="flex items-center gap-2 px-3 py-2 bg-[var(--color-panel-soft)] rounded-lg border border-[var(--color-border)]">
                      <span className="flex-1 text-sm text-[var(--color-text)]">{out.item_name}</span>
                      <Input
                        type="number"
                        value={out.count}
                        onChange={e => updateEditOutputCount(out.item_name, parseInt(e.target.value) || 1)}
                        className="w-16 h-7 text-xs text-center px-1"
                        min="1"
                      />
                      <button onClick={() => removeEditOutput(out.item_name)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-colors p-1">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--color-text-subtle)] mb-2 py-2 text-center border border-dashed border-[var(--color-border)] rounded-lg">暂无产物</div>
              )}
              {outputResults.length > 0 && (
                <div className="max-h-32 overflow-y-auto border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border-soft)]">
                  {outputResults.map(item => (
                    <button
                      key={item.item_id}
                      onClick={() => addEditOutput(item)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-brand)]/10 transition-colors flex items-center justify-between"
                    >
                      <span className="text-[var(--color-text)]">{item.name}</span>
                      <span className="text-[var(--color-text-subtle)] text-xs">{formatPrice(item.price)} 火</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border-soft)] shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setShowEditDialog(null)}>取消</Button>
            <Button variant="default" size="sm" onClick={updateRecipeInfo}>保存</Button>
          </div>
        </div>
      </Dialog>

      {/* Ingredient Dialog */}
      <Dialog open={!!showIngredientDialog} onOpenChange={() => setShowIngredientDialog(null)}>
        <div className="bg-[var(--color-panel)] rounded-xl shadow-xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-soft)]">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">编辑原料</h3>
            <button onClick={() => setShowIngredientDialog(null)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] transition-colors">✕</button>
          </div>
          <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
            {editIngredients.length > 0 ? (
              <div className="space-y-1.5">
                {editIngredients.map(ing => (
                  <div key={ing.item_name} className="flex items-center gap-2 px-3 py-2 bg-[var(--color-panel-soft)] rounded-lg border border-[var(--color-border)]">
                    <span className="flex-1 text-sm text-[var(--color-text)]">{ing.item_name}</span>
                    <Input
                      type="number"
                      value={ing.count}
                      onChange={e => updateEditIngredientCount(ing.item_name, parseInt(e.target.value) || 1)}
                      className="w-16 h-7 text-xs text-center px-1"
                      min="1"
                    />
                    <button onClick={() => removeEditIngredient(ing.item_name)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-colors p-1">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[var(--color-text-subtle)] py-4 text-center border border-dashed border-[var(--color-border)] rounded-lg">暂无原料</div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-subtle)]" />
              <Input
                value={ingredientSearch}
                onChange={e => searchIngredients(e.target.value)}
                placeholder="搜索添加物品..."
                className="pl-10"
              />
            </div>
            {ingredientResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border-soft)]">
                {ingredientResults.map(item => (
                  <button
                    type="button"
                    key={item.item_id}
                    onClick={(e) => {
                      e.stopPropagation();
                      addEditIngredient(item);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-brand)]/10 transition-colors flex items-center justify-between"
                  >
                    <span className="text-[var(--color-text)]">{item.name}</span>
                    <span className="text-[var(--color-text-subtle)] text-xs">{formatPrice(item.price)} 火</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border-soft)]">
            <Button variant="ghost" size="sm" onClick={() => setShowIngredientDialog(null)}>取消</Button>
            <Button variant="default" size="sm" onClick={saveIngredients}>保存</Button>
          </div>
        </div>
      </Dialog>

      {/* Output Dialog */}
      <Dialog open={!!showOutputDialog} onOpenChange={() => setShowOutputDialog(null)}>
        <div className="bg-[var(--color-panel)] rounded-xl shadow-xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-soft)]">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">编辑产物</h3>
            <button onClick={() => setShowOutputDialog(null)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] transition-colors">✕</button>
          </div>
          <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
            {editOutputs.length > 0 ? (
              <div className="space-y-1.5">
                {editOutputs.map(out => (
                  <div key={out.item_name} className="flex items-center gap-2 px-3 py-2 bg-[var(--color-panel-soft)] rounded-lg border border-[var(--color-border)]">
                    <span className="flex-1 text-sm text-[var(--color-text)]">{out.item_name}</span>
                    <Input
                      type="number"
                      value={out.count}
                      onChange={e => updateEditOutputCount(out.item_name, parseInt(e.target.value) || 1)}
                      className="w-16 h-7 text-xs text-center px-1"
                      min="1"
                    />
                    <button onClick={() => removeEditOutput(out.item_name)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-colors p-1">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[var(--color-text-subtle)] py-4 text-center border border-dashed border-[var(--color-border)] rounded-lg">暂无产物</div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-subtle)]" />
              <Input
                value={outputSearch}
                onChange={e => searchOutputs(e.target.value)}
                placeholder="搜索添加物品..."
                className="pl-10"
              />
            </div>
            {outputResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border-soft)]">
                {outputResults.map(item => (
                  <button
                    type="button"
                    key={item.item_id}
                    onClick={(e) => {
                      e.stopPropagation();
                      addEditOutput(item);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-brand)]/10 transition-colors flex items-center justify-between"
                  >
                    <span className="text-[var(--color-text)]">{item.name}</span>
                    <span className="text-[var(--color-text-subtle)] text-xs">{formatPrice(item.price)} 火</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border-soft)]">
            <Button variant="ghost" size="sm" onClick={() => setShowOutputDialog(null)}>取消</Button>
            <Button variant="default" size="sm" onClick={saveOutputs}>保存</Button>
          </div>
        </div>
      </Dialog>
    </PageShell>
  );
}
