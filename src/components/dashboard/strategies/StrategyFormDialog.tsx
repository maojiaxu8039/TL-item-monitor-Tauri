import { Upload } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { EditStrategyForm } from "./types";

// 标签选项
const LABELS = [
  { value: "K7", label: "K7" },
  { value: "K8-1", label: "K8-1" },
  { value: "K8-2", label: "K8-2" },
  { value: "U8", label: "U8" },
  { value: "深空", label: "深空" },
  { value: "九红深空", label: "九红深空" },
];

// 难度选项
const DIFFICULTIES = [
  { value: "简单", label: "简单" },
  { value: "普通", label: "普通" },
  { value: "困难", label: "困难" },
  { value: "专家", label: "专家" },
];

interface StrategyFormDialogProps {
  // 模式：创建 / 编辑
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 表单数据
  form: EditStrategyForm;
  onFormChange: (updater: EditStrategyForm | ((prev: EditStrategyForm) => EditStrategyForm)) => void;
  // 提交回调
  onSubmit: () => void;
}

export function StrategyFormDialog({
  mode,
  open,
  onOpenChange,
  form,
  onFormChange,
  onSubmit,
}: StrategyFormDialogProps) {
  const isEdit = mode === "edit";
  const title = isEdit ? "编辑策略" : "新建策略";
  const submitText = isEdit ? "保存" : "创建";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="bg-[var(--color-panel)] rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-soft)]">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
          <button onClick={() => onOpenChange(false)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">策略名称</label>
            <Input
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              placeholder="例如: K8回响流"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">标签</label>
              <Select
                value={form.label}
                onChange={(e) => onFormChange({ ...form, label: e.target.value })}
              >
                {LABELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">难度</label>
              <Select
                value={form.difficulty}
                onChange={(e) => onFormChange({ ...form, difficulty: e.target.value })}
              >
                {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">输出值</label>
              <Input
                type="number"
                value={form.output_value}
                onChange={(e) => onFormChange({ ...form, output_value: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">防御值</label>
              <Input
                type="number"
                value={form.defense_value}
                onChange={(e) => onFormChange({ ...form, defense_value: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">预计成本</label>
            <Input
              type="number"
              value={form.estimated_cost}
              onChange={(e) => onFormChange({ ...form, estimated_cost: parseFloat(e.target.value) || 0 })}
              placeholder="预计花费的总成本（火）"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">预计收入区间</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={form.estimated_revenue_min}
                onChange={(e) => onFormChange({ ...form, estimated_revenue_min: parseFloat(e.target.value) || 0 })}
                placeholder="最低收入"
              />
              <span className="text-[var(--color-text-subtle)] text-sm">~</span>
              <Input
                type="number"
                value={form.estimated_revenue_max}
                onChange={(e) => onFormChange({ ...form, estimated_revenue_max: parseFloat(e.target.value) || 0 })}
                placeholder="最高收入"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">1小时刷图次数</label>
            <Input
              type="number"
              value={form.runs_per_hour}
              onChange={(e) => onFormChange({ ...form, runs_per_hour: parseFloat(e.target.value) || 0 })}
              placeholder="每小时可刷图的次数"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">备注</label>
            <Input
              value={form.remark}
              onChange={(e) => onFormChange({ ...form, remark: e.target.value })}
              placeholder="可选备注信息"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">加点图片</label>
            <label className="flex items-center gap-2 px-4 py-3 bg-[var(--color-panel)] text-[var(--color-text-muted)] rounded-lg hover:bg-[var(--color-panel-soft)] cursor-pointer w-full">
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
                    onFormChange(prev => ({ ...prev, image_url: base64 }));
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {form.image_url && (
              <div className="mt-2 p-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-panel-soft)] flex items-center gap-3">
                <img src={form.image_url} alt="加点图预览" className="max-h-24 rounded" />
                <button
                  onClick={() => onFormChange(prev => ({ ...prev, image_url: "" }))}
                  className="text-[var(--color-danger)] hover:text-[var(--color-danger)] text-xs"
                >
                  删除图片
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--color-border-soft)]">
          <button onClick={() => onOpenChange(false)} className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-panel-soft)] rounded-lg">取消</button>
          <button onClick={onSubmit} className="px-4 py-2 text-sm bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-black rounded-lg hover:opacity-90">{submitText}</button>
        </div>
      </div>
    </Dialog>
  );
}
