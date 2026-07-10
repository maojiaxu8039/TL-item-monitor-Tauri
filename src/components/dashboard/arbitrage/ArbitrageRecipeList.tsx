import { Calculator } from "lucide-react";
import { type ArbitrageRecipe, type ArbitrageCalculationResult } from "@/lib/commands";
import { Surface } from "@/components/ui/Surface";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { ArbitrageResultRow } from "./ArbitrageCalculationResult";
import { getRecipeTypeLabel, formatTime } from "./utils";

interface ArbitrageRecipeListProps {
  filteredResults: ArbitrageCalculationResult[];
  expandedIds: Set<string>;
  typeFilter: string;
  setTypeFilter: (type: string) => void;
  loading: boolean;
  lastCalculatedAt: number | null;
  recipeMap: Map<string, ArbitrageRecipe>;
  onToggleExpand: (id: string) => void;
  onEdit: (recipe: ArbitrageRecipe) => void;
  onDelete: (recipeId: string) => void;
  onRefresh: () => void;
}

export function ArbitrageRecipeList({
  filteredResults,
  expandedIds,
  typeFilter,
  setTypeFilter,
  loading,
  lastCalculatedAt,
  recipeMap,
  onToggleExpand,
  onEdit,
  onDelete,
  onRefresh,
}: ArbitrageRecipeListProps) {
  return (
    <Surface padding="none">
      <div className="px-4 py-3 border-b border-[var(--color-border-soft)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[var(--color-text)]">套利结果</span>
          <div className="flex items-center gap-1 bg-[var(--color-panel-soft)] rounded-lg p-1">
            {["all", "decompose", "synthesize", "exchange"].map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  typeFilter === type
                    ? "bg-[var(--color-brand)]/20 text-[var(--color-brand)] font-medium border border-[var(--color-brand)]/30"
                    : "text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
                }`}
              >
                {type === "all" ? "全部" : getRecipeTypeLabel(type)}
              </button>
            ))}
          </div>
        </div>
        {lastCalculatedAt && (
          <span className="text-xs text-[var(--color-text-subtle)]">
            计算时间: {formatTime(lastCalculatedAt)}
          </span>
        )}
      </div>
      <div className="divide-y divide-[var(--color-border-soft)]">
        {filteredResults.length === 0 ? (
          <div className="px-4 py-8 text-center">
            {loading ? (
              <div className="text-sm text-[var(--color-text-subtle)]">加载中...</div>
            ) : (
              <EmptyState
                title="暂无套利数据"
                description="点击刷新价格获取最新结果"
                icon={Calculator}
                compact
                action={<Button size="sm" variant="outline" onClick={onRefresh}>刷新价格</Button>}
              />
            )}
          </div>
        ) : (
          filteredResults.map(result => (
            <ArbitrageResultRow
              key={result.recipe_id}
              result={result}
              isExpanded={expandedIds.has(result.recipe_id)}
              recipeMap={recipeMap}
              onToggleExpand={onToggleExpand}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </Surface>
  );
}
