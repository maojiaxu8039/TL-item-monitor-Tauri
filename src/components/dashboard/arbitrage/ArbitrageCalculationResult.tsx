import { Edit3, Trash2, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Package, Coins } from "lucide-react";
import { type ArbitrageRecipe, type ArbitrageCalculationResult } from "@/lib/commands";
import { Surface } from "@/components/ui/Surface";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatPrice, formatProfitMargin, getRecipeTypeStyle, getRecipeTypeLabel } from "./utils";

interface ArbitrageResultRowProps {
  result: ArbitrageCalculationResult;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onEdit: (recipe: ArbitrageRecipe) => void;
  onDelete: (recipeId: string) => void;
  recipeMap: Map<string, ArbitrageRecipe>;
}

export function ArbitrageResultRow({ result, isExpanded, onToggleExpand, onEdit, onDelete, recipeMap }: ArbitrageResultRowProps) {
  const typeStyle = getRecipeTypeStyle(result.recipe_type);
  return (
    <div
      className="px-4 py-3 hover:bg-[rgba(255,184,0,0.04)] transition-colors cursor-pointer group"
      onClick={() => onToggleExpand(result.recipe_id)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(result.recipe_id); }}
            className="p-1 rounded-lg hover:bg-[var(--color-panel-soft)] transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-[var(--color-text-subtle)]" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[var(--color-text-subtle)]" />
            )}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--color-text)]">{result.recipe_name}</span>
            <span className={`px-2 py-0.5 text-xs rounded border ${typeStyle.badge}`}>
              {getRecipeTypeLabel(result.recipe_type)}
            </span>
            {result.used_lowest_price && (
              <StatusBadge variant="warning">最低价</StatusBadge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium">
              <span className="text-[var(--color-text-muted)]">利润: </span>
              <span className={result.is_profitable ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}>
                {result.is_profitable ? "+" : ""}{formatPrice(result.profit)} 火
              </span>
            </div>
            <div className="text-xs">
              <span className="text-[var(--color-text-subtle)]">利润率: </span>
              <span className={result.is_profitable ? "text-[var(--color-brand-gold)]" : "text-[var(--color-success)]"}>
                {formatProfitMargin(result.profit_margin)}
              </span>
            </div>
          </div>
          <div className={`p-1.5 rounded-lg ${result.is_profitable ? "bg-[rgba(239,68,68,0.12)]" : "bg-[rgba(34,197,94,0.12)]"}`}>
            {result.is_profitable ? (
              <TrendingUp className="h-4 w-4 text-[var(--color-danger)]" />
            ) : (
              <TrendingDown className="h-4 w-4 text-[var(--color-success)]" />
            )}
          </div>
          <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const recipe = recipeMap.get(result.recipe_id);
                if (recipe) onEdit(recipe);
              }}
              className="p-1.5 rounded-lg hover:bg-[var(--color-panel-soft)] transition-colors text-[var(--color-text-subtle)] hover:text-[var(--color-brand-gold)]"
              title="编辑配方"
            >
              <Edit3 className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(result.recipe_id); }}
              className="p-1.5 rounded-lg hover:bg-[rgba(239,68,68,0.1)] transition-colors text-[var(--color-text-subtle)] hover:text-[var(--color-danger)]"
              title="删除配方"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 pl-8 space-y-3" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-4">
            <Surface padding="sm" className="bg-[var(--color-panel-soft)] border-[var(--color-border)]">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-subtle)] mb-2">
                <Package className="w-3.5 h-3.5 text-[var(--color-danger)]" />
                原料成本
              </div>
              <div className="space-y-1">
                {result.ingredients_detail.map(ing => (
                  <div key={ing.item_name} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-text-muted)]">{ing.item_name} × {ing.count}</span>
                    <span className="text-[var(--color-text)] font-medium">{formatPrice(ing.unit_price)} × {ing.count} = {formatPrice(ing.total_cost)}</span>
                  </div>
                ))}
                <div className="pt-1.5 border-t border-[var(--color-border)] flex items-center justify-between font-medium">
                  <span className="text-[var(--color-text-muted)] text-sm">总成本</span>
                  <span className="text-[var(--color-danger)] text-sm">{formatPrice(result.total_cost)} 火</span>
                </div>
              </div>
            </Surface>
            <Surface padding="sm" className="bg-[var(--color-panel-soft)] border-[var(--color-border)]">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-subtle)] mb-2">
                <Coins className="w-3.5 h-3.5 text-[var(--color-success)]" />
                产物收入（12.5%手续费后）
              </div>
              <div className="space-y-1">
                {result.outputs_detail.map(out => (
                  <div key={out.item_name} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-text-muted)]">{out.item_name} × {out.count}</span>
                    <span className="text-[var(--color-text)] font-medium">{formatPrice(out.unit_price)} × {out.count} = {formatPrice(out.after_tax_value)}</span>
                  </div>
                ))}
                <div className="pt-1.5 border-t border-[var(--color-border)] flex items-center justify-between font-medium">
                  <span className="text-[var(--color-text-muted)] text-sm">税后总收入</span>
                  <span className="text-[var(--color-success)] text-sm">{formatPrice(result.total_output_value)} 火</span>
                </div>
              </div>
            </Surface>
          </div>
        </div>
      )}
    </div>
  );
}
