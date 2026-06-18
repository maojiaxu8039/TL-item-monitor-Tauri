import { X, Search } from "lucide-react";
import { type ItemSearchResult } from "@/lib/commands";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type ComponentItem } from "./types";
import { formatPrice } from "./utils";

interface ComponentEditDialogProps {
  kind: "ingredient" | "output";
  open: boolean;
  onClose: () => void;
  items: ComponentItem[];
  search: string;
  results: ItemSearchResult[];
  onSearch: (keyword: string) => void;
  onAdd: (item: ItemSearchResult) => void;
  onRemove: (itemName: string) => void;
  onUpdateCount: (itemName: string, count: number) => void;
  onSave: () => void;
}

export function ComponentEditDialog({
  kind,
  open,
  onClose,
  items,
  search,
  results,
  onSearch,
  onAdd,
  onRemove,
  onUpdateCount,
  onSave,
}: ComponentEditDialogProps) {
  const title = kind === "ingredient" ? "编辑原料" : "编辑产物";
  const emptyText = kind === "ingredient" ? "暂无原料" : "暂无产物";
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <div className="bg-[var(--color-panel)] rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-soft)]">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
          <button onClick={onClose} className="text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] transition-colors">✕</button>
        </div>
        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {items.length > 0 ? (
            <div className="space-y-1.5">
              {items.map(item => (
                <div key={item.item_name} className="flex items-center gap-2 px-3 py-2 bg-[var(--color-panel-soft)] rounded-lg border border-[var(--color-border)]">
                  <span className="flex-1 text-sm text-[var(--color-text)]">{item.item_name}</span>
                  <Input
                    type="number"
                    value={item.count}
                    onChange={e => onUpdateCount(item.item_name, parseInt(e.target.value) || 1)}
                    className="w-16 h-7 text-xs text-center px-1"
                    min="1"
                  />
                  <button onClick={() => onRemove(item.item_name)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-colors p-1">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[var(--color-text-subtle)] py-4 text-center border border-dashed border-[var(--color-border)] rounded-lg">{emptyText}</div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-subtle)]" />
            <Input
              value={search}
              onChange={e => onSearch(e.target.value)}
              placeholder="搜索添加物品..."
              className="pl-10"
            />
          </div>
          {results.length > 0 && (
            <div className="max-h-40 overflow-y-auto border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border-soft)]">
              {results.map(item => (
                <button
                  type="button"
                  key={item.item_id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd(item);
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
          <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button variant="default" size="sm" onClick={onSave}>保存</Button>
        </div>
      </div>
    </Dialog>
  );
}
