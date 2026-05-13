import { useState, useMemo, useEffect } from "react";
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
} from "lucide-react";
import { cmd, ArbitrageRecipe, ArbitrageCalculationResult, ItemSearchResult, CreateRecipeRequest, CreateIngredientRequest, CreateOutputRequest } from "@/lib/commands";
import { useToast } from "@/hooks/useToast";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { MetricCard } from "@/components/ui/MetricCard";
import { Toolbar, ToolbarActions } from "@/components/ui/Toolbar";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/EmptyState";

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

export default function ArbitragePage() {
  const { addToast } = useToast();
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

  const filteredResults = useMemo(() => {
    if (typeFilter === "all") return calculationResult;
    return calculationResult.filter(r => r.recipe_type === typeFilter);
  }, [calculationResult, typeFilter]);

  const loadRecipes = async () => {
    setLoading(true);
    try {
      const data = await cmd.getArbitrageRecipes();
      setRecipes(data);
    } catch (err) {
      console.error("[Arbitrage] loadRecipes error:", err);
    } finally {
      setLoading(false);
    }
  };

  const calculateAll = async (forceShowAll?: boolean) => {
    setCalculating(true);
    try {
      const result = await cmd.calculateArbitrage(undefined, undefined, forceShowAll ?? showAllRecipes);
      setCalculationResult(result.recipes);
      setLastCalculatedAt(result.calculated_at);
      if (result.total_profitable > 0 && result.total_loss > 0) {
        addToast("success", `计算出 ${result.total_profitable} 个盈利 + ${result.total_loss} 个亏损配方`);
      } else if (result.total_profitable > 0) {
        addToast("success", `计算出 ${result.total_profitable} 个可套利配方`);
      } else if (result.total_loss > 0) {
        addToast("warning", `全部 ${result.total_loss} 个配方亏损`);
      } else {
        addToast("warning", "暂无套利数据");
      }
    } catch (err) {
      console.error("[Arbitrage] calculateAll error:", err);
    } finally {
      setCalculating(false);
    }
  };

  const refreshPrices = async () => {
    setRefreshingPrice(true);
    try {
      await calculateAll();
      addToast("success", "价格已刷新");
    } catch (err) {
      addToast("error", `刷新失败: ${err}`);
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
    console.log("[Arbitrage] createRecipe called, newRecipe:", JSON.stringify(newRecipe));
    if (!newRecipe.name.trim()) {
      addToast("error", "请输入配方名称");
      return;
    }
    if (newRecipe.ingredients.length === 0) {
      addToast("error", "请添加至少一个原料");
      return;
    }
    if (newRecipe.outputs.length === 0) {
      addToast("error", "请添加至少一个产物");
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
      addToast("success", "配方创建成功");
    } catch (err) {
      addToast("error", `创建失败: ${err}`);
    }
  };

  const deleteRecipe = async (recipeId: string) => {
    try {
      await cmd.deleteArbitrageRecipe(recipeId);
      addToast("success", "配方已删除");
      await loadRecipes();
      await calculateAll();
    } catch (err) {
      addToast("error", `删除失败: ${err}`);
    }
  };

  const toggleRecipeEnabled = async (recipe: ArbitrageRecipe) => {
    try {
      await cmd.toggleArbitrageRecipeEnabled(recipe.id, recipe.enabled === 0);
      await loadRecipes();
      await calculateAll();
    } catch (err) {
      addToast("error", `切换状态失败: ${err}`);
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
      addToast("success", "配方已更新");
      setShowEditDialog(null);
      await loadRecipes();
      await calculateAll();
    } catch (err) {
      addToast("error", `更新失败: ${err}`);
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
      addToast("success", "原料已更新");
      setShowIngredientDialog(null);
      await calculateAll();
    } catch (err) {
      addToast("error", `更新失败: ${err}`);
    }
  };

  const saveOutputs = async () => {
    if (!showOutputDialog) return;
    try {
      await cmd.updateArbitrageOutputs(showOutputDialog.id, { outputs: editOutputs });
      addToast("success", "产物已更新");
      setShowOutputDialog(null);
      await calculateAll();
    } catch (err) {
      addToast("error", `更新失败: ${err}`);
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
      console.log("[Arbitrage] Search ingredients results:", results);
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
      console.log("[Arbitrage] Search outputs results:", results);
      setOutputResults(results);
    } catch (err) {
      console.error("[Arbitrage] Search outputs error:", err);
      setOutputResults([]);
    }
  };

  const addIngredientFromDraft = () => {
    console.log("[Arbitrage] addIngredientFromDraft called, draft:", JSON.stringify(ingredientDraft));
    if (!ingredientDraft.item_name || ingredientDraft.count <= 0) {
      addToast("error", "请选择物品并设置数量");
      return;
    }
    if (newRecipe.ingredients.some(i => i.item_name === ingredientDraft.item_name)) {
      addToast("error", "该物品已在原料列表中");
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
    console.log("[Arbitrage] addOutputFromDraft called, draft:", JSON.stringify(outputDraft));
    if (!outputDraft.item_name || outputDraft.count <= 0) {
      addToast("error", "请选择物品并设置数量");
      return;
    }
    if (newRecipe.outputs.some(o => o.item_name === outputDraft.item_name)) {
      addToast("error", "该物品已在产物列表中");
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
      addToast("error", "该物品已在列表中");
      return;
    }
    setEditIngredients(prev => [...prev, { item_name: item.name, count: 1 }]);
    setIngredientSearch("");
    setIngredientResults([]);
  };

  const addEditOutput = (item: ItemSearchResult) => {
    if (editOutputs.some(o => o.item_name === item.name)) {
      addToast("error", "该物品已在列表中");
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
    loadRecipes().then(() => calculateAll());
  }, []);

  return (
    <PageShell size="xl" className="space-y-5">
      <PageHeader
        title="套利比价"
        description="分解、合成、材料兑换 全场景比价分析"
        icon={Calculator}
        iconBg="bg-green-50"
        iconColor="text-green-500"
        actions={
          <ToolbarActions>
            <Button variant="outline" size="sm" onClick={refreshPrices} disabled={refreshingPrice || calculating}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshingPrice || calculating ? "animate-spin" : ""}`} />
              刷新价格
            </Button>
            <Button variant="outline" size="sm" onClick={toggleShowAll} disabled={calculating}>
              {showAllRecipes ? "显示全部" : "只看盈利"}
            </Button>
            <Button variant="default" size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              新增配方
            </Button>
          </ToolbarActions>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          label="可套利配方"
          value={totalProfitable}
          icon={TrendingUp}
          iconBg="bg-red-50"
          iconColor="text-red-500"
          helper={<span className="text-xs text-red-500">个</span>}
          className="border-red-100"
        />
        <MetricCard
          label="亏损配方"
          value={totalLoss}
          icon={TrendingDown}
          iconBg="bg-green-50"
          iconColor="text-green-500"
          helper={<span className="text-xs text-green-500">个</span>}
          className="border-green-100"
        />
        <MetricCard
          label="配方总数"
          value={recipes.length}
          icon={Layers}
          iconBg="bg-blue-50"
          iconColor="text-[var(--color-brand)]"
          helper={<span className="text-xs text-[var(--color-brand)]">个</span>}
          className="border-blue-100"
        />
      </div>

      <Surface padding="none">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700">套利结果</span>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              {["all", "decompose", "synthesize", "exchange"].map(type => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    typeFilter === type
                      ? "bg-white text-slate-800 shadow-sm font-medium"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {type === "all" ? "全部" : getRecipeTypeLabel(type)}
                </button>
              ))}
            </div>
          </div>
          {lastCalculatedAt && (
            <span className="text-xs text-slate-400">
              计算时间: {formatTime(lastCalculatedAt)}
            </span>
          )}
        </div>
        <div className="divide-y divide-slate-100">
          {filteredResults.length === 0 ? (
            <div className="px-4 py-8 text-center">
              {loading ? (
                <div className="text-sm text-slate-400">加载中...</div>
              ) : (
                <EmptyState
                  title="暂无套利数据"
                  description="点击刷新价格获取最新结果"
                  icon={Calculator}
                />
              )}
            </div>
          ) : (
            filteredResults.map(result => (
              <div key={result.recipe_id} className="px-4 py-3 hover:bg-[var(--color-panel-soft)] transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleExpanded(result.recipe_id)}
                      className="p-1 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                      {expandedIds.has(result.recipe_id) ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">{result.recipe_name}</span>
                        <StatusBadge variant="default">{getRecipeTypeLabel(result.recipe_type)}</StatusBadge>
                        {result.used_lowest_price && (
                          <StatusBadge variant="warning">最低价</StatusBadge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-medium text-slate-600">
                        利润: <span className={result.is_profitable ? "text-red-600" : "text-green-500"}>
                          {result.is_profitable ? "+" : ""}{formatPrice(result.profit)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        利润率: <span className={result.is_profitable ? "text-red-500" : "text-green-400"}>
                          {formatProfitMargin(result.profit_margin)}
                        </span>
                      </div>
                    </div>
                    {result.is_profitable ? (
                      <div className="p-1.5 rounded-lg bg-red-100">
                        <TrendingUp className="h-4 w-4 text-red-600" />
                      </div>
                    ) : (
                      <div className="p-1.5 rounded-lg bg-green-100">
                        <TrendingDown className="h-4 w-4 text-green-500" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 ml-2">
                      <button
                        onClick={() => {
                          const recipe = recipes.find(r => r.id === result.recipe_id);
                          if (recipe) openEditDialog(recipe);
                        }}
                        className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-500 hover:text-[var(--color-brand)]"
                        title="编辑配方"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteRecipe(result.recipe_id)}
                        className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-300 hover:text-red-500"
                        title="删除配方"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {expandedIds.has(result.recipe_id) && (
                  <div className="mt-3 pl-8 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <Surface padding="sm" className="bg-slate-50">
                        <div className="text-xs font-medium text-slate-500 mb-2">原料成本</div>
                        <div className="space-y-1">
                          {result.ingredients_detail.map(ing => (
                            <div key={ing.item_name} className="flex items-center justify-between text-sm">
                              <span className="text-slate-600">{ing.item_name} × {ing.count}</span>
                              <span className="text-slate-800 font-medium">{formatPrice(ing.unit_price)} × {ing.count} = {formatPrice(ing.total_cost)}</span>
                            </div>
                          ))}
                          <div className="pt-1 border-t border-slate-200 flex items-center justify-between font-medium">
                            <span className="text-slate-600">总成本</span>
                            <span className="text-red-500">{formatPrice(result.total_cost)}</span>
                          </div>
                        </div>
                      </Surface>
                      <Surface padding="sm" className="bg-slate-50">
                        <div className="text-xs font-medium text-slate-500 mb-2">产物收入（12.5%手续费后）</div>
                        <div className="space-y-1">
                          {result.outputs_detail.map(out => (
                            <div key={out.item_name} className="flex items-center justify-between text-sm">
                              <span className="text-slate-600">{out.item_name} × {out.count}</span>
                              <span className="text-slate-800 font-medium">{formatPrice(out.unit_price)} × {out.count} = {formatPrice(out.after_tax_value)}</span>
                            </div>
                          ))}
                          <div className="pt-1 border-t border-slate-200 flex items-center justify-between font-medium">
                            <span className="text-slate-600">税后总收入</span>
                            <span className="text-green-600">{formatPrice(result.total_output_value)}</span>
                          </div>
                        </div>
                      </Surface>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Surface>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">新增套利配方</h3>
            <button onClick={() => setShowCreateDialog(false)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">配方名称</label>
              <Input
                value={newRecipe.name}
                onChange={e => setNewRecipe(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如：传说装备分解"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">配方类型</label>
              <select
                value={newRecipe.recipe_type}
                onChange={e => setNewRecipe(prev => ({ ...prev, recipe_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
              >
                {RECIPE_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">原料列表</label>
                <button
                  onClick={() => setNewRecipe(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className="flex items-center gap-1 text-sm text-slate-500"
                >
                  {newRecipe.enabled ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5" />}
                  启用
                </button>
              </div>
              {newRecipe.ingredients.length > 0 && (
                <div className="mb-2 space-y-1">
                  {newRecipe.ingredients.map(ing => (
                    <div key={ing.item_name} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg text-sm">
                      <span>{ing.item_name}</span>
                      <div className="flex items-center gap-2">
                        <span>× {ing.count}</span>
                        <button onClick={() => removeNewIngredient(ing.item_name)} className="text-red-400 hover:text-red-600">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={ingredientDraft.item_name}
                    onChange={e => {
                      setIngredientDraft(prev => ({ ...prev, item_name: e.target.value }));
                      searchIngredients(e.target.value);
                    }}
                    placeholder="搜索物品..."
                    className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
                  />
                </div>
                <input
                  type="number"
                  value={ingredientDraft.count}
                  onChange={e => setIngredientDraft(prev => ({ ...prev, count: parseInt(e.target.value) || 1 }))}
                  className="w-20 px-2 py-2 rounded-lg border border-slate-200 text-sm text-center"
                  min="1"
                />
                <button
                  onClick={addIngredientFromDraft}
                  className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  添加
                </button>
              </div>
              {ingredientResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                  {ingredientResults.map(item => (
                    <button
                      type="button"
                      key={item.item_id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIngredientDraft({ item_name: item.name, count: 1 });
                        setIngredientResults([]);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-panel-soft)] flex items-center justify-between"
                    >
                      <span>{item.name}</span>
                      <span className="text-slate-400 text-xs">{formatPrice(item.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">产物列表</label>
              {newRecipe.outputs.length > 0 && (
                <div className="mb-2 space-y-1">
                  {newRecipe.outputs.map(out => (
                    <div key={out.item_name} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg text-sm">
                      <span>{out.item_name}</span>
                      <div className="flex items-center gap-2">
                        <span>× {out.count}</span>
                        <button onClick={() => removeNewOutput(out.item_name)} className="text-red-400 hover:text-red-600">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={outputDraft.item_name}
                    onChange={e => {
                      setOutputDraft(prev => ({ ...prev, item_name: e.target.value }));
                      searchOutputs(e.target.value);
                    }}
                    placeholder="搜索产物..."
                    className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
                  />
                </div>
                <input
                  type="number"
                  value={outputDraft.count}
                  onChange={e => setOutputDraft(prev => ({ ...prev, count: parseInt(e.target.value) || 1 }))}
                  className="w-20 px-2 py-2 rounded-lg border border-slate-200 text-sm text-center"
                  min="1"
                />
                <button
                  onClick={addOutputFromDraft}
                  className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  添加
                </button>
              </div>
              {outputResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                  {outputResults.map(item => (
                    <button
                      type="button"
                      key={item.item_id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOutputDraft({ item_name: item.name, count: 1 });
                        setOutputResults([]);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-panel-soft)] flex items-center justify-between"
                    >
                      <span>{item.name}</span>
                      <span className="text-slate-400 text-xs">{formatPrice(item.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
            <button
              onClick={() => setShowCreateDialog(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-[var(--color-panel-soft)] rounded-lg"
            >
              取消
            </button>
            <button
              type="button"
              onClick={createRecipe}
              className="px-4 py-2 text-sm bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-white hover:opacity-90 rounded-lg"
            >
              创建配方
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!showEditDialog} onOpenChange={() => setShowEditDialog(null)}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
            <h3 className="text-sm font-semibold text-slate-800">编辑配方</h3>
            <button onClick={() => setShowEditDialog(null)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">配方名称</label>
              <Input
                value={editRecipe.name}
                onChange={e => setEditRecipe(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">配方类型</label>
              <select
                value={editRecipe.recipe_type}
                onChange={e => setEditRecipe(prev => ({ ...prev, recipe_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
              >
                {RECIPE_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">原料列表</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ingredientSearch}
                    onChange={e => searchIngredients(e.target.value)}
                    placeholder="搜索物品..."
                    className="w-32 px-2 py-1 rounded-lg border border-slate-200 text-sm"
                  />
                  <button
                    onClick={() => setEditRecipe(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className="text-xs text-slate-500 flex items-center gap-1"
                  >
                    {editRecipe.enabled ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4" />}
                    启用
                  </button>
                </div>
              </div>
              {editIngredients.length > 0 ? (
                <div className="space-y-1 mb-2">
                  {editIngredients.map(ing => (
                    <div key={ing.item_name} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                      <span className="flex-1 text-sm">{ing.item_name}</span>
                      <input
                        type="number"
                        value={ing.count}
                        onChange={e => updateEditIngredientCount(ing.item_name, parseInt(e.target.value) || 1)}
                        className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-sm text-center"
                        min="1"
                      />
                      <button onClick={() => removeEditIngredient(ing.item_name)} className="text-red-400 hover:text-red-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-400 mb-2">暂无原料</div>
              )}
              {ingredientResults.length > 0 && (
                <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg mb-2">
                  {ingredientResults.map(item => (
                    <button
                      key={item.item_id}
                      onClick={() => addEditIngredient(item)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-panel-soft)] flex items-center justify-between"
                    >
                      <span>{item.name}</span>
                      <span className="text-slate-400 text-xs">{formatPrice(item.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2">产物列表</label>
              {editOutputs.length > 0 ? (
                <div className="space-y-1 mb-2">
                  {editOutputs.map(out => (
                    <div key={out.item_name} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                      <span className="flex-1 text-sm">{out.item_name}</span>
                      <input
                        type="number"
                        value={out.count}
                        onChange={e => updateEditOutputCount(out.item_name, parseInt(e.target.value) || 1)}
                        className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-sm text-center"
                        min="1"
                      />
                      <button onClick={() => removeEditOutput(out.item_name)} className="text-red-400 hover:text-red-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-400 mb-2">暂无产物</div>
              )}
              {outputResults.length > 0 && (
                <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg">
                  {outputResults.map(item => (
                    <button
                      key={item.item_id}
                      onClick={() => addEditOutput(item)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-panel-soft)] flex items-center justify-between"
                    >
                      <span>{item.name}</span>
                      <span className="text-slate-400 text-xs">{formatPrice(item.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
            <button
              onClick={() => setShowEditDialog(null)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-[var(--color-panel-soft)] rounded-lg"
            >
              取消
            </button>
            <button
              onClick={updateRecipeInfo}
              className="px-4 py-2 text-sm bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-white hover:opacity-90 rounded-lg"
            >
              保存
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!showIngredientDialog} onOpenChange={() => setShowIngredientDialog(null)}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">编辑原料</h3>
            <button onClick={() => setShowIngredientDialog(null)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <div className="p-5 space-y-3">
            {editIngredients.map(ing => (
              <div key={ing.item_name} className="flex items-center gap-2">
                <span className="flex-1 text-sm">{ing.item_name}</span>
                <input
                  type="number"
                  value={ing.count}
                  onChange={e => updateEditIngredientCount(ing.item_name, parseInt(e.target.value) || 1)}
                  className="w-20 px-2 py-1 rounded-lg border border-slate-200 text-sm text-center"
                  min="1"
                />
                <button onClick={() => removeEditIngredient(ing.item_name)} className="text-red-400 hover:text-red-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={ingredientSearch}
                onChange={e => searchIngredients(e.target.value)}
                placeholder="搜索添加物品..."
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
              />
            </div>
            {ingredientResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                {ingredientResults.map(item => (
                  <button
                    type="button"
                    key={item.item_id}
                    onClick={(e) => {
                      e.stopPropagation();
                      addEditIngredient(item);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-panel-soft)] flex items-center justify-between"
                  >
                    <span>{item.name}</span>
                    <span className="text-slate-400 text-xs">{formatPrice(item.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
            <button
              onClick={() => setShowIngredientDialog(null)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-[var(--color-panel-soft)] rounded-lg"
            >
              取消
            </button>
            <button
              onClick={saveIngredients}
              className="px-4 py-2 text-sm bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-white hover:opacity-90 rounded-lg"
            >
              保存
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!showOutputDialog} onOpenChange={() => setShowOutputDialog(null)}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">编辑产物</h3>
            <button onClick={() => setShowOutputDialog(null)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <div className="p-5 space-y-3">
            {editOutputs.map(out => (
              <div key={out.item_name} className="flex items-center gap-2">
                <span className="flex-1 text-sm">{out.item_name}</span>
                <input
                  type="number"
                  value={out.count}
                  onChange={e => updateEditOutputCount(out.item_name, parseInt(e.target.value) || 1)}
                  className="w-20 px-2 py-1 rounded-lg border border-slate-200 text-sm text-center"
                  min="1"
                />
                <button onClick={() => removeEditOutput(out.item_name)} className="text-red-400 hover:text-red-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={outputSearch}
                onChange={e => searchOutputs(e.target.value)}
                placeholder="搜索添加物品..."
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
              />
            </div>
            {outputResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                {outputResults.map(item => (
                  <button
                    type="button"
                    key={item.item_id}
                    onClick={(e) => {
                      e.stopPropagation();
                      addEditOutput(item);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-panel-soft)] flex items-center justify-between"
                  >
                    <span>{item.name}</span>
                    <span className="text-slate-400 text-xs">{formatPrice(item.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
            <button
              onClick={() => setShowOutputDialog(null)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-[var(--color-panel-soft)] rounded-lg"
            >
              取消
            </button>
            <button
              onClick={saveOutputs}
              className="px-4 py-2 text-sm bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-white hover:opacity-90 rounded-lg"
            >
              保存
            </button>
          </div>
        </div>
      </Dialog>
    </PageShell>
  );
}
