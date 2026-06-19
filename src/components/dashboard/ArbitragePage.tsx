import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { devLog } from "@/lib/devLog";
import { errorMessage } from "@/lib/utils";
import { RefreshCw, Plus, ArrowRightLeft, TrendingUp, TrendingDown, Layers } from "lucide-react";
import { cmd, type ArbitrageRecipe, type ArbitrageCalculationResult, type ItemSearchResult, type CreateRecipeRequest, type CreateIngredientRequest, type CreateOutputRequest } from "@/lib/commands";
import { toast } from "sonner";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { ToolbarActions } from "@/components/ui/Toolbar";
import { Button } from "@/components/ui/button";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { ArbitrageRecipeList } from "./arbitrage/ArbitrageRecipeList";
import { CreateRecipeDialog, EditRecipeDialog } from "./arbitrage/RecipeFormDialog";
import { ComponentEditDialog } from "./arbitrage/ComponentEditDialog";
import { type NewRecipe, type EditRecipeInfo } from "./arbitrage/types";

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
  const [, setContextKey] = useState(`${marketContext.seasonId}-${marketContext.marketMode}`);
  const [lastMode, setLastMode] = useState(marketContext.marketMode);
  const pendingRef = useRef(false);

  const [newRecipe, setNewRecipe] = useState<NewRecipe>({
    name: "",
    recipe_type: "decompose",
    enabled: true,
    ingredients: [] as CreateIngredientRequest[],
    outputs: [] as CreateOutputRequest[],
  });

  const [editRecipe, setEditRecipe] = useState<EditRecipeInfo>({
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

  const recipeMap = useMemo(() => {
    const map = new Map<string, ArbitrageRecipe>();
    for (const r of recipes) {
      map.set(r.id, r);
    }
    return map;
  }, [recipes]);

  const loadRecipes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cmd.getArbitrageRecipes();
      setRecipes(data);
    } catch (err) {
      devLog.error("[Arbitrage] loadRecipes error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const calculateAll = useCallback(async (forceShowAll?: boolean, silent?: boolean) => {
    setCalculating(true);
    try {
      const result = await cmd.calculateArbitrage(undefined, undefined, forceShowAll ?? showAllRecipes);
      setCalculationResult(result.recipes);
      setLastCalculatedAt(result.calculated_at);
      if (!silent) {
        if (result.total_profitable > 0 && result.total_loss > 0) {
          toast.success(`计算出 ${result.total_profitable} 个盈利 + ${result.total_loss} 个亏损配方`);
        } else if (result.total_profitable > 0) {
          toast.success(`计算出 ${result.total_profitable} 个可套利配方`);
        } else if (result.total_loss > 0) {
          toast.warning(`全部 ${result.total_loss} 个配方亏损`);
        }
      }
    } catch (err) {
      devLog.error("[Arbitrage] calculateAll error:", err);
    } finally {
      setCalculating(false);
    }
  }, [showAllRecipes]);

  // 保持对最新 calculateAll 的引用，供事件监听器调用（避免监听器因依赖变化反复重注册）
  const calculateAllRef = useRef(calculateAll);
  calculateAllRef.current = calculateAll;

  // 当赛季/模式切换时，重新计算套利
  useEffect(() => {
    if (!marketContextReady || pendingRef.current) return;

    const currentMode = marketContext.marketMode;
    if (currentMode !== lastMode) {
      pendingRef.current = true;
      setLastMode(currentMode);
      setContextKey(`${marketContext.seasonId}-${currentMode}`);
      setCalculating(true);
      cmd.calculateArbitrage(marketContext.seasonId, currentMode, showAllRecipes)
        .then(result => {
          setCalculationResult(result.recipes);
          setLastCalculatedAt(result.calculated_at);
        })
        .catch(err => {
          devLog.error("[Arbitrage] Mode switch error:", err);
        })
        .finally(() => {
          setCalculating(false);
          pendingRef.current = false;
        });
    }
  }, [marketContext.marketMode, marketContext.seasonId, marketContextReady, showAllRecipes]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshPrices = async () => {
    setRefreshingPrice(true);
    try {
      await calculateAll();
      toast.success("价格已刷新");
    } catch (err) {
      toast.error(`刷新失败: ${errorMessage(err)}`);
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
      toast.error(`创建失败: ${errorMessage(err)}`);
    }
  };

  const deleteRecipe = async (recipeId: string) => {
    try {
      await cmd.deleteArbitrageRecipe(recipeId);
      toast.success("配方已删除");
      await loadRecipes();
      await calculateAll();
    } catch (err) {
      toast.error(`删除失败: ${errorMessage(err)}`);
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
      toast.error(`更新失败: ${errorMessage(err)}`);
    }
  };

  const loadRecipeDetails = async (recipeId: string) => {
    try {
      return await cmd.getArbitrageRecipeDetail(recipeId);
    } catch {
      return null;
    }
  };

  const openEditDialog = async (recipe: ArbitrageRecipe) => {
    const details = await loadRecipeDetails(recipe.id);
    if (details) {
      setEditIngredients(details.ingredients.map(i => ({
        item_name: i.item_name ?? "",
        count: i.count,
      })));
      setEditOutputs(details.outputs.map(o => ({
        item_name: o.item_name ?? "",
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
      toast.error(`更新失败: ${errorMessage(err)}`);
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
      toast.error(`更新失败: ${errorMessage(err)}`);
    }
  };

  const ingredientTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outputTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (ingredientTimeoutRef.current) clearTimeout(ingredientTimeoutRef.current);
      if (outputTimeoutRef.current) clearTimeout(outputTimeoutRef.current);
    };
  }, []);

  const searchIngredients = async (keyword: string) => {
    setIngredientSearch(keyword);
    if (ingredientTimeoutRef.current) clearTimeout(ingredientTimeoutRef.current);
    if (keyword.length < 1) {
      setIngredientResults([]);
      return;
    }
    ingredientTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await cmd.searchItemsForArbitrage(keyword);
        setIngredientResults(results);
      } catch (err) {
        devLog.error("[Arbitrage] Search ingredients error:", err);
        setIngredientResults([]);
      }
    }, 300);
  };

  const searchOutputs = async (keyword: string) => {
    setOutputSearch(keyword);
    if (outputTimeoutRef.current) clearTimeout(outputTimeoutRef.current);
    if (keyword.length < 1) {
      setOutputResults([]);
      return;
    }
    outputTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await cmd.searchItemsForArbitrage(keyword);
        setOutputResults(results);
      } catch (err) {
        devLog.error("[Arbitrage] Search outputs error:", err);
        setOutputResults([]);
      }
    }, 300);
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

  useEffect(() => {
    if (!marketContextReady) return;
    loadRecipes().then(() => calculateAll());
  }, [marketContextReady, loadRecipes, calculateAll]);

  // 监听物品价格更新事件，自动静默重算套利（与获取物价同步刷新）
  useEffect(() => {
    if (!("__TAURI__" in window)) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen("items-updated", () => {
      calculateAllRef.current(undefined, true);
    })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch((err) => {
        devLog.error("[Arbitrage] listen items-updated error:", err);
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

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
      <ArbitrageRecipeList
        filteredResults={filteredResults}
        expandedIds={expandedIds}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        loading={loading}
        lastCalculatedAt={lastCalculatedAt}
        recipeMap={recipeMap}
        onToggleExpand={toggleExpanded}
        onEdit={openEditDialog}
        onDelete={deleteRecipe}
      />

      {/* Create Dialog */}
      <CreateRecipeDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        newRecipe={newRecipe}
        setNewRecipe={setNewRecipe}
        ingredientResults={ingredientResults}
        ingredientDraft={ingredientDraft}
        setIngredientDraft={setIngredientDraft}
        setIngredientResults={setIngredientResults}
        outputResults={outputResults}
        outputDraft={outputDraft}
        setOutputDraft={setOutputDraft}
        setOutputResults={setOutputResults}
        onSearchIngredients={searchIngredients}
        onSearchOutputs={searchOutputs}
        onAddIngredientFromDraft={addIngredientFromDraft}
        onAddOutputFromDraft={addOutputFromDraft}
        onRemoveNewIngredient={removeNewIngredient}
        onRemoveNewOutput={removeNewOutput}
        onCreate={createRecipe}
      />

      {/* Edit Dialog */}
      <EditRecipeDialog
        open={!!showEditDialog}
        onClose={() => setShowEditDialog(null)}
        editRecipe={editRecipe}
        setEditRecipe={setEditRecipe}
        editIngredients={editIngredients}
        editOutputs={editOutputs}
        ingredientSearch={ingredientSearch}
        ingredientResults={ingredientResults}
        outputSearch={outputSearch}
        outputResults={outputResults}
        onSearchIngredients={searchIngredients}
        onSearchOutputs={searchOutputs}
        onAddEditIngredient={addEditIngredient}
        onAddEditOutput={addEditOutput}
        onRemoveEditIngredient={removeEditIngredient}
        onRemoveEditOutput={removeEditOutput}
        onUpdateEditIngredientCount={updateEditIngredientCount}
        onUpdateEditOutputCount={updateEditOutputCount}
        onSave={updateRecipeInfo}
      />

      {/* Ingredient Dialog */}
      <ComponentEditDialog
        kind="ingredient"
        open={!!showIngredientDialog}
        onClose={() => setShowIngredientDialog(null)}
        items={editIngredients}
        search={ingredientSearch}
        results={ingredientResults}
        onSearch={searchIngredients}
        onAdd={addEditIngredient}
        onRemove={removeEditIngredient}
        onUpdateCount={updateEditIngredientCount}
        onSave={saveIngredients}
      />

      {/* Output Dialog */}
      <ComponentEditDialog
        kind="output"
        open={!!showOutputDialog}
        onClose={() => setShowOutputDialog(null)}
        items={editOutputs}
        search={outputSearch}
        results={outputResults}
        onSearch={searchOutputs}
        onAdd={addEditOutput}
        onRemove={removeEditOutput}
        onUpdateCount={updateEditOutputCount}
        onSave={saveOutputs}
      />
    </PageShell>
  );
}
