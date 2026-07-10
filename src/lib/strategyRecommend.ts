import type { StrategyWithCosts } from "@/lib/commands";
import type { StrategyRecommendation } from "@/components/dashboard/strategies/types";

export const HIGH_DIFFICULTY_LEVELS = ["专家", "困难", "地狱", "噩梦"] as const;

export function calculateRecommendations(strategies: StrategyWithCosts[]): StrategyRecommendation[] {
  if (strategies.length === 0) return [];

  return strategies.map(strategy => {
    const reasons: string[] = [];
    const warnings: string[] = [];
    let score = 50;

    const profitRatio = strategy.profit_ratio;
    const hasCosts = strategy.costs.length > 0;
    const hasOutputs = strategy.outputs.length > 0;

    const hasHourlyData = strategy.runs_per_hour > 0 && strategy.estimated_revenue_max > 0;
    const avgRevenue = hasHourlyData
      ? (strategy.estimated_revenue_min + strategy.estimated_revenue_max) / 2
      : 0;
    const hourlyNetProfit = hasHourlyData
      ? avgRevenue - strategy.hourly_cost_fire
      : 0;
    const legacyNetProfit = strategy.total_output_value - strategy.total_cost_fire;
    const expectedProfitFire = hasHourlyData ? hourlyNetProfit : legacyNetProfit;

    const costBelowEstimated =
      strategy.estimated_cost > 0 && strategy.total_cost_fire <= strategy.estimated_cost;

    if (!hasCosts || !hasOutputs) {
      warnings.push("成本或产出数据不完整");
    }

    if (hasHourlyData) {
      if (hourlyNetProfit > 0) {
        reasons.push(`时薪净收益 +${hourlyNetProfit.toFixed(0)}火/时`);
        if (hourlyNetProfit > 500) {
          score += 30;
          reasons.push("时薪收益极高");
        } else if (hourlyNetProfit > 200) {
          score += 20;
        } else {
          score += 10;
        }
      } else {
        warnings.push(`时薪净收益 ${hourlyNetProfit.toFixed(0)}火/时`);
        if (hourlyNetProfit < -200) {
          score -= 30;
        } else {
          score -= 15;
        }
      }
    } else {
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

      if (legacyNetProfit > 100) {
        score += 15;
        reasons.push(`净收益较高 (+${legacyNetProfit.toFixed(0)}火)`);
      } else if (legacyNetProfit < -100) {
        score -= 20;
        warnings.push(`净收益为负 (${legacyNetProfit.toFixed(0)}火)`);
      }
    }

    if (costBelowEstimated) {
      score += 15;
      reasons.push("实际成本低于预计成本，可以刷");
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
      expected_profit_fire: expectedProfitFire,
      profit_ratio: profitRatio,
      risk_level: risk,
      reasons,
      warnings,
    };
  }).sort((a, b) => b.score - a.score);
}
