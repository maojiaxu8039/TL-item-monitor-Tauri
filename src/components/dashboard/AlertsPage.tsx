import { useState, useEffect } from "react";
import {
  Bell,
  Plus,
  X,
  AlertCircle,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cmd, AlertRule, AlertEvent } from "@/lib/commands";
import { useToast } from "@/hooks/useToast";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type RuleType = "price_below" | "price_above" | "profit_ratio_above" | "price_drop_percent";

const RULE_TYPES: { value: RuleType; label: string; description: string }[] = [
  { value: "price_below", label: "价格低于", description: "物品价格低于设定值时触发" },
  { value: "price_above", label: "价格高于", description: "物品价格高于设定值时触发" },
];

interface CreateRuleForm {
  rule_type: RuleType;
  item_id: string;
  threshold: number;
  cooldown_seconds: number;
}

const formatTimestamp = (ts: number) => {
  return new Date(ts * 1000).toLocaleString("zh-CN");
};

const formatCooldown = (seconds: number) => {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
  return `${Math.floor(seconds / 3600)}小时`;
};

const getRuleTypeLabel = (ruleType: string) => {
  const found = RULE_TYPES.find(r => r.value === ruleType);
  return found ? found.label : ruleType;
};

export default function AlertsPage() {
  const { addToast } = useToast();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "enabled" | "disabled">("all");

  const [createForm, setCreateForm] = useState<CreateRuleForm>({
    rule_type: "price_below",
    item_id: "",
    threshold: 100,
    cooldown_seconds: 300,
  });

  const loadData = async () => {
    try {
      const [rulesData, eventsData] = await Promise.all([
        cmd.getAlertRules(),
        cmd.getAlertEvents(50),
      ]);
      setRules(rulesData);
      setEvents(eventsData);
    } catch (e) {
      console.error("Failed to load alerts:", e);
      addToast("error", "加载预警规则失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const doLoad = async () => {
      try {
        const [rulesData, eventsData] = await Promise.all([
          cmd.getAlertRules(),
          cmd.getAlertEvents(50),
        ]);
        if (!mounted) return;
        setRules(rulesData);
        setEvents(eventsData);
      } catch (e) {
        if (!mounted) return;
        console.error("Failed to load alerts:", e);
        addToast("error", "加载预警规则失败");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    doLoad();
    return () => { mounted = false; };
  }, []);

  const handleCreate = async () => {
    if (!createForm.item_id.trim()) {
      addToast("warning", "请输入物品ID");
      return;
    }
    if (createForm.threshold <= 0) {
      addToast("warning", "阈值必须大于0");
      return;
    }
    try {
      await cmd.createAlertRule(
        null,
        null,
        createForm.item_id || null,
        createForm.rule_type,
        createForm.threshold,
        createForm.cooldown_seconds
      );
      addToast("success", "预警规则创建成功");
      setShowCreateDialog(false);
      setCreateForm({
        rule_type: "price_below",
        item_id: "",
        threshold: 100,
        cooldown_seconds: 300,
      });
      loadData();
    } catch (e) {
      console.error("Failed to create rule:", e);
      addToast("error", `创建规则失败: ${e}`);
    }
  };

  const handleToggle = async (rule: AlertRule) => {
    const newEnabled = rule.enabled === 0;
    try {
      await cmd.toggleAlertRule(rule.id, newEnabled);
      addToast("success", newEnabled ? "规则已启用" : "规则已禁用");
      loadData();
    } catch (e) {
      console.error("Failed to toggle rule:", e);
      addToast("error", "操作失败");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个预警规则吗？")) return;
    try {
      await cmd.deleteAlertRule(id);
      addToast("success", "规则已删除");
      loadData();
    } catch (e) {
      console.error("Failed to delete rule:", e);
      addToast("error", "删除失败");
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedRules(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const filteredRules = rules.filter(rule => {
    if (filter === "enabled") return rule.enabled === 1;
    if (filter === "disabled") return rule.enabled === 0;
    return true;
  });

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
            <Bell className="w-5 h-5 text-amber-500" />
            预警规则
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">设置价格预警，实时监控市场变化</p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新建规则
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 text-xs rounded-lg ${
            filter === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          全部 ({rules.length})
        </button>
        <button
          onClick={() => setFilter("enabled")}
          className={`px-3 py-1.5 text-xs rounded-lg ${
            filter === "enabled" ? "bg-green-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          启用中 ({rules.filter(r => r.enabled === 1).length})
        </button>
        <button
          onClick={() => setFilter("disabled")}
          className={`px-3 py-1.5 text-xs rounded-lg ${
            filter === "disabled" ? "bg-slate-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          已停用 ({rules.filter(r => r.enabled === 0).length})
        </button>
      </div>

      {filteredRules.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 py-16 text-center">
          <Bell className="w-16 h-16 text-slate-200 mx-auto mb-4" />
          <div className="text-sm text-slate-500 mb-2">
            {filter === "all" ? "暂无预警规则" : filter === "enabled" ? "暂无启用的规则" : "暂无停用的规则"}
          </div>
          {filter === "all" && (
            <div className="text-xs text-slate-400">点击右上角"新建规则"开始设置</div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRules.map(rule => {
            const isExpanded = expandedRules.has(rule.id);
            return (
              <div key={rule.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleExpand(rule.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                      {rule.enabled === 1 ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <X className="w-5 h-5 text-slate-300" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">
                            {getRuleTypeLabel(rule.rule_type)} {rule.threshold}
                            {rule.rule_type === "price_drop_percent" ? "%" : "火"}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            rule.enabled === 1 ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                          }`}>
                            {rule.enabled === 1 ? "启用" : "停用"}
                          </span>
                        </div>
                        {rule.item_id && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            物品: {rule.item_id}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        冷却: {formatCooldown(rule.cooldown_seconds)}
                      </div>
                      {rule.last_triggered_at && (
                        <div>上次触发: {formatTimestamp(rule.last_triggered_at)}</div>
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                      创建时间: {formatTimestamp(rule.created_at)}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggle(rule)}
                        className={`px-3 py-1.5 text-xs rounded-lg ${
                          rule.enabled === 1
                            ? "bg-slate-200 text-slate-600 hover:bg-slate-300"
                            : "bg-green-100 text-green-700 hover:bg-green-200"
                        }`}
                      >
                        {rule.enabled === 1 ? "禁用" : "启用"}
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {events.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            最近预警事件
          </h3>
          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
            {events.slice(0, 10).map(event => (
              <div key={event.id} className="px-4 py-3 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm text-slate-700">{event.message}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {formatTimestamp(event.triggered_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">新建预警规则</h3>
            <button onClick={() => setShowCreateDialog(false)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">规则类型</label>
              <Select
                value={createForm.rule_type}
                onChange={(e) => setCreateForm({ ...createForm, rule_type: e.target.value as RuleType })}
              >
                {RULE_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label} - {type.description}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">物品ID</label>
              <Input
                value={createForm.item_id}
                onChange={(e) => setCreateForm({ ...createForm, item_id: e.target.value })}
                placeholder="输入物品ID，如: item_001"
              />
              <p className="text-xs text-slate-400 mt-1">留空则监控所有物品</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                阈值 {createForm.rule_type === "price_drop_percent" ? "(%)" : "(火)"}
              </label>
              <Input
                type="number"
                value={createForm.threshold}
                onChange={(e) => setCreateForm({ ...createForm, threshold: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">冷却时间</label>
              <Select
                value={createForm.cooldown_seconds}
                onChange={(e) => setCreateForm({ ...createForm, cooldown_seconds: parseInt(e.target.value) })}
              >
                <option value={60}>1分钟</option>
                <option value={300}>5分钟</option>
                <option value={600}>10分钟</option>
                <option value={1800}>30分钟</option>
                <option value={3600}>1小时</option>
                <option value={86400}>24小时</option>
              </Select>
              <p className="text-xs text-slate-400 mt-1">触发后等待一段时间才再次通知</p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
            <button
              onClick={() => setShowCreateDialog(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600"
            >
              创建规则
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
