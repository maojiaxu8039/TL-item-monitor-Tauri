import { strategyTemplates, type StrategyTemplate } from "@/lib/strategyTemplates";

interface StrategyTemplateLibraryProps {
  // 标签颜色计算函数
  getLabelColor: (label: string) => string;
  // 从模板创建策略
  onCreateFromTemplate: (template: StrategyTemplate) => void;
}

export function StrategyTemplateLibrary({
  getLabelColor,
  onCreateFromTemplate,
}: StrategyTemplateLibraryProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--color-text-subtle)]">选择模板快速创建策略，降低录入成本</p>
      <div className="grid grid-cols-3 gap-4">
        {strategyTemplates.map((template) => (
          <div
            key={template.id}
            className="bg-[var(--color-panel)] rounded-lg border border-[var(--color-border)] p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-medium text-[var(--color-text)]">{template.name}</h3>
                <p className="text-xs text-[var(--color-text-subtle)] mt-1">{template.description}</p>
              </div>
              <span className={`px-2 py-0.5 text-xs rounded ${getLabelColor(template.label)}`}>
                {template.label}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-[var(--color-text-subtle)] mb-3">
              <span>难度: {template.difficulty}</span>
              <span>输出: {template.output_value}</span>
              <span>防御: {template.defense_value}</span>
            </div>
            <div className="text-xs text-[var(--color-text-subtle)] mb-3">
              {template.remark}
            </div>
            <div className="flex flex-wrap gap-1 mb-3">
              {template.costs.slice(0, 3).map((cost, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-[rgba(239,68,68,0.1)] text-[var(--color-danger)] text-xs rounded">
                  {cost.cost_type}
                </span>
              ))}
              {template.costs.length > 3 && (
                <span className="px-1.5 py-0.5 bg-[var(--color-panel)] text-[var(--color-text-subtle)] text-xs rounded">
                  +{template.costs.length - 3}
                </span>
              )}
            </div>
            <button
              onClick={() => onCreateFromTemplate(template)}
              className="w-full px-3 py-2 text-sm bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-black rounded-lg hover:opacity-90 transition-opacity"
            >
              一键创建
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
