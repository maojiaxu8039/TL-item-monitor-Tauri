import { useState, useEffect } from "react";
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
} from "lucide-react";
import { cmd, StrategyWithCosts, ItemData } from "@/lib/commands";
import { useToast } from "@/components/ui/Toast";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const COST_TYPES = [
  { value: "回响", label: "回响" },
  { value: "信标", label: "信标" },
  { value: "探针", label: "探针" },
  { value: "罗盘", label: "罗盘" },
  { value: "材料", label: "其他材料" },
];

const LABELS = [
  { value: "K8", label: "K8" },
  { value: "U8", label: "U8" },
  { value: "深空", label: "深空" },
  { value: "普通", label: "普通" },
];

const DIFFICULTIES = [
  { value: "简单", label: "简单" },
  { value: "普通", label: "普通" },
  { value: "困难", label: "困难" },
  { value: "噩梦", label: "噩梦" },
  { value: "地狱", label: "地狱" },
];

interface EditStrategyForm {
  id?: string;
  name: string;
  label: string;
  difficulty: string;
  output_value: number;
  defense_value: number;
  remark: string;
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

export default function StrategiesPage() {
  const { addToast } = useToast();
  const [strategies, setStrategies] = useState<StrategyWithCosts[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCostDialog, setShowCostDialog] = useState<string | null>(null);
  const [showOutputDialog, setShowOutputDialog] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [itemSearchResults, setItemSearchResults] = useState<ItemData[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [currentFirePrice, setCurrentFirePrice] = useState<number>(0);

  const [editForm, setEditForm] = useState<EditStrategyForm>({
    name: "",
    label: "K8",
    difficulty: "普通",
    output_value: 0,
    defense_value: 0,
    remark: "",
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

  const loadStrategies = async () => {
    try {
      const data = await cmd.getAllStrategiesWithCosts();
      setStrategies(data);
    } catch (e) {
      console.error("Failed to load strategies:", e);
      addToast("error", "加载策略失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStrategies();
  }, []);

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
      label: "K8",
      difficulty: "普通",
      output_value: 0,
      defense_value: 0,
      remark: "",
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

  const getLabelColor = (label: string) => {
    switch (label) {
      case "K8": return "bg-orange-100 text-orange-600";
      case "U8": return "bg-purple-100 text-purple-600";
      case "深空": return "bg-blue-100 text-blue-600";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const getProfitColor = (ratio: number) => {
    if (ratio > 0) return "text-green-600";
    if (ratio < 0) return "text-red-600";
    return "text-gray-600";
  };

  const handleItemSelect = (item: ItemData) => {
    if (showCostDialog) {
      setCostForm({
        ...costForm,
        item_id: item.item_id,
        item_name: item.name,
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
            策略收益分析
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">对比不同玩法的成本与产出</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowCreateDialog(true); }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新建策略
        </button>
      </div>

      {strategies.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 py-16 text-center">
          <Target className="w-16 h-16 text-slate-200 mx-auto mb-4" />
          <div className="text-sm text-slate-500 mb-2">暂无策略</div>
          <div className="text-xs text-slate-400">点击右上角"新建策略"开始分析</div>
        </div>
      ) : (
        <div className="space-y-4">
          {strategies.map((strategy) => (
            <div key={strategy.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-semibold text-slate-900">{strategy.name}</div>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getLabelColor(strategy.label)}`}>
                      {strategy.label}
                    </span>
                    <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded-full">
                      {strategy.difficulty}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRefreshPrices(strategy.id)}
                      disabled={refreshing === strategy.id}
                      className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                      title="刷新火价"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshing === strategy.id ? "animate-spin" : ""}`} />
                    </button>
                    <button
                      onClick={() => handleEdit(strategy)}
                      className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                      title="编辑策略"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(strategy.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="删除策略"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {strategy.remark && (
                  <div className="mt-2 text-sm text-slate-500">{strategy.remark}</div>
                )}
                <div className="mt-3 flex items-center gap-6">
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
              </div>

              <div className="p-4 grid grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-red-500" />
                      成本消耗
                    </div>
                    <button
                      onClick={() => openCostDialog(strategy.id)}
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
                              onClick={() => handleDeleteCost(cost.id)}
                              className="p-1 text-slate-400 hover:text-red-500"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-sm font-medium">
                        <span className="text-slate-500">总计成本</span>
                        <span className="text-red-600">{strategy.total_cost_fire.toFixed(1)} 火</span>
                      </div>
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
                      onClick={() => openOutputDialog(strategy.id)}
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
                              onClick={() => handleDeleteOutput(output.id)}
                              className="p-1 text-slate-400 hover:text-red-500"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-sm font-medium">
                        <span className="text-slate-500">预估总产出</span>
                        <span className="text-green-600">{strategy.total_output_value.toFixed(0)} 火</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-500">盈亏:</span>
                      <span className={`font-medium ${getProfitColor(strategy.profit_ratio)}`}>
                        {strategy.profit_ratio >= 0 ? "+" : ""}{strategy.profit_ratio.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 text-sm font-medium ${getProfitColor(strategy.profit_ratio)}`}>
                    {strategy.profit_ratio >= 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    <span>
                      {strategy.total_output_value - strategy.total_cost_fire >= 0 ? "+" : ""}
                      {(strategy.total_output_value - strategy.total_cost_fire).toFixed(1)} 火
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">成本类型</label>
              <Select
                value={costForm.cost_type}
                onChange={(e) => setCostForm({ ...costForm, cost_type: e.target.value })}
              >
                {COST_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </div>
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
    </div>
  );
}
