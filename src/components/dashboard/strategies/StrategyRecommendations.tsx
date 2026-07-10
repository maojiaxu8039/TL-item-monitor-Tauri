import {
  Award,
  Info,
  ThumbsUp,
  AlertTriangle,
  Zap,
  TrendingUp,
} from "lucide-react";
import type { StrategyWithCosts } from "@/lib/commands";
import type { StrategyRecommendation } from "./types";

interface StrategyRecommendationsProps {
  // 策略列表（用于空状态判断）
  strategies: StrategyWithCosts[];
  // 推荐列表
  recommendations: StrategyRecommendation[];
  // 策略映射，按 id 取策略详情
  strategyMap: Map<string, StrategyWithCosts>;
  // 推荐等级颜色
  getRecommendationLevelColor: (level: StrategyRecommendation["level"]) => string;
  // 推荐等级文本
  getRecommendationLevelText: (level: StrategyRecommendation["level"]) => string;
  // 风险等级颜色
  getRiskColor: (risk: StrategyRecommendation["risk_level"]) => string;
  // 预览图片
  onPreviewImage: (url: string) => void;
}

export function StrategyRecommendations({
  strategies,
  recommendations,
  strategyMap,
  getRecommendationLevelColor,
  getRecommendationLevelText,
  getRiskColor,
  onPreviewImage,
}: StrategyRecommendationsProps) {
  return (
    <div className="space-y-4">
      {strategies.length === 0 ? (
        <div className="bg-[var(--color-panel)] rounded-lg border border-[var(--color-border)] py-12 text-center">
          <Award className="w-12 h-12 text-[var(--color-text-subtle)] mx-auto mb-3" />
          <div className="text-sm text-[var(--color-text-subtle)]">暂无策略</div>
          <div className="text-xs text-[var(--color-text-subtle)] mt-1">请先创建策略后查看推荐</div>
        </div>
      ) : recommendations.length === 0 ? (
        <div className="bg-[var(--color-panel)] rounded-lg border border-[var(--color-border)] py-12 text-center">
          <Info className="w-12 h-12 text-[var(--color-text-subtle)] mx-auto mb-3" />
          <div className="text-sm text-[var(--color-text-subtle)]">策略数据不足</div>
          <div className="text-xs text-[var(--color-text-subtle)] mt-1">请添加成本和产出后查看推荐</div>
        </div>
      ) : (
        <div className="space-y-3">
          {recommendations.map((rec, index) => {
            const strategy = strategyMap.get(rec.strategy_id);
            return (
              <div
                key={rec.strategy_id}
                className="bg-[var(--color-panel)] rounded-lg border border-[var(--color-border)] p-4"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                    index === 0 ? "bg-[rgba(255,184,0,0.15)] text-[var(--color-brand-gold)]" :
                    index === 1 ? "bg-[var(--color-panel-soft)] text-[var(--color-text-subtle)]" :
                    index === 2 ? "bg-[rgba(255,106,0,0.15)] text-[var(--color-brand)]" :
                    "bg-[var(--color-panel-soft)] text-[var(--color-text-subtle)]"
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--color-text)]">{rec.strategy_name}</span>
                      <span className={`px-2 py-0.5 text-xs rounded border ${getRecommendationLevelColor(rec.level)}`}>
                        {getRecommendationLevelText(rec.level)}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded ${getRiskColor(rec.risk_level)}`}>
                        {rec.risk_level === "low" ? "低风险" : rec.risk_level === "medium" ? "中风险" : "高风险"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-[var(--color-text-subtle)]">
                      <span>评分: <span className="font-medium">{rec.score}</span></span>
                      <span>收益率: <span className={`font-medium ${rec.profit_ratio >= 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
                        {rec.profit_ratio >= 0 ? "+" : ""}{rec.profit_ratio.toFixed(1)}%
                      </span></span>
                      <span>预计收益: <span className={`font-medium ${rec.expected_profit_fire >= 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
                        {rec.expected_profit_fire >= 0 ? "+" : ""}{rec.expected_profit_fire.toFixed(0)}火
                      </span></span>
                    </div>
                  </div>
                  {strategy?.image_url && (
                    <img
                      src={strategy.image_url}
                      alt="加点图"
                      className="w-16 h-16 object-cover rounded-lg border border-[var(--color-border)] cursor-pointer hover:opacity-80"
                      onClick={() => onPreviewImage(strategy.image_url!)}
                    />
                  )}
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${
                      rec.score >= 80 ? "text-[var(--color-danger)]" :
                      rec.score >= 60 ? "text-[var(--color-brand-gold)]" :
                      rec.score >= 40 ? "text-[var(--color-brand)]" :
                      "text-[var(--color-success)]"
                    }`}>
                      {rec.score}
                    </div>
                    <div className="text-xs text-[var(--color-text-subtle)]">分</div>
                  </div>
                </div>
                {rec.reasons.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {rec.reasons.map((reason, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[rgba(34,197,94,0.1)] text-[var(--color-success)] text-xs rounded">
                        <ThumbsUp className="w-3 h-3" />
                        {reason}
                      </span>
                    ))}
                  </div>
                )}
                {rec.warnings.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {rec.warnings.map((warning, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[rgba(255,184,0,0.1)] text-[var(--color-brand-gold)] text-xs rounded">
                        <AlertTriangle className="w-3 h-3" />
                        {warning}
                      </span>
                    ))}
                  </div>
                )}
                {strategy && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-border-soft)] space-y-3">
                    <div className="flex items-center gap-4 text-xs text-[var(--color-text-subtle)] flex-wrap">
                      <span>单次成本: <span className="text-[var(--color-danger)]">{strategy.total_cost_fire.toFixed(0)}火</span></span>
                      <span>核心受益参考: <span className="text-[var(--color-success)]">{strategy.total_output_value.toFixed(0)}火</span></span>
                      {strategy.runs_per_hour > 0 && (
                        <span>时薪成本: <span className="text-[var(--color-danger)]">{strategy.hourly_cost_fire.toFixed(0)}火/时</span></span>
                      )}
                      {strategy.estimated_revenue_max > 0 && (
                        <span>预计收入: <span className="text-[var(--color-success)]">{strategy.estimated_revenue_min.toFixed(0)} ~ {strategy.estimated_revenue_max.toFixed(0)}火/时</span></span>
                      )}
                      <span>难度: {strategy.difficulty}</span>
                      {strategy.estimated_cost > 0 && strategy.total_cost_fire <= strategy.estimated_cost && (
                        <span className="px-2 py-0.5 text-xs bg-[rgba(34,197,94,0.15)] text-[var(--color-success)] rounded-full font-medium">可刷</span>
                      )}
                    </div>
                    {strategy.costs.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-[var(--color-text)] mb-1.5 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-[var(--color-danger)]" />
                          消耗材料
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {strategy.costs.map((cost) => (
                            <span key={cost.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[rgba(239,68,68,0.1)] text-[var(--color-danger)] text-xs rounded">
                              <span className="font-medium">{cost.item_name || cost.item_id}</span>
                              <span className="text-[var(--color-danger)]">×{cost.count}</span>
                              <span className="text-[var(--color-danger)]">{cost.total_fire.toFixed(0)}火</span>
                              {cost.is_realtime && <span className="text-[10px] bg-[var(--color-success)]/20 text-[var(--color-success)] px-1 rounded">实时</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {strategy.outputs.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-[var(--color-text)] mb-1.5 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3 text-[var(--color-success)]" />
                          核心受益参考
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {strategy.outputs.map((output) => (
                            <span key={output.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[rgba(34,197,94,0.1)] text-[var(--color-success)] text-xs rounded">
                              <span className="font-medium">{output.item_name}</span>
                              <span className="text-[var(--color-success)]">×{output.count}</span>
                              <span className="text-[var(--color-success)]">{(output.realtime_value * output.count).toFixed(0)}火</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
