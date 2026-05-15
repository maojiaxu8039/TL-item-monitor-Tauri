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
  Search,
} from "lucide-react";
import { cmd, AlertRule, AlertEvent, ItemSearchResult, Section, SectionItem } from "@/lib/commands";
import { useToast } from "@/hooks/useToast";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Toolbar, ToolbarActions } from "@/components/ui/Toolbar";
import { Button } from "@/components/ui/button";

type RuleType = "price_below" | "price_above" | "profit_ratio_above" | "price_drop_percent";

const RULE_TYPES: { value: RuleType; label: string; description: string }[] = [
  { value: "price_below", label: "价格低于", description: "物品价格低于设定值时触发" },
  { value: "price_above", label: "价格高于", description: "物品价格高于设定值时触发" },
];

interface CreateRuleForm {
  rule_type: RuleType;
  section_id: string;
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
  const { marketContext } = useSectionRefresh();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "enabled" | "disabled">("all");

  const [createForm, setCreateForm] = useState<CreateRuleForm>({
    rule_type: "price_below",
    section_id: "",
    item_id: "",
    threshold: 100,
    cooldown_seconds: 300,
  });

  const [itemSearch, setItemSearch] = useState("");
  const [itemResults, setItemResults] = useState<ItemSearchResult[]>([]);
  const [selectedItemName, setSelectedItemName] = useState<string>("");

  const getSectionName = (sectionId: string | null) => {
    if (!sectionId) return "";
    return sections.find(section => section.id === sectionId)?.name ?? sectionId;
  };

  const sectionItemToSearchResult = (item: SectionItem): ItemSearchResult => ({
    item_id: item.item_id,
    name: item.item_name || item.item_id,
    item_type: item.item_type || "",
    price: item.current_price || 0,
  });

  const loadData = async () => {
    try {
      const [rulesData, eventsData, sectionsData] = await Promise.all([
        cmd.getAlertRules(),
        cmd.getAlertEvents(50),
        cmd.getSections(),
      ]);
      setRules(rulesData);
      setEvents(eventsData);
      setSections(sectionsData);
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
        const [rulesData, eventsData, sectionsData] = await Promise.all([
          cmd.getAlertRules(),
          cmd.getAlertEvents(50),
          cmd.getSections(),
        ]);
        if (!mounted) return;
        setRules(rulesData);
        setEvents(eventsData);
        setSections(sectionsData);
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
    if (!createForm.section_id.trim() && !createForm.item_id.trim()) {
      addToast("warning", "请选择一个板块，或从搜索结果中选择一个物品");
      return;
    }
    if (selectedItemName && !createForm.item_id.trim()) {
      addToast("warning", "请先从搜索结果中选择物品");
      return;
    }
    if (createForm.threshold <= 0) {
      addToast("warning", "阈值必须大于0");
      return;
    }
    try {
      await cmd.createAlertRule(
        null,
        createForm.section_id || null,
        createForm.item_id || null,
        createForm.rule_type,
        createForm.threshold,
        createForm.cooldown_seconds
      );
      addToast("success", "预警规则创建成功");
      setShowCreateDialog(false);
      setCreateForm({
        rule_type: "price_below",
        section_id: "",
        item_id: "",
        threshold: 100,
        cooldown_seconds: 300,
      });
      setSelectedItemName("");
      setItemSearch("");
      setItemResults([]);
      loadData();
    } catch (e) {
      console.error("Failed to create rule:", e);
      addToast("error", `创建规则失败: ${e}`);
    }
  };

  const searchItems = async (keyword: string) => {
    setItemSearch(keyword);
    if (keyword.length < 1) {
      setItemResults([]);
      return;
    }
    try {
      if (createForm.section_id) {
        const sectionItems = await cmd.getSectionItems(createForm.section_id, marketContext.seasonId, marketContext.marketMode);
        const normalizedKeyword = keyword.toLowerCase();
        setItemResults(
          sectionItems
            .map(sectionItemToSearchResult)
            .filter(item =>
              item.name.toLowerCase().includes(normalizedKeyword) ||
              item.item_id.toLowerCase().includes(normalizedKeyword)
            )
            .slice(0, 50)
        );
        return;
      }
      const results = await cmd.searchItemsForArbitrage(keyword);
      setItemResults(results);
    } catch (err) {
      console.error("[Alerts] Search items error:", err);
      setItemResults([]);
    }
  };

  const selectItem = (item: ItemSearchResult) => {
    setCreateForm(prev => ({ ...prev, item_id: item.item_id }));
    setSelectedItemName(item.name);
    setItemSearch(item.name);
    setItemResults([]);
  };

  const handleSectionChange = (sectionId: string) => {
    setCreateForm(prev => ({ ...prev, section_id: sectionId, item_id: "" }));
    setSelectedItemName("");
    setItemSearch("");
    setItemResults([]);
  };

  const clearSelectedItem = () => {
    setCreateForm(prev => ({ ...prev, item_id: "" }));
    setSelectedItemName("");
    setItemSearch("");
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
        <div className="text-[var(--color-text-subtle)]">加载中...</div>
      </div>
    );
  }

  return (
    <PageShell size="xl" className="space-y-5">
      <PageHeader
        title="提醒设置"
        description="设置价格预警，实时监控市场变化"
        iconAsset="alerts"
        actions={
          <ToolbarActions>
            <Button variant="warning" size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              新建规则
            </Button>
          </ToolbarActions>
        }
      />

      <Surface padding="sm">
        <div className="flex items-center gap-2">
          {[
            { key: "all", label: "全部", count: rules.length, color: "slate" },
            { key: "enabled", label: "启用中", count: rules.filter(r => r.enabled === 1).length, color: "green" },
            { key: "disabled", label: "已停用", count: rules.filter(r => r.enabled === 0).length, color: "slate" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as typeof filter)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                filter === tab.key
                  ? tab.color === "green"
                    ? "bg-[var(--color-success)] text-black font-medium"
                    : "bg-[var(--color-panel)] text-[var(--color-text)] font-medium"
                  : "bg-[var(--color-panel-soft)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)]"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </Surface>

      {filteredRules.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={filter === "all" ? "暂无预警规则" : filter === "enabled" ? "暂无启用的规则" : "暂无停用的规则"}
          description={filter === "all" ? '点击右上角"新建规则"开始设置' : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filteredRules.map(rule => {
            const isExpanded = expandedRules.has(rule.id);
            return (
              <div key={rule.id} className="bg-[var(--color-panel)] rounded-lg border border-[var(--color-border)] overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-[var(--color-panel-soft)] transition-colors"
                  onClick={() => toggleExpand(rule.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-[var(--color-text-subtle)]" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-[var(--color-text-subtle)]" />
                      )}
                      {rule.enabled === 1 ? (
                        <CheckCircle className="w-5 h-5 text-[var(--color-success)]" />
                      ) : (
                        <X className="w-5 h-5 text-[var(--color-text-subtle)]" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[var(--color-text)]">
                            {getRuleTypeLabel(rule.rule_type)} {rule.threshold}
                            {rule.rule_type === "price_drop_percent" ? "%" : "火"}
                          </span>
                          <StatusBadge variant={rule.enabled === 1 ? "success" : "default"} size="sm">
                            {rule.enabled === 1 ? "启用" : "停用"}
                          </StatusBadge>
                        </div>
                        {rule.item_id && (
                          <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">
                            物品: {rule.item_id}
                          </div>
                        )}
                        {rule.section_id && (
                          <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">
                            板块: {getSectionName(rule.section_id)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[var(--color-text-subtle)]">
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
                  <div className="px-4 py-3 bg-[var(--color-panel-soft)] border-t border-[var(--color-border-soft)] flex items-center justify-between">
                    <div className="text-xs text-[var(--color-text-subtle)]">
                      创建时间: {formatTimestamp(rule.created_at)}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={rule.enabled === 1 ? "outline" : "success"}
                        size="sm"
                        onClick={() => handleToggle(rule)}
                      >
                        {rule.enabled === 1 ? "禁用" : "启用"}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(rule.id)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {events.length > 0 && (
        <Surface padding="none">
          <div className="px-4 py-3 border-b border-[var(--color-border-soft)]">
            <h3 className="text-sm font-medium text-[var(--color-text)] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[var(--color-brand-gold)]" />
              最近预警事件
            </h3>
          </div>
          <div className="divide-y divide-[var(--color-border-soft)]">
            {events.slice(0, 10).map(event => (
              <div key={event.id} className="px-4 py-3 flex items-start gap-3 hover:bg-[var(--color-panel-soft)] transition-colors">
                <AlertCircle className="w-4 h-4 text-[var(--color-brand-gold)] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--color-text)]">{event.message}</div>
                  <div className="text-xs text-[var(--color-text-subtle)] mt-1">
                    {formatTimestamp(event.triggered_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Surface>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <div className="bg-[var(--color-panel)] rounded-xl shadow-xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-soft)]">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">新建预警规则</h3>
            <button
              onClick={() => setShowCreateDialog(false)}
              className="text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]"
            >
              ✕
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">关联板块</label>
              <Select
                value={createForm.section_id}
                onChange={(e) => handleSectionChange(e.target.value)}
              >
                <option value="">不限定板块</option>
                {sections.map(section => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-[var(--color-text-subtle)] mt-1">选择板块后，空物品会监控该板块内全部物品</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">规则类型</label>
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
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">物品名称</label>
              {selectedItemName ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-[rgba(34,197,94,0.1)] rounded-lg border border-[rgba(34,197,94,0.25)]">
                  <span className="flex-1 text-sm text-[var(--color-success)] font-medium">{selectedItemName}</span>
                  <button
                    onClick={clearSelectedItem}
                    className="text-[var(--color-success)] hover:text-[var(--color-success)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-subtle)]" />
                  <Input
                    value={itemSearch}
                    onChange={(e) => searchItems(e.target.value)}
                    placeholder={createForm.section_id ? "搜索板块内物品..." : "搜索物品名称..."}
                    className="pl-10"
                  />
                </div>
              )}
              {itemResults.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto border border-[var(--color-border)] rounded-lg">
                  {itemResults.map(item => (
                    <button
                      key={item.item_id}
                      onClick={() => selectItem(item)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-panel-soft)] flex items-center justify-between"
                    >
                      <span>{item.name}</span>
                      <span className="text-[var(--color-text-subtle)] text-xs">{item.price?.toLocaleString() ?? "无价"} 火</span>
                    </button>
                  ))}
                </div>
              )}
              {!selectedItemName && (
                <p className="text-xs text-[var(--color-text-subtle)] mt-1">
                  {createForm.section_id ? "留空则监控该板块所有物品" : "未选板块时必须选择一个物品"}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                阈值 {createForm.rule_type === "price_drop_percent" ? "(%)" : "(火)"}
              </label>
              <Input
                type="number"
                value={createForm.threshold}
                onChange={(e) => setCreateForm({ ...createForm, threshold: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">冷却时间</label>
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
              <p className="text-xs text-[var(--color-text-subtle)] mt-1">触发后等待一段时间才再次通知</p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--color-border-soft)]">
            <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(false)}>
              取消
            </Button>
            <Button variant="warning" size="sm" onClick={handleCreate}>
              创建规则
            </Button>
          </div>
        </div>
      </Dialog>
    </PageShell>
  );
}
