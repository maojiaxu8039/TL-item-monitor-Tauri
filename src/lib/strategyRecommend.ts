import type { StrategyWithCosts } from "@/lib/commands";
import type { StrategyRecommendation } from "@/components/dashboard/strategies/types";

// 高难度策略标签（不同来源使用不同命名，统一收敛到常量数组）
export const HIGH_DIFFICULTY_LEVELS = ["专家", "困难", "地狱", "噩梦"] as const;

// 根据策略成本/产出数据计算推荐列表
export function calculateRecommendations(strategies: StrategyWithCosts[]): StrategyRecommendation[] {
  if (strategies.length === 0) return [];

  return strategies.map(strategy => {
    const reasons: string[] = [];
    const warnings: string[] = [];
    let score = 50;

    const profitRatio = strategy.profit_ratio;
    const netProfit = strategy.total_output_value - strategy.total_cost_fire;
    const hasCosts = strategy.costs.length > 0;
    const hasOutputs = strategy.outputs.length > 0;

    if (!hasCosts || !hasOutputs) {
      warnings.push("成本或产出数据不完整");
    }

    if (profitRatio > 20) {
      score += 30;
      reasons.push(`收益率极高 (+${profitRatio.toFixed(1)}%)`);
    } else if (profitRatio > 10) {
      score += 20;
      reasons.push(`收益率较高 (+${profitRatio.toFixed(1)}%)`);
    } else if (profitRatio > 0) {
      score += 10;
      reasons.push(`收益率正向 (+${profitRatio.toFixed(1)}%)`);
    } else if (profitRatio < -10) {
      score -= 30;
      warnings.push(`收益率过低 (${profitRatio.toFixed(1)}%)`);
    } else if (profitRatio < 0) {
      score -= 15;
      warnings.push(`收益为负 (${profitRatio.toFixed(1)}%)`);
    }

    if (netProfit > 100) {
      score += 15;
      reasons.push(`净收益较高 (+${netProfit.toFixed(0)}火)`);
    } else if (netProfit < -100) {
      score -= 20;
      warnings.push(`净收益为负 (${netProfit.toFixed(0)}火)`);
    }

    const hasRealtimeCosts = strategy.costs.some(c => c.is_realtime);
    if (hasRealtimeCosts) {
      score += 5;
      reasons.push("使用实时火价计算");
    }

    const difficulty = strategy.difficulty;
    const isHighDifficulty = HIGH_DIFFICULTY_LEVELS.includes(difficulty as (typeof HIGH_DIFFICULTY_LEVELS)[number]);
    if (isHighDifficulty) {
      score -= 5;
      warnings.push("高难度策略，风险较高");
    }

    score = Math.max(0, Math.min(100, score));

    let level: StrategyRecommendation["level"];
    if (score >= 80) level = "strong";
    else if (score >= 60) level = "good";
    else if (score >= 40) level = "watch";
    else level = "avoid";

    let risk: StrategyRecommendation["risk_level"];
    if (isHighDifficulty || profitRatio < -10) {
      risk = "high";
    } else if (profitRatio < 0) {
      risk = "medium";
    } else {
      risk = "low";
    }

    return {
      strategy_id: strategy.id,
      strategy_name: strategy.name,
      score,
      level,
      expected_profit_fire: netProfit,
      profit_ratio: profitRatio,
      risk_level: risk,
      reasons,
      warnings,
    };
  }).sort((a, b) => b.score - a.score);
}
