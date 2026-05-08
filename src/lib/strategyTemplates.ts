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
  label: "K8" | "U8" | "深空" | "普通";
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
    id: "k8-standard",
    name: "K8 标准刷图",
    label: "K8",
    difficulty: "中等",
    description: "常规K8刷图，适合有一定基础的玩家",
    output_value: 80,
    defense_value: 60,
    remark: "稳定产出，适合日常刷图",
    costs: [
      { cost_type: "门票", item_keyword: "钥匙", default_count: 1, is_realtime: false },
      { cost_type: "药品", item_keyword: "药水", default_count: 5, is_realtime: true },
      { cost_type: "耐久", item_keyword: "耐久", default_count: 1, is_realtime: false },
    ],
    outputs: [
      { item_keyword: "传说", item_type: "装备", default_count: 1 },
      { item_keyword: "材料", item_type: "材料", default_count: 10 },
    ],
  },
  {
    id: "u8-high-invest",
    name: "U8 高投入刷图",
    label: "U8",
    difficulty: "较高",
    description: "高门槛高收益，适合老玩家追求极限收益",
    output_value: 95,
    defense_value: 40,
    remark: "投入大，风险高，但潜在收益也高",
    costs: [
      { cost_type: "门票", item_keyword: "高级钥匙", default_count: 2, is_realtime: false },
      { cost_type: "药品", item_keyword: "大药水", default_count: 10, is_realtime: true },
      { cost_type: "耐久", item_keyword: "高级耐久", default_count: 2, is_realtime: false },
      { cost_type: "增益", item_keyword: "增益药", default_count: 1, is_realtime: true },
    ],
    outputs: [
      { item_keyword: "神话", item_type: "装备", default_count: 1 },
      { item_keyword: "稀有材料", item_type: "材料", default_count: 5 },
      { item_keyword: "金币", item_type: "货币", default_count: 1000 },
    ],
  },
  {
    id: "deep-space",
    name: "深空收益模板",
    label: "深空",
    difficulty: "高",
    description: "深空玩法专用，追踪深空相关收益",
    output_value: 70,
    defense_value: 50,
    remark: "深空专属收益计算",
    costs: [
      { cost_type: "门票", item_keyword: "深空门票", default_count: 1, is_realtime: false },
      { cost_type: "能源", item_keyword: "能源", default_count: 20, is_realtime: true },
      { cost_type: "护盾", item_keyword: "护盾", default_count: 5, is_realtime: true },
    ],
    outputs: [
      { item_keyword: "深空碎片", item_type: "材料", default_count: 15 },
      { item_keyword: "深空结晶", item_type: "材料", default_count: 3 },
    ],
  },
  {
    id: "low-cost-stable",
    name: "低成本稳定模板",
    label: "普通",
    difficulty: "低",
    description: "小投入试跑，适合新手或休闲玩家",
    output_value: 50,
    defense_value: 80,
    remark: "低成本低风险，稳定收益",
    costs: [
      { cost_type: "门票", item_keyword: "普通钥匙", default_count: 1, is_realtime: false },
      { cost_type: "药品", item_keyword: "小药水", default_count: 3, is_realtime: true },
    ],
    outputs: [
      { item_keyword: "普通装备", item_type: "装备", default_count: 2 },
      { item_keyword: "杂物", item_type: "材料", default_count: 5 },
    ],
  },
  {
    id: "high-risk-high-reward",
    name: "高风险高收益模板",
    label: "普通",
    difficulty: "高",
    description: "波动策略，用于推荐榜风险展示",
    output_value: 100,
    defense_value: 30,
    remark: "风险较高，收益波动大",
    costs: [
      { cost_type: "门票", item_keyword: "稀有钥匙", default_count: 3, is_realtime: false },
      { cost_type: "药品", item_keyword: "稀有药水", default_count: 15, is_realtime: true },
      { cost_type: "耐久", item_keyword: "高级耐久", default_count: 3, is_realtime: false },
      { cost_type: "增益", item_keyword: "全增益", default_count: 2, is_realtime: true },
    ],
    outputs: [
      { item_keyword: "顶级装备", item_type: "装备", default_count: 2 },
      { item_keyword: "稀有材料", item_type: "材料", default_count: 10 },
      { item_keyword: "大量金币", item_type: "货币", default_count: 5000 },
    ],
  },
];

export function getTemplateById(id: string): StrategyTemplate | undefined {
  return strategyTemplates.find(t => t.id === id);
}

export function getTemplatesByLabel(label: StrategyTemplate["label"]): StrategyTemplate[] {
  return strategyTemplates.filter(t => t.label === label);
}
