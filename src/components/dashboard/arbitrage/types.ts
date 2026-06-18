import { type CreateIngredientRequest, type CreateOutputRequest } from "@/lib/commands";

// 新建配方表单状态
export interface NewRecipe {
  name: string;
  recipe_type: string;
  enabled: boolean;
  ingredients: CreateIngredientRequest[];
  outputs: CreateOutputRequest[];
}

// 编辑配方基本信息表单状态
export interface EditRecipeInfo {
  name: string;
  recipe_type: string;
  enabled: boolean;
}

// 原料/产物通用条目结构（CreateIngredientRequest 与 CreateOutputRequest 结构一致）
export interface ComponentItem {
  item_name: string;
  count: number;
}
