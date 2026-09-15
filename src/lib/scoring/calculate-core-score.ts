import { SCORING_CONFIG } from "@/config/scoring";

export function calculateCoreScore(params: {
  nonNegCompleted: number;
  nonNegTotal: number;
  growthCompleted: number;
  growthTotal: number;
  bonusCompleted: number;
  bonusTotal: number;
  weightNonNeg: number;
  weightGrowth: number;
  weightBonus: number;
}): number {
  if (params.nonNegTotal === 0 && params.growthTotal === 0 && params.bonusTotal === 0) {
    return 100;
  }

  const nonNegScore = params.nonNegTotal > 0 
    ? (params.nonNegCompleted / params.nonNegTotal) * params.weightNonNeg 
    : params.weightNonNeg;

  const growthScore = params.growthTotal > 0 
    ? (params.growthCompleted / params.growthTotal) * params.weightGrowth 
    : params.weightGrowth;

  const bonusScore = params.bonusTotal > 0 
    ? (params.bonusCompleted / params.bonusTotal) * params.weightBonus 
    : 0;

  let total = nonNegScore + growthScore + bonusScore;
  return Math.min(100, Math.round(total));
}
