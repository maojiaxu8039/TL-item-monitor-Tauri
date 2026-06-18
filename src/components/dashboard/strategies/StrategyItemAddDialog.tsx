import type { Dispatch, SetStateAction } from "react";
import { Search } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ItemData } from "@/lib/commands";
import type { CostForm, OutputForm } from "./types";

interface StrategyItemAddDialogProps {
  // 模式：成本 / 产出
  mode: "cost" | "output";
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  // 成本表单状态（cost 模式使用）
  costForm: CostForm;
  setCostForm: Dispatch<SetStateAction<CostForm>>;
  // 产出表单状态（output 模式使用）
  outputForm: OutputForm;
  setOutputForm: Dispatch<SetStateAction<OutputForm>>;
  // 物品搜索
  itemSearchResults: ItemData[];
  onSearch: (keyword: string) => void;
  onItemSelect: (item: ItemData) => void;
}

export function StrategyItemAddDialog({
  mode,
  open,
  onClose,
  onSubmit,
  costForm,
  setCostForm,
  outputForm,
  setOutputForm,
  itemSearchResults,
  onSearch,
  onItemSelect,
}: StrategyItemAddDialogProps) {
  const isCost = mode === "cost";
  const title = isCost ? "添加成本" : "添加产出";

  // 当前模式下的物品名称与数量
  const itemName = isCost ? costForm.item_name : outputForm.item_name;
  const count = isCost ? costForm.count : outputForm.count;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <div className="bg-[var(--color-panel)] rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-soft)]">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
          <button onClick={onClose} className="text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">搜索物品</label>
            <div className="relative">
              <Input
                value={itemName}
                onChange={(e) => {
                  if (isCost) {
                    setCostForm({ ...costForm, item_id: "", item_name: e.target.value });
                  } else {
                    setOutputForm({ ...outputForm, item_name: e.target.value, item_type: "" });
                  }
                  onSearch(e.target.value);
                }}
                placeholder="输入物品名称搜索"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-subtle)]" />
            </div>
            {itemSearchResults.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto border border-[var(--color-border)] rounded-lg">
                {itemSearchResults.map((item) => (
                  <div
                    key={item.item_id}
                    onClick={() => onItemSelect(item)}
                    className="px-3 py-2 text-sm hover:bg-[var(--color-brand)]/10 cursor-pointer border-b border-[var(--color-border-soft)] last:border-b-0"
                  >
                    <div className="text-[var(--color-text)]">{item.name}</div>
                    <div className="text-xs text-[var(--color-text-subtle)]">{item.item_type} - {item.price.toFixed(0)} 火</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 产出模式：物品类型（只读展示） */}
          {!isCost && (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">物品类型</label>
              <Input
                value={outputForm.item_type}
                onChange={(e) => setOutputForm({ ...outputForm, item_type: e.target.value })}
                placeholder="自动从搜索结果填充"
                disabled
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">数量</label>
            <Input
              type="number"
              value={count}
              onChange={(e) => {
                const value = parseFloat(e.target.value) || 1;
                if (isCost) {
                  setCostForm({ ...costForm, count: value });
                } else {
                  setOutputForm({ ...outputForm, count: value });
                }
              }}
            />
          </div>

          {/* 成本模式：关联实时火价 */}
          {isCost && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={costForm.is_realtime}
                onChange={(e) => setCostForm({ ...costForm, is_realtime: e.target.checked })}
                className="w-4 h-4"
              />
              <span>关联实时火价</span>
            </label>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--color-border-soft)]">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-panel-soft)] rounded-lg">取消</button>
          <button onClick={onSubmit} className="px-4 py-2 text-sm bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-black rounded-lg hover:opacity-90">添加</button>
        </div>
      </div>
    </Dialog>
  );
}
