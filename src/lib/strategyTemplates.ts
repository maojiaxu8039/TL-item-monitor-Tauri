export interface StrategyTemplateCost {
  cost_type: string;
  item_keyword: string;
  default_count: number;
  is_realtime: boolean;
}

export interface StrategyTemplateOutput {
  item_keyword: string;
  item_type: string;
  default_count: number;
}

export interface StrategyTemplate {
  id: string;
  name: string;
  label: "K7" | "K8-1" | "K8-2" | "U8" | "深空" | "九红深空";
  difficulty: string;
  description: string;
  output_value: number;
  defense_value: number;
  remark: string;
  costs: StrategyTemplateCost[];
  outputs: StrategyTemplateOutput[];
}

export const strategyTemplates: StrategyTemplate[] = [
  {
    id: "k7-template",
    name: "K7 入门模板",
    label: "K7",
    difficulty: "简单",
    description: "K7入门刷图，适合新手玩家熟悉游戏",
    output_value: 60,
    defense_value: 70,
    remark: "门槛低，稳定收益，适合练手",
    costs: [
      { cost_type: "回响", item_keyword: "K7回响", default_count: 1, is_realtime: true },
      { cost_type: "信标", item_keyword: "信标", default_count: 1, is_realtime: true },
    ],
    outputs: [
      { item_keyword: "装备", item_type: "装备", default_count: 2 },
      { item_keyword: "材料", item_type: "材料", default_count: 8 },
    ],
  },
  {
    id: "k8-1-template",
    name: "K8-1 标准模板",
    label: "K8-1",
    difficulty: "普通",
    description: "K8-1标准刷图，适合大部分玩家",
    output_value: 75,
    defense_value: 60,
    remark: "性价比高，日常刷图首选",
    costs: [
      { cost_type: "回响", item_keyword: "K8-1回响", default_count: 1, is_realtime: true },
      { cost_type: "信标", item_keyword: "信标", default_count: 1, is_realtime: true },
    ],
    outputs: [
      { item_keyword: "传说装备", item_type: "装备", default_count: 1 },
      { item_keyword: "材料", item_type: "材料", default_count: 10 },
    ],
  },
  {
    id: "k8-2-template",
    name: "K8-2 进阶模板",
    label: "K8-2",
    difficulty: "困难",
    description: "K8-2进阶刷图，适合有基础的玩家",
    output_value: 85,
    defense_value: 50,
    remark: "收益更高，风险也更高",
    costs: [
      { cost_type: "回响", item_keyword: "K8-2回响", default_count: 1, is_realtime: true },
      { cost_type: "信标", item_keyword: "高级信标", default_count: 1, is_realtime: true },
      { cost_type: "探针", item_keyword: "探针", default_count: 2, is_realtime: true },
    ],
    outputs: [
      { item_keyword: "传说装备", item_type: "装备", default_count: 2 },
      { item_keyword: "稀有材料", item_type: "材料", default_count: 5 },
    ],
  },
  {
    id: "u8-template",
    name: "U8 高端模板",
    label: "U8",
    difficulty: "专家",
    description: "U8高端刷图，适合老玩家追求极限收益",
    output_value: 95,
    defense_value: 40,
    remark: "投入大，高风险高收益",
    costs: [
      { cost_type: "回响", item_keyword: "U8回响", default_count: 1, is_realtime: true },
      { cost_type: "信标", item_keyword: "高级信标", default_count: 2, is_realtime: true },
      { cost_type: "探针", item_keyword: "高级探针", default_count: 3, is_realtime: true },
      { cost_type: "罗盘", item_keyword: "罗盘", default_count: 1, is_realtime: true },
    ],
    outputs: [
      { item_keyword: "神话装备", item_type: "装备", default_count: 1 },
      { item_keyword: "稀有材料", item_type: "材料", default_count: 8 },
    ],
  },
  {
    id: "deep-space-template",
    name: "深空模板",
    label: "深空",
    difficulty: "困难",
    description: "深空玩法专用，追踪深空相关收益",
    output_value: 80,
    defense_value: 55,
    remark: "深空专属收益计算",
    costs: [
      { cost_type: "回响", item_keyword: "深空回响", default_count: 1, is_realtime: true },
      { cost_type: "信标", item_keyword: "深空信标", default_count: 1, is_realtime: true },
      { cost_type: "探针", item_keyword: "能源探针", default_count: 3, is_realtime: true },
    ],
    outputs: [
      { item_keyword: "深空碎片", item_type: "材料", default_count: 15 },
      { item_keyword: "深空结晶", item_type: "材料", default_count: 3 },
    ],
  },
  {
    id: "nine-red-deep-space-template",
    name: "九红深空模板",
    label: "九红深空",
    difficulty: "专家",
    description: "九红深空终极挑战，高难度高回报",
    output_value: 100,
    defense_value: 35,
    remark: "最高难度挑战，需要完整配置",
    costs: [
      { cost_type: "回响", item_keyword: "九红深空回响", default_count: 1, is_realtime: true },
      { cost_type: "信标", item_keyword: "九红信标", default_count: 2, is_realtime: true },
      { cost_type: "探针", item_keyword: "九红探针", default_count: 5, is_realtime: true },
      { cost_type: "罗盘", item_keyword: "九红罗盘", default_count: 1, is_realtime: true },
      { cost_type: "增益", item_keyword: "增益药", default_count: 2, is_realtime: true },
    ],
    outputs: [
      { item_keyword: "神话装备", item_type: "装备", default_count: 2 },
      { item_keyword: "九红材料", item_type: "材料", default_count: 10 },
    ],
  },
];

export function getTemplateById(id: string): StrategyTemplate | undefined {
  return strategyTemplates.find(t => t.id === id);
}

export function getTemplatesByLabel(label: StrategyTemplate["label"]): StrategyTemplate[] {
  return strategyTemplates.filter(t => t.label === label);
}
