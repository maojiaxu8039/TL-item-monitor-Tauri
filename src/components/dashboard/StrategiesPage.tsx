import { useState, useEffect, useMemo, useRef } from "react";
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
  Search,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Award,
  Star,
  ThumbsUp,
  AlertTriangle,
  Info,
  Image,
  Upload,
  ExternalLink,
} from "lucide-react";
import { cmd, StrategyWithCosts, ItemData } from "@/lib/commands";
import { useToast } from "@/hooks/useToast";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { strategyTemplates, type StrategyTemplate } from "@/lib/strategyTemplates";



const LABELS = [
  { value: "K7", label: "K7" },
  { value: "K8-1", label: "K8-1" },
  { value: "K8-2", label: "K8-2" },
  { value: "U8", label: "U8" },
  { value: "深空", label: "深空" },
  { value: "九红深空", label: "九红深空" },
];

const DIFFICULTIES = [
  { value: "简单", label: "简单" },
  { value: "普通", label: "普通" },
  { value: "困难", label: "困难" },
  { value: "专家", label: "专家" },
];

interface EditStrategyForm {
  id?: string;
  name: string;
  label: string;
  difficulty: string;
  output_value: number;
  defense_value: number;
  remark: string;
  image_url: string;
}

interface CostForm {
  strategy_id: string;
  cost_type: string;
  item_id: string;
  item_name: string;
  count: number;
  is_realtime: boolean;
}

interface OutputForm {
  strategy_id: string;
  item_name: string;
  item_type: string;
  count: number;
}

type StrategyTab = "strategies" | "templates" | "recommendations";

export interface StrategyRecommendation {
  strategy_id: string;
  strategy_name: string;
  score: number;
  level: "strong" | "good" | "watch" | "avoid";
  expected_profit_fire: number;
  profit_ratio: number;
  risk_level: "low" | "medium" | "high";
  reasons: string[];
  warnings: string[];
}

export default function StrategiesPage() {
  const { addToast } = useToast();
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

  const loadStrategies = async () => {
    try {
      const data = await cmd.getAllStrategiesWithCosts();
      if (!mountedRef.current) return;
      const sorted = [...data].sort((a, b) => b.profit_ratio - a.profit_ratio);
      setStrategies(sorted);
    } catch (e) {
      if (!mountedRef.current) return;
      console.error("Failed to load strategies:", e);
      addToast("error", "加载策略失败");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    loadStrategies();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const searchItems = async (keyword: string) => {
    if (!keyword.trim()) {
      setItemSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const result = await cmd.searchItems(keyword, 1, 20);
      setItemSearchResults(result.items);
    } catch (e) {
      console.error("Search failed:", e);
      setItemSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!editForm.name.trim()) {
      addToast("warning", "请输入策略名称");
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
      addToast("success", "策略创建成功");
      setShowCreateDialog(false);
      resetForm();
      loadStrategies();
    } catch (e) {
      console.error("Failed to create strategy:", e);
      addToast("error", `创建策略失败: ${e}`);
    }
  };

  const handleEdit = (strategy: StrategyWithCosts) => {
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
  };

  const handleUpdate = async () => {
    if (!editForm.id || !editForm.name.trim()) {
      addToast("warning", "请输入策略名称");
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
      addToast("success", "策略更新成功");
      setShowEditDialog(false);
      resetForm();
      loadStrategies();
    } catch (e) {
      console.error("Failed to update strategy:", e);
      addToast("error", `更新策略失败: ${e}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个策略吗？")) return;
    try {
      await cmd.deleteStrategyDetail(id);
      addToast("success", "策略已删除");
      loadStrategies();
    } catch (e) {
      console.error("Failed to delete strategy:", e);
      addToast("error", "删除策略失败");
    }
  };

  const handleAddCost = async () => {
    if (!costForm.item_id.trim() && !costForm.item_name.trim()) {
      addToast("warning", "请选择或输入物品");
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
      addToast("success", "成本添加成功");
      setShowCostDialog(null);
      resetCostForm();
      loadStrategies();
    } catch (e) {
      console.error("Failed to add cost:", e);
      addToast("error", "添加成本失败");
    }
  };

  const handleAddOutput = async () => {
    if (!outputForm.item_name.trim()) {
      addToast("warning", "请选择物品");
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
      addToast("success", "产出添加成功");
      setShowOutputDialog(null);
      resetOutputForm();
      loadStrategies();
    } catch (e) {
      console.error("Failed to add output:", e);
      addToast("error", "添加产出失败");
    }
  };

  const handleDeleteCost = async (id: string) => {
    try {
      await cmd.deleteStrategyCost(id);
      addToast("success", "成本已删除");
      loadStrategies();
    } catch (e) {
      console.error("Failed to delete cost:", e);
      addToast("error", "删除成本失败");
    }
  };

  const handleDeleteOutput = async (id: string) => {
    try {
      await cmd.deleteStrategyOutput(id);
      addToast("success", "产出已删除");
      loadStrategies();
    } catch (e) {
      console.error("Failed to delete output:", e);
      addToast("error", "删除产出失败");
    }
  };

  const handleRefreshPrices = async (strategyId: string) => {
    setRefreshing(strategyId);
    try {
      await cmd.refreshStrategyFirePrices(strategyId);
      addToast("success", "火价已刷新");
      loadStrategies();
    } catch (e) {
      console.error("Failed to refresh prices:", e);
      addToast("error", "刷新火价失败");
    } finally {
      setRefreshing(null);
    }
  };

  const openCostDialog = (strategyId: string) => {
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
  };

  const openOutputDialog = (strategyId: string) => {
    setOutputForm({
      strategy_id: strategyId,
      item_name: "",
      item_type: "",
      count: 1,
    });
    setItemSearchResults([]);
    setShowOutputDialog(strategyId);
  };

  const resetForm = () => {
    setEditForm({
      name: "",
      label: "K8-1",
      difficulty: "普通",
      output_value: 0,
      defense_value: 0,
      remark: "",
      image_url: "",
    });
  };

  const resetCostForm = () => {
    setCostForm({
      strategy_id: "",
      cost_type: "回响",
      item_id: "",
      item_name: "",
      count: 1,
      is_realtime: true,
    });
    setItemSearchResults([]);
  };

  const resetOutputForm = () => {
    setOutputForm({
      strategy_id: "",
      item_name: "",
      item_type: "",
      count: 1,
    });
    setItemSearchResults([]);
  };

  const guessCostType = (itemName: string, itemType: string): string => {
    const name = itemName.toLowerCase();
    const type = itemType.toLowerCase();
    if (name.includes("回响") || type.includes("回响")) return "回响";
    if (name.includes("信标") || type.includes("信标")) return "信标";
    if (name.includes("探针") || type.includes("探针")) return "探针";
    if (name.includes("罗盘") || name.includes("指南针") || type.includes("罗盘")) return "罗盘";
    return "材料";
  };

  const handleItemSelect = (item: ItemData) => {
    if (showCostDialog) {
      setCostForm({
        ...costForm,
        item_id: item.item_id,
        item_name: item.name,
        cost_type: guessCostType(item.name, item.item_type),
      });
      setItemSearchResults([]);
    } else if (showOutputDialog) {
      setOutputForm({
        ...outputForm,
        item_name: item.name,
        item_type: item.item_type,
      });
      setItemSearchResults([]);
    }
  };

  const getLabelColor = (label: string) => {
    switch (label) {
      case "K7": return "bg-green-100 text-green-600";
      case "K8-1": return "bg-orange-100 text-orange-600";
      case "K8-2": return "bg-red-100 text-red-600";
      case "U8": return "bg-purple-100 text-purple-600";
      case "深空": return "bg-blue-100 text-blue-600";
      case "九红深空": return "bg-yellow-100 text-yellow-700";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const getProfitColor = (ratio: number) => {
    if (ratio > 0) return "text-red-600";
    if (ratio < 0) return "text-green-600";
    return "text-gray-600";
  };

  const getRecommendationLevelColor = (level: StrategyRecommendation["level"]) => {
    switch (level) {
      case "strong": return "bg-green-100 text-green-700 border-green-200";
      case "good": return "bg-blue-100 text-blue-700 border-blue-200";
      case "watch": return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "avoid": return "bg-red-100 text-red-700 border-red-200";
    }
  };

  const getRecommendationLevelText = (level: StrategyRecommendation["level"]) => {
    switch (level) {
      case "strong": return "强烈推荐";
      case "good": return "可跑";
      case "watch": return "观望";
      case "avoid": return "不建议";
    }
  };

  const getRiskColor = (risk: StrategyRecommendation["risk_level"]) => {
    switch (risk) {
      case "low": return "text-green-600 bg-green-50";
      case "medium": return "text-yellow-600 bg-yellow-50";
      case "high": return "text-red-600 bg-red-50";
    }
  };

  const calculateRecommendations = useMemo((): StrategyRecommendation[] => {
    if (strategies.length === 0) return [];

    const now = Date.now();

    return strategies.map(strategy => {
      const reasons: string[] = [];
      const warnings: string[] = [];
      let score = 50;

      const profitRatio = strategy.profit_ratio;
      const netProfit = strategy.total_output_value - strategy.total_cost_fire;
      const hasCosts = strategy.costs.length > 0;
      const hasOutputs = strategy.outputs.length > 0;

      if (!hasCosts || !hasOutputs) {
        warnings.push("成本或产出数据不完整");
      }

      if (profitRatio > 20) {
        score += 30;
        reasons.push(`收益率极高 (+${profitRatio.toFixed(1)}%)`);
      } else if (profitRatio > 10) {
        score += 20;
        reasons.push(`收益率较高 (+${profitRatio.toFixed(1)}%)`);
      } else if (profitRatio > 0) {
        score += 10;
        reasons.push(`收益率正向 (+${profitRatio.toFixed(1)}%)`);
      } else if (profitRatio < -10) {
        score -= 30;
        warnings.push(`收益率过低 (${profitRatio.toFixed(1)}%)`);
      } else if (profitRatio < 0) {
        score -= 15;
        warnings.push(`收益为负 (${profitRatio.toFixed(1)}%)`);
      }

      if (netProfit > 100) {
        score += 15;
        reasons.push(`净收益较高 (+${netProfit.toFixed(0)}火)`);
      } else if (netProfit < -100) {
        score -= 20;
        warnings.push(`净收益为负 (${netProfit.toFixed(0)}火)`);
      }

      const hasRealtimeCosts = strategy.costs.some(c => c.is_realtime);
      if (hasRealtimeCosts) {
        score += 5;
        reasons.push("使用实时火价计算");
      }

      const difficulty = strategy.difficulty;
      if (difficulty === "地狱" || difficulty === "噩梦") {
        score -= 5;
        warnings.push("高难度策略，风险较高");
      }

      score = Math.max(0, Math.min(100, score));

      let level: StrategyRecommendation["level"];
      if (score >= 80) level = "strong";
      else if (score >= 60) level = "good";
      else if (score >= 40) level = "watch";
      else level = "avoid";

      let risk: StrategyRecommendation["risk_level"];
      if (difficulty === "地狱" || difficulty === "噩梦" || profitRatio < -10) {
        risk = "high";
      } else if (difficulty === "困难" || profitRatio < 0) {
        risk = "medium";
      } else {
        risk = "low";
      }

      return {
        strategy_id: strategy.id,
        strategy_name: strategy.name,
        score,
        level,
        expected_profit_fire: netProfit,
        profit_ratio: profitRatio,
        risk_level: risk,
        reasons,
        warnings,
      };
    }).sort((a, b) => b.score - a.score);
  }, [strategies]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            策略管理
          </h2>
        </div>
        {activeTab === "strategies" && (
          <button
            onClick={() => { resetForm(); setShowCreateDialog(true); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建策略
          </button>
        )}
      </div>

      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("strategies")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "strategies"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          我的策略
        </button>
        <button
          onClick={() => setActiveTab("templates")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "templates"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          模板库
        </button>
        <button
          onClick={() => setActiveTab("recommendations")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "recommendations"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          推荐榜
        </button>
      </div>

      {activeTab === "templates" && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">选择模板快速创建策略，降低录入成本</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {strategyTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-slate-900">{template.name}</h3>
                    <p className="text-xs text-slate-500 mt-1">{template.description}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded ${getLabelColor(template.label)}`}>
                    {template.label}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                  <span>难度: {template.difficulty}</span>
                  <span>输出: {template.output_value}</span>
                  <span>防御: {template.defense_value}</span>
                </div>
                <div className="text-xs text-slate-400 mb-3">
                  {template.remark}
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {template.costs.slice(0, 3).map((cost, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-red-50 text-red-600 text-xs rounded">
                      {cost.cost_type}
                    </span>
                  ))}
                  {template.costs.length > 3 && (
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-xs rounded">
                      +{template.costs.length - 3}
                    </span>
                  )}
                </div>
                <button
                  onClick={async () => {
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
                      addToast("success", `已从模板 "${template.name}" 创建策略`);
                      setActiveTab("strategies");
                      loadStrategies();
                    } catch (e) {
                      console.error("Failed to create from template:", e);
                      addToast("error", `从模板创建失败: ${e}`);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  一键创建
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "recommendations" && (
        <div className="space-y-4">
          {strategies.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 py-12 text-center">
              <Award className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <div className="text-sm text-slate-500">暂无策略</div>
              <div className="text-xs text-slate-400 mt-1">请先创建策略后查看推荐</div>
            </div>
          ) : calculateRecommendations.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 py-12 text-center">
              <Info className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <div className="text-sm text-slate-500">策略数据不足</div>
              <div className="text-xs text-slate-400 mt-1">请添加成本和产出后查看推荐</div>
            </div>
          ) : (
            <div className="space-y-3">
              {calculateRecommendations.map((rec, index) => {
                const strategy = strategies.find(s => s.id === rec.strategy_id);
                return (
                  <div
                    key={rec.strategy_id}
                    className="bg-white rounded-lg border border-slate-200 p-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                        index === 0 ? "bg-yellow-100 text-yellow-600" :
                        index === 1 ? "bg-slate-100 text-slate-500" :
                        index === 2 ? "bg-orange-100 text-orange-500" :
                        "bg-slate-50 text-slate-400"
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{rec.strategy_name}</span>
                          <span className={`px-2 py-0.5 text-xs rounded border ${getRecommendationLevelColor(rec.level)}`}>
                            {getRecommendationLevelText(rec.level)}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded ${getRiskColor(rec.risk_level)}`}>
                            {rec.risk_level === "low" ? "低风险" : rec.risk_level === "medium" ? "中风险" : "高风险"}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                          <span>评分: <span className="font-medium">{rec.score}</span></span>
                          <span>收益率: <span className={`font-medium ${rec.profit_ratio >= 0 ? "text-red-600" : "text-green-600"}`}>
                            {rec.profit_ratio >= 0 ? "+" : ""}{rec.profit_ratio.toFixed(1)}%
                          </span></span>
                          <span>预计收益: <span className={`font-medium ${rec.expected_profit_fire >= 0 ? "text-red-600" : "text-green-600"}`}>
                            {rec.expected_profit_fire >= 0 ? "+" : ""}{rec.expected_profit_fire.toFixed(0)}火
                          </span></span>
                        </div>
                      </div>
                      {strategy?.image_url && (
                        <img
                          src={strategy.image_url}
                          alt="加点图"
                          className="w-16 h-16 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-80"
                          onClick={() => setPreviewImage(strategy.image_url)}
                        />
                      )}
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${
                          rec.score >= 80 ? "text-green-600" :
                          rec.score >= 60 ? "text-blue-600" :
                          rec.score >= 40 ? "text-yellow-600" :
                          "text-red-600"
                        }`}>
                          {rec.score}
                        </div>
                        <div className="text-xs text-slate-400">分</div>
                      </div>
                    </div>
                    {rec.reasons.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {rec.reasons.map((reason, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded">
                            <ThumbsUp className="w-3 h-3" />
                            {reason}
                          </span>
                        ))}
                      </div>
                    )}
                    {rec.warnings.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {rec.warnings.map((warning, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-50 text-yellow-700 text-xs rounded">
                            <AlertTriangle className="w-3 h-3" />
                            {warning}
                          </span>
                        ))}
                      </div>
                    )}
                    {strategy && (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span>成本: <span className="text-red-500">{strategy.total_cost_fire.toFixed(0)}火</span></span>
                          <span>产出: <span className="text-green-500">{strategy.total_output_value.toFixed(0)}火</span></span>
                          <span>难度: {strategy.difficulty}</span>
                        </div>
                        {strategy.costs.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                              <Zap className="w-3 h-3 text-red-500" />
                              消耗材料
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {strategy.costs.map((cost) => (
                                <span key={cost.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded">
                                  <span className="font-medium">{cost.item_name || cost.item_id}</span>
                                  <span className="text-red-400">×{cost.count}</span>
                                  <span className="text-red-700">{cost.total_fire.toFixed(0)}火</span>
                                  {cost.is_realtime && <span className="text-[10px] bg-green-100 text-green-600 px-1 rounded">实时</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {strategy.outputs.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3 text-green-500" />
                              产出收益
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {strategy.outputs.map((output) => (
                                <span key={output.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-600 text-xs rounded">
                                  <span className="font-medium">{output.item_name}</span>
                                  <span className="text-green-400">×{output.count}</span>
                                  <span className="text-green-700">{(output.realtime_value * output.count).toFixed(0)}火</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "strategies" && (
        <>
          {strategies.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 py-16 text-center">
              <Target className="w-16 h-16 text-slate-200 mx-auto mb-4" />
              <div className="text-sm text-slate-500 mb-2">暂无策略</div>
              <div className="text-xs text-slate-400">点击右上角"新建策略"开始分析</div>
            </div>
          ) : (
        <div className="space-y-2">
          {strategies.map((strategy) => {
            const isExpanded = expandedIds.has(strategy.id);
            return (
              <div key={strategy.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleExpand(strategy.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                      <div className="text-lg font-semibold text-slate-900">{strategy.name}</div>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getLabelColor(strategy.label)}`}>
                        {strategy.label}
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded-full">
                        {strategy.difficulty}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-slate-400" />
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
                    <div className="mt-2 text-sm text-slate-500 ml-7">{strategy.remark}</div>
                  )}
                  <div className="mt-2 flex items-center gap-6 ml-7 text-xs text-slate-400">
                    <span>成本: <span className="text-red-500">{strategy.total_cost_fire.toFixed(0)} 火</span></span>
                    <span>产出: <span className="text-green-500">{strategy.total_output_value.toFixed(0)} 火</span></span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100">
                    <div className="p-4 grid grid-cols-2 gap-6">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                            <Zap className="w-4 h-4 text-red-500" />
                            成本消耗
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); openCostDialog(strategy.id); }}
                            className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-0.5"
                          >
                            <Plus className="w-3 h-3" /> 添加
                          </button>
                        </div>
                        {strategy.costs.length === 0 ? (
                          <div className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                            暂无成本
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {strategy.costs.map((cost) => (
                              <div key={cost.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded">
                                    {cost.cost_type}
                                  </span>
                                  <span className="text-slate-700">{cost.item_name || cost.item_id}</span>
                                  <span className="text-slate-400">×{cost.count}</span>
                                  {cost.is_realtime && (
                                    <span className="px-1 py-0.5 bg-green-100 text-green-600 text-xs rounded">
                                      实时
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-slate-600">
                                    {cost.total_fire.toFixed(1)} 火
                                  </span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteCost(cost.id); }}
                                    className="p-1 text-slate-400 hover:text-red-500"
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
                          <div className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4 text-green-500" />
                            产出收益
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); openOutputDialog(strategy.id); }}
                            className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-0.5"
                          >
                            <Plus className="w-3 h-3" /> 添加
                          </button>
                        </div>
                        {strategy.outputs.length === 0 ? (
                          <div className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                            暂无产出
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {strategy.outputs.map((output) => (
                              <div key={output.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-700">{output.item_name}</span>
                                  <span className="px-1 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                                    {output.item_type}
                                  </span>
                                  <span className="text-slate-400">×{output.count}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-slate-600">
                                    {(output.realtime_value * output.count).toFixed(0)} 火
                                  </span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteOutput(output.id); }}
                                    className="p-1 text-slate-400 hover:text-red-500"
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
                      <div className="px-4 py-3 border-t border-slate-100">
                        <div className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                          <Image className="w-3 h-3" />
                          加点图片
                        </div>
                        <img
                          src={strategy.image_url}
                          alt="加点图"
                          className="max-h-32 rounded-lg border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(strategy.image_url);
                          }}
                        />
                      </div>
                    )}

                    <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-1.5 text-sm">
                          <Layers className="w-4 h-4 text-slate-400" />
                          <span className="text-slate-500">输出值:</span>
                          <span className="font-medium text-slate-700">{strategy.output_value.toFixed(0)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm">
                          <Shield className="w-4 h-4 text-slate-400" />
                          <span className="text-slate-500">防御值:</span>
                          <span className="font-medium text-slate-700">{strategy.defense_value.toFixed(0)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRefreshPrices(strategy.id); }}
                          disabled={refreshing === strategy.id}
                          className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                          title="刷新火价"
                        >
                          <RefreshCw className={`w-4 h-4 ${refreshing === strategy.id ? "animate-spin" : ""}`} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEdit(strategy); }}
                          className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                          title="编辑策略"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(strategy.id); }}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">新建策略</h3>
            <button onClick={() => setShowCreateDialog(false)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">策略名称</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="例如: K8回响流"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">标签</label>
                <Select
                  value={editForm.label}
                  onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                >
                  {LABELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">难度</label>
                <Select
                  value={editForm.difficulty}
                  onChange={(e) => setEditForm({ ...editForm, difficulty: e.target.value })}
                >
                  {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">输出值</label>
                <Input
                  type="number"
                  value={editForm.output_value}
                  onChange={(e) => setEditForm({ ...editForm, output_value: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">防御值</label>
                <Input
                  type="number"
                  value={editForm.defense_value}
                  onChange={(e) => setEditForm({ ...editForm, defense_value: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">备注</label>
              <Input
                value={editForm.remark}
                onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })}
                placeholder="可选备注信息"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">加点图片</label>
              <label className="flex items-center gap-2 px-4 py-3 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 cursor-pointer w-full">
                <Upload className="w-4 h-4" />
                <span className="text-sm">上传加点截图</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const base64 = ev.target?.result as string;
                      setEditForm(prev => ({ ...prev, image_url: base64 }));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {editForm.image_url && (
                <div className="mt-2 p-2 border border-slate-200 rounded-lg bg-slate-50 flex items-center gap-3">
                  <img src={editForm.image_url} alt="加点图预览" className="max-h-24 rounded" />
                  <button
                    onClick={() => setEditForm(prev => ({ ...prev, image_url: "" }))}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    删除图片
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
            <button onClick={() => setShowCreateDialog(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">取消</button>
            <button onClick={handleCreate} className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">创建</button>
          </div>
        </div>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">编辑策略</h3>
            <button onClick={() => setShowEditDialog(false)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">策略名称</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="例如: K8回响流"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">标签</label>
                <Select
                  value={editForm.label}
                  onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                >
                  {LABELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">难度</label>
                <Select
                  value={editForm.difficulty}
                  onChange={(e) => setEditForm({ ...editForm, difficulty: e.target.value })}
                >
                  {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">输出值</label>
                <Input
                  type="number"
                  value={editForm.output_value}
                  onChange={(e) => setEditForm({ ...editForm, output_value: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">防御值</label>
                <Input
                  type="number"
                  value={editForm.defense_value}
                  onChange={(e) => setEditForm({ ...editForm, defense_value: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">备注</label>
              <Input
                value={editForm.remark}
                onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })}
                placeholder="可选备注信息"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">加点图片</label>
              <label className="flex items-center gap-2 px-4 py-3 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 cursor-pointer w-full">
                <Upload className="w-4 h-4" />
                <span className="text-sm">上传加点截图</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const base64 = ev.target?.result as string;
                      setEditForm(prev => ({ ...prev, image_url: base64 }));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {editForm.image_url && (
                <div className="mt-2 p-2 border border-slate-200 rounded-lg bg-slate-50 flex items-center gap-3">
                  <img src={editForm.image_url} alt="加点图预览" className="max-h-24 rounded" />
                  <button
                    onClick={() => setEditForm(prev => ({ ...prev, image_url: "" }))}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    删除图片
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
            <button onClick={() => setShowEditDialog(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">取消</button>
            <button onClick={handleUpdate} className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">保存</button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!showCostDialog} onOpenChange={() => { setShowCostDialog(null); setItemSearchResults([]); }}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">添加成本</h3>
            <button onClick={() => setShowCostDialog(null)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">搜索物品</label>
              <div className="relative">
                <Input
                  value={costForm.item_name}
                  onChange={(e) => {
                    setCostForm({ ...costForm, item_id: "", item_name: e.target.value });
                    searchItems(e.target.value);
                  }}
                  placeholder="输入物品名称搜索"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
              {itemSearchResults.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                  {itemSearchResults.map((item) => (
                    <div
                      key={item.item_id}
                      onClick={() => handleItemSelect(item)}
                      className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                    >
                      <div className="text-slate-700">{item.name}</div>
                      <div className="text-xs text-slate-400">{item.item_type} - {item.price.toFixed(0)} 火</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">数量</label>
              <Input
                type="number"
                value={costForm.count}
                onChange={(e) => setCostForm({ ...costForm, count: parseFloat(e.target.value) || 1 })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={costForm.is_realtime}
                onChange={(e) => setCostForm({ ...costForm, is_realtime: e.target.checked })}
                className="w-4 h-4"
              />
              <span>关联实时火价</span>
            </label>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
            <button onClick={() => setShowCostDialog(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">取消</button>
            <button onClick={handleAddCost} className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">添加</button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!showOutputDialog} onOpenChange={() => { setShowOutputDialog(null); setItemSearchResults([]); }}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">添加产出</h3>
            <button onClick={() => setShowOutputDialog(null)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">搜索物品</label>
              <div className="relative">
                <Input
                  value={outputForm.item_name}
                  onChange={(e) => {
                    setOutputForm({ ...outputForm, item_name: e.target.value, item_type: "" });
                    searchItems(e.target.value);
                  }}
                  placeholder="输入物品名称搜索"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
              {itemSearchResults.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                  {itemSearchResults.map((item) => (
                    <div
                      key={item.item_id}
                      onClick={() => handleItemSelect(item)}
                      className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                    >
                      <div className="text-slate-700">{item.name}</div>
                      <div className="text-xs text-slate-400">{item.item_type} - {item.price.toFixed(0)} 火</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">物品类型</label>
              <Input
                value={outputForm.item_type}
                onChange={(e) => setOutputForm({ ...outputForm, item_type: e.target.value })}
                placeholder="自动从搜索结果填充"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">数量</label>
              <Input
                type="number"
                value={outputForm.count}
                onChange={(e) => setOutputForm({ ...outputForm, count: parseFloat(e.target.value) || 1 })}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
            <button onClick={() => setShowOutputDialog(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">取消</button>
            <button onClick={handleAddOutput} className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">添加</button>
          </div>
        </div>
      </Dialog>

        </>
      )}

      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800">加点图片预览</h3>
            <button onClick={() => setPreviewImage(null)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          {previewImage && (
            <img
              src={previewImage}
              alt="加点图"
              className="w-full rounded-lg"
              style={{ maxHeight: '70vh', objectFit: 'contain' }}
            />
          )}
        </div>
      </Dialog>
    </div>
  );
}
