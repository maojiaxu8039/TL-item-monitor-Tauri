// 策略模块共享类型定义

// 编辑/创建策略表单
export interface EditStrategyForm {
  id?: string;
  name: string;
  label: string;
  difficulty: string;
  output_value: number;
  defense_value: number;
  remark: string;
  image_url: string;
}

// 成本表单
export interface CostForm {
  strategy_id: string;
  cost_type: string;
  item_id: string;
  item_name: string;
  count: number;
  is_realtime: boolean;
}

// 产出表单
export interface OutputForm {
  strategy_id: string;
  item_name: string;
  item_type: string;
  count: number;
}

// 策略页面标签页
export type StrategyTab = "strategies" | "templates" | "recommendations";

// 策略推荐信息
export interface StrategyRecommendation {
  strategy_id: string;
  strategy_name: string;
  score: number;
  level: "strong" | "good" | "watch" | "avoid";
  expected_profit_fire: number;
  profit_ratio: number;
  risk_level: "low" | "medium" | "high";
  reasons: string[];
  warnings: string[];
}
