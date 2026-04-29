import { useState } from "react";
import { cmd, type AlertRule, type AlertEvent } from "../../lib/commands";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { Bell, Plus, Pencil, Trash2, X, AlertCircle, CheckCircle2 } from "lucide-react";

const RULE_TYPE_OPTIONS = [
  { label: "火价低于阈值", value: "fire_price_below" },
  { label: "火价高于阈值", value: "fire_price_above" },
  { label: "物品价格低于", value: "item_price_below" },
  { label: "物品价格高于", value: "item_price_above" },
];

function RuleTypeLabel(type: string): string {
  return RULE_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

interface RuleFormData {
  rule_type: string;
  threshold: string;
  cooldown_seconds: string;
}

const DEFAULT_FORM: RuleFormData = {
  rule_type: "fire_price_below",
  threshold: "",
  cooldown_seconds: "1800",
};

export default function AlertsPage() {
  const qc = useQueryClient();
  const { marketContext } = useSectionRefresh();
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState<AlertRule | null>(null);
  const [form, setForm] = useState<RuleFormData>(DEFAULT_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ["alert-rules", marketContext.seasonId, marketContext.marketMode],
    queryFn: cmd.getAlertRules,
  });

  const { data: events = [] } = useQuery({
    queryKey: ["alert-events", marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getAlertEvents(10),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      cmd.createAlertRule(
        null,
        null,
        null,
        form.rule_type,
        parseFloat(form.threshold) || 0,
        parseInt(form.cooldown_seconds) || 1800
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert-rules", marketContext.seasonId, marketContext.marketMode] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      cmd.updateAlertRule(
        editRule!.id,
        editRule!.strategy_id,
        editRule!.section_id,
        editRule!.item_id,
        form.rule_type,
        parseFloat(form.threshold) || 0,
        parseInt(form.cooldown_seconds) || 1800,
        editRule!.enabled === 1
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert-rules", marketContext.seasonId, marketContext.marketMode] });
      closeModal();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      cmd.toggleAlertRule(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-rules", marketContext.seasonId, marketContext.marketMode] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cmd.deleteAlertRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert-rules", marketContext.seasonId, marketContext.marketMode] });
      setDeleteId(null);
    },
  });

  const openCreate = () => {
    setEditRule(null);
    setForm(DEFAULT_FORM);
    setShowModal(true);
  };

  const openEdit = (rule: AlertRule) => {
    setEditRule(rule);
    setForm({
      rule_type: rule.rule_type,
      threshold: rule.threshold.toString(),
      cooldown_seconds: rule.cooldown_seconds.toString(),
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditRule(null);
    setForm(DEFAULT_FORM);
  };

  const handleSubmit = () => {
    if (form.threshold === "") return;
    if (editRule) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const setField = (field: keyof RuleFormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="p-6 max-w-3xl space-y-6 bg-app-bg min-h-screen">
      {/* Page title */}
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-semibold text-text-strong">价格预警</h1>
      </div>

      {/* Rules section */}
      <section className="bg-white border border-border rounded-card shadow-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-medium text-text-strong">预警规则</h2>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-primary text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            创建规则
          </button>
        </div>

        {rulesLoading ? (
          <div className="text-sm text-text-muted text-center py-8">加载中…</div>
        ) : rules.length === 0 ? (
          <div className="text-sm text-text-muted text-center py-8 border border-dashed border-border rounded-md">
            暂无预警规则，点击「创建规则」添加
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 font-medium text-text-muted">类型</th>
                  <th className="text-right py-2 px-2 font-medium text-text-muted">阈值</th>
                  <th className="text-right py-2 px-2 font-medium text-text-muted">冷却(秒)</th>
                  <th className="text-center py-2 px-2 font-medium text-text-muted">状态</th>
                  <th className="text-right py-2 px-2 font-medium text-text-muted">操作</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id} className="border-b border-border/50 hover:bg-surface-muted/50">
                    <td className="py-2.5 px-2 text-text">{RuleTypeLabel(rule.rule_type)}</td>
                    <td className="py-2.5 px-2 text-text text-right font-mono">{rule.threshold}</td>
                    <td className="py-2.5 px-2 text-text text-right">{rule.cooldown_seconds}</td>
                    <td className="py-2.5 px-2 text-center">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.enabled === 1}
                          onChange={e => toggleMutation.mutate({ id: rule.id, enabled: e.target.checked })}
                          className="sr-only peer accent-primary"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(rule)}
                          className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded transition-colors"
                          title="编辑"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteId(rule.id)}
                          className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent events section */}
      <section className="bg-white border border-border rounded-card shadow-card p-5">
        <h2 className="text-base font-medium text-text-strong mb-4">最近预警记录</h2>
        {events.length === 0 ? (
          <div className="text-sm text-text-muted text-center py-6 border border-dashed border-border rounded-md">
            暂无预警记录
          </div>
        ) : (
          <div className="space-y-2">
            {events.map(evt => (
              <div key={evt.id} className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
                <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${evt.seen ? "text-text-muted" : "text-amber-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${evt.seen ? "text-text-muted" : "text-text-strong font-medium"}`}>
                    {evt.message}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">
                    {formatTimestamp(evt.triggered_at)}
                  </div>
                </div>
                {!evt.seen && (
                  <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-card shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-base font-semibold text-text-strong">
                {editRule ? "编辑规则" : "创建规则"}
              </h3>
              <button onClick={closeModal} className="text-text-muted hover:text-text">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Rule type */}
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">预警类型</label>
                <select
                  value={form.rule_type}
                  onChange={e => setField("rule_type", e.target.value)}
                  className="w-full text-sm border border-border rounded-md px-3 py-2 text-text bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {RULE_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Threshold */}
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">阈值</label>
                <input
                  type="number"
                  value={form.threshold}
                  onChange={e => setField("threshold", e.target.value)}
                  placeholder="例如：300"
                  className="w-full text-sm border border-border rounded-md px-3 py-2 text-text bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {/* Cooldown */}
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">冷却时间（秒）</label>
                <input
                  type="number"
                  value={form.cooldown_seconds}
                  onChange={e => setField("cooldown_seconds", e.target.value)}
                  min={1}
                  className="w-full text-sm border border-border rounded-md px-3 py-2 text-text bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-text-muted hover:text-text border border-border rounded-md hover:bg-surface-muted transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={form.threshold === "" || createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createMutation.isPending || updateMutation.isPending ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-card shadow-xl w-full max-w-sm mx-4 p-5">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <h3 className="text-base font-semibold text-text-strong">确认删除</h3>
            </div>
            <p className="text-sm text-text mb-5">确定要删除这条预警规则吗？此操作不可撤销。</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm text-text-muted border border-border rounded-md hover:bg-surface-muted transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
