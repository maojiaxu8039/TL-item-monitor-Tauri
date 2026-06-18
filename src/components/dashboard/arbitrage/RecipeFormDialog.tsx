import { type Dispatch, type SetStateAction } from "react";
import { Plus, X, Search, ToggleLeft, ToggleRight } from "lucide-react";
import { type ItemSearchResult, type CreateIngredientRequest, type CreateOutputRequest } from "@/lib/commands";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { type NewRecipe, type EditRecipeInfo } from "./types";
import { RECIPE_TYPES, formatPrice } from "./utils";

interface CreateRecipeDialogProps {
  open: boolean;
  onClose: () => void;
  newRecipe: NewRecipe;
  setNewRecipe: Dispatch<SetStateAction<NewRecipe>>;
  ingredientResults: ItemSearchResult[];
  ingredientDraft: CreateIngredientRequest;
  setIngredientDraft: Dispatch<SetStateAction<CreateIngredientRequest>>;
  setIngredientResults: Dispatch<SetStateAction<ItemSearchResult[]>>;
  outputResults: ItemSearchResult[];
  outputDraft: CreateOutputRequest;
  setOutputDraft: Dispatch<SetStateAction<CreateOutputRequest>>;
  setOutputResults: Dispatch<SetStateAction<ItemSearchResult[]>>;
  onSearchIngredients: (keyword: string) => void;
  onSearchOutputs: (keyword: string) => void;
  onAddIngredientFromDraft: () => void;
  onAddOutputFromDraft: () => void;
  onRemoveNewIngredient: (itemName: string) => void;
  onRemoveNewOutput: (itemName: string) => void;
  onCreate: () => void;
}

export function CreateRecipeDialog({
  open,
  onClose,
  newRecipe,
  setNewRecipe,
  ingredientResults,
  ingredientDraft,
  setIngredientDraft,
  setIngredientResults,
  outputResults,
  outputDraft,
  setOutputDraft,
  setOutputResults,
  onSearchIngredients,
  onSearchOutputs,
  onAddIngredientFromDraft,
  onAddOutputFromDraft,
  onRemoveNewIngredient,
  onRemoveNewOutput,
  onCreate,
}: CreateRecipeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <div className="bg-[var(--color-panel)] rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-soft)]">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">新增套利配方</h3>
          <button onClick={onClose} className="text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] transition-colors">✕</button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">配方名称</label>
            <Input
              value={newRecipe.name}
              onChange={e => setNewRecipe(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例如：传说装备分解"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">配方类型</label>
            <Select
              value={newRecipe.recipe_type}
              onChange={e => setNewRecipe(prev => ({ ...prev, recipe_type: e.target.value }))}
            >
              {RECIPE_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </Select>
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--color-text)]">原料列表</label>
              <button
                onClick={() => setNewRecipe(prev => ({ ...prev, enabled: !prev.enabled }))}
                className="flex items-center gap-1 text-sm text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] transition-colors"
              >
                {newRecipe.enabled ? <ToggleRight className="h-5 w-5 text-[var(--color-success)]" /> : <ToggleLeft className="h-5 w-5" />}
                启用
              </button>
            </div>
            {newRecipe.ingredients.length > 0 && (
              <div className="mb-2 space-y-1">
                {newRecipe.ingredients.map(ing => (
                  <div key={ing.item_name} className="flex items-center justify-between px-3 py-2 bg-[var(--color-panel-soft)] rounded-lg text-sm border border-[var(--color-border)]">
                    <span className="text-[var(--color-text)]">{ing.item_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--color-text-subtle)]">× {ing.count}</span>
                      <button onClick={() => onRemoveNewIngredient(ing.item_name)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-subtle)]" />
                <Input
                  value={ingredientDraft.item_name}
                  onChange={e => {
                    setIngredientDraft(prev => ({ ...prev, item_name: e.target.value }));
                    onSearchIngredients(e.target.value);
                  }}
                  placeholder="搜索物品..."
                  className="pl-10"
                />
              </div>
              <Input
                type="number"
                value={ingredientDraft.count}
                onChange={e => setIngredientDraft(prev => ({ ...prev, count: parseInt(e.target.value) || 1 }))}
                className="w-20 text-center"
                min="1"
              />
              <Button variant="outline" size="sm" onClick={onAddIngredientFromDraft}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {ingredientResults.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border-soft)]">
                {ingredientResults.map(item => (
                  <button
                    type="button"
                    key={item.item_id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIngredientDraft({ item_name: item.name, count: 1 });
                      setIngredientResults([]);
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

          {/* Outputs */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">产物列表</label>
            {newRecipe.outputs.length > 0 && (
              <div className="mb-2 space-y-1">
                {newRecipe.outputs.map(out => (
                  <div key={out.item_name} className="flex items-center justify-between px-3 py-2 bg-[var(--color-panel-soft)] rounded-lg text-sm border border-[var(--color-border)]">
                    <span className="text-[var(--color-text)]">{out.item_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--color-text-subtle)]">× {out.count}</span>
                      <button onClick={() => onRemoveNewOutput(out.item_name)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-subtle)]" />
                <Input
                  value={outputDraft.item_name}
                  onChange={e => {
                    setOutputDraft(prev => ({ ...prev, item_name: e.target.value }));
                    onSearchOutputs(e.target.value);
                  }}
                  placeholder="搜索产物..."
                  className="pl-10"
                />
              </div>
              <Input
                type="number"
                value={outputDraft.count}
                onChange={e => setOutputDraft(prev => ({ ...prev, count: parseInt(e.target.value) || 1 }))}
                className="w-20 text-center"
                min="1"
              />
              <Button variant="outline" size="sm" onClick={onAddOutputFromDraft}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {outputResults.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border-soft)]">
                {outputResults.map(item => (
                  <button
                    type="button"
                    key={item.item_id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOutputDraft({ item_name: item.name, count: 1 });
                      setOutputResults([]);
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
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border-soft)]">
          <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button variant="default" size="sm" onClick={onCreate}>创建配方</Button>
        </div>
      </div>
    </Dialog>
  );
}

interface EditRecipeDialogProps {
  open: boolean;
  onClose: () => void;
  editRecipe: EditRecipeInfo;
  setEditRecipe: Dispatch<SetStateAction<EditRecipeInfo>>;
  editIngredients: CreateIngredientRequest[];
  editOutputs: CreateOutputRequest[];
  ingredientSearch: string;
  ingredientResults: ItemSearchResult[];
  outputSearch: string;
  outputResults: ItemSearchResult[];
  onSearchIngredients: (keyword: string) => void;
  onSearchOutputs: (keyword: string) => void;
  onAddEditIngredient: (item: ItemSearchResult) => void;
  onAddEditOutput: (item: ItemSearchResult) => void;
  onRemoveEditIngredient: (itemName: string) => void;
  onRemoveEditOutput: (itemName: string) => void;
  onUpdateEditIngredientCount: (itemName: string, count: number) => void;
  onUpdateEditOutputCount: (itemName: string, count: number) => void;
  onSave: () => void;
}

export function EditRecipeDialog({
  open,
  onClose,
  editRecipe,
  setEditRecipe,
  editIngredients,
  editOutputs,
  ingredientSearch,
  ingredientResults,
  outputSearch,
  outputResults,
  onSearchIngredients,
  onSearchOutputs,
  onAddEditIngredient,
  onAddEditOutput,
  onRemoveEditIngredient,
  onRemoveEditOutput,
  onUpdateEditIngredientCount,
  onUpdateEditOutputCount,
  onSave,
}: EditRecipeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <div className="bg-[var(--color-panel)] rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-soft)] shrink-0">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">编辑配方</h3>
          <button onClick={onClose} className="text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)] transition-colors">✕</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">配方名称</label>
            <Input
              value={editRecipe.name}
              onChange={e => setEditRecipe(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">配方类型</label>
            <Select
              value={editRecipe.recipe_type}
              onChange={e => setEditRecipe(prev => ({ ...prev, recipe_type: e.target.value }))}
            >
              {RECIPE_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </Select>
          </div>

          {/* Edit Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--color-text)]">原料列表</label>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-subtle)]" />
                  <Input
                    value={ingredientSearch}
                    onChange={e => onSearchIngredients(e.target.value)}
                    placeholder="搜索添加..."
                    className="pl-8 h-8 text-xs w-36"
                  />
                </div>
                <button
                  onClick={() => setEditRecipe(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className="text-xs text-[var(--color-text-subtle)] flex items-center gap-1 hover:text-[var(--color-text-muted)] transition-colors"
                >
                  {editRecipe.enabled ? <ToggleRight className="h-4 w-4 text-[var(--color-success)]" /> : <ToggleLeft className="h-4 w-4" />}
                  启用
                </button>
              </div>
            </div>
            {editIngredients.length > 0 ? (
              <div className="space-y-1 mb-2">
                {editIngredients.map(ing => (
                  <div key={ing.item_name} className="flex items-center gap-2 px-3 py-2 bg-[var(--color-panel-soft)] rounded-lg border border-[var(--color-border)]">
                    <span className="flex-1 text-sm text-[var(--color-text)]">{ing.item_name}</span>
                    <Input
                      type="number"
                      value={ing.count}
                      onChange={e => onUpdateEditIngredientCount(ing.item_name, parseInt(e.target.value) || 1)}
                      className="w-16 h-7 text-xs text-center px-1"
                      min="1"
                    />
                    <button onClick={() => onRemoveEditIngredient(ing.item_name)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-colors p-1">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[var(--color-text-subtle)] mb-2 py-2 text-center border border-dashed border-[var(--color-border)] rounded-lg">暂无原料</div>
            )}
            {ingredientResults.length > 0 && (
              <div className="max-h-32 overflow-y-auto border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border-soft)]">
                {ingredientResults.map(item => (
                  <button
                    key={item.item_id}
                    onClick={() => onAddEditIngredient(item)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-brand)]/10 transition-colors flex items-center justify-between"
                  >
                    <span className="text-[var(--color-text)]">{item.name}</span>
                    <span className="text-[var(--color-text-subtle)] text-xs">{formatPrice(item.price)} 火</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Edit Outputs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--color-text)]">产物列表</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-subtle)]" />
                <Input
                  value={outputSearch}
                  onChange={e => onSearchOutputs(e.target.value)}
                  placeholder="搜索添加..."
                  className="pl-8 h-8 text-xs w-36"
                />
              </div>
            </div>
            {editOutputs.length > 0 ? (
              <div className="space-y-1 mb-2">
                {editOutputs.map(out => (
                  <div key={out.item_name} className="flex items-center gap-2 px-3 py-2 bg-[var(--color-panel-soft)] rounded-lg border border-[var(--color-border)]">
                    <span className="flex-1 text-sm text-[var(--color-text)]">{out.item_name}</span>
                    <Input
                      type="number"
                      value={out.count}
                      onChange={e => onUpdateEditOutputCount(out.item_name, parseInt(e.target.value) || 1)}
                      className="w-16 h-7 text-xs text-center px-1"
                      min="1"
                    />
                    <button onClick={() => onRemoveEditOutput(out.item_name)} className="text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] transition-colors p-1">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[var(--color-text-subtle)] mb-2 py-2 text-center border border-dashed border-[var(--color-border)] rounded-lg">暂无产物</div>
            )}
            {outputResults.length > 0 && (
              <div className="max-h-32 overflow-y-auto border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border-soft)]">
                {outputResults.map(item => (
                  <button
                    key={item.item_id}
                    onClick={() => onAddEditOutput(item)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-brand)]/10 transition-colors flex items-center justify-between"
                  >
                    <span className="text-[var(--color-text)]">{item.name}</span>
                    <span className="text-[var(--color-text-subtle)] text-xs">{formatPrice(item.price)} 火</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border-soft)] shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button variant="default" size="sm" onClick={onSave}>保存</Button>
        </div>
      </div>
    </Dialog>
  );
}
