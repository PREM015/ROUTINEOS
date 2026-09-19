import type { HabitTier } from '@prisma/client';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import type { ScoreBreakdown, HabitScoreContribution } from '@/types/score';
import { SCORING_WEIGHTS, SCORE_BANDS } from '@/config/scoring';
import { getGradeFromPercentage } from '@/types/score';

/**
 * Calculate Daily Score
 * Complete scoring calculation for a specific date
 */

const habitRepository = new HabitRepository();
const scoreRepository = new ScoreRepository();

export async function calculateDailyScore(
  userId: string,
  date: string,
  options?: {
    isMinimumDay?: boolean;
    minimumDayTemplateId?: string;
    isRestDay?: boolean;
  }
): Promise<ScoreBreakdown> {
  // Get all habits for user
  const habits = await habitRepository.findAll(userId, {
    status: 'ACTIVE',
    includeArchived: false,
  });

  // Get habit logs for the date
  const logs = await habitRepository.findLogsByDate(userId, date);
  const logMap = new Map(logs.map(log => [log.habitId, log]));

  // Categorize habits by tier
  const habitsByTier: Record<string, typeof habits> = {
    GROWTH: [],
    BONUS: [],
    LIFESTYLE: [],
    FLEXIBLE: [],
    ALTERNATIVE: [],
    OPTIONAL: [],
    EXPERIMENTAL: [],
    SPECIAL: [],
    JUST_FOR_FUN: [],
  };

  for (const habit of habits) {
    const tierKey = habit.tier.toString();
    if (habitsByTier[tierKey]) {
      habitsByTier[tierKey].push(habit);
    }
  }

  // Calculate core score (GROWTH habits)
  const coreContributions: HabitScoreContribution[] = [];
  let coreScore = 0;
  let coreMaxScore = 0;

  for (const habit of habitsByTier.GROWTH) {
    const log = logMap.get(habit.id);
    const points = habit.points || 10;
    const weight = SCORING_WEIGHTS.tiers.GROWTH;

    coreMaxScore += points * weight;

    if (log?.status === 'COMPLETED') {
      const contribution = points * weight;
      coreScore += contribution;

      coreContributions.push({
        habitId: habit.id,
        habitName: habit.name,
        tier: habit.tier,
        status: log.status,
        points,
        weight,
        contribution,
      });
    }
  }

  const corePercentage = coreMaxScore > 0 ? (coreScore / coreMaxScore) * 100 : 0;

  // Calculate growth score (BONUS, LIFESTYLE, FLEXIBLE)
  const growthContributions: HabitScoreContribution[] = [];
  let growthScore = 0;
  let growthMaxScore = 0;

  const growthTiers: HabitTier[] = ['BONUS', 'LIFESTYLE', 'FLEXIBLE'];
  for (const tier of growthTiers) {
    for (const habit of habitsByTier[tier]) {
      const log = logMap.get(habit.id);
      const points = habit.points || SCORING_WEIGHTS.tiers[tier] * 10;
      const weight = SCORING_WEIGHTS.tiers[tier];

      growthMaxScore += points * weight;

      if (log?.status === 'COMPLETED') {
        const contribution = points * weight;
        growthScore += contribution;

        growthContributions.push({
          habitId: habit.id,
          habitName: habit.name,
          tier: habit.tier,
          status: log.status,
          points,
          weight,
          contribution,
        });
      }
    }
  }

  const growthPercentage = growthMaxScore > 0 ? (growthScore / growthMaxScore) * 100 : 0;

  // Calculate bonus score (OPTIONAL, EXPERIMENTAL, etc.)
  const bonusContributions: HabitScoreContribution[] = [];
  let bonusScore = 0;
  let bonusMaxScore = 0;

  const bonusTiers: HabitTier[] = ['OPTIONAL', 'EXPERIMENTAL', 'SPECIAL', 'JUST_FOR_FUN'];
  for (const tier of bonusTiers) {
    for (const habit of habitsByTier[tier]) {
      const log = logMap.get(habit.id);
      const points = habit.points || SCORING_WEIGHTS.tiers[tier] * 10;
      const weight = SCORING_WEIGHTS.tiers[tier];

      bonusMaxScore += points * weight;

      if (log?.status === 'COMPLETED') {
        const contribution = points * weight;
        bonusScore += contribution;

        bonusContributions.push({
          habitId: habit.id,
          habitName: habit.name,
          tier: habit.tier,
          status: log.status,
          points,
          weight,
          contribution,
        });
      }
    }
  }

  const bonusPercentage = bonusMaxScore > 0 ? (bonusScore / bonusMaxScore) * 100 : 0;

  // Calculate total score
  const totalScore = coreScore + growthScore + bonusScore;
  const totalMaxScore = coreMaxScore + growthMaxScore + bonusMaxScore;
  const totalPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;

  // Apply minimum day multiplier if applicable
  let finalPercentage = totalPercentage;
  if (options?.isMinimumDay) {
    finalPercentage = totalPercentage * SCORING_WEIGHTS.minimumDayMultiplier;
  }

  const grade = getGradeFromPercentage(finalPercentage);

  const breakdown: ScoreBreakdown = {
    core: {
      score: Math.round(coreScore * 100) / 100,
      maxScore: Math.round(coreMaxScore * 100) / 100,
      percentage: Math.round(corePercentage * 100) / 100,
      habits: coreContributions,
    },
    growth: {
      score: Math.round(growthScore * 100) / 100,
      maxScore: Math.round(growthMaxScore * 100) / 100,
      percentage: Math.round(growthPercentage * 100) / 100,
      habits: growthContributions,
    },
    bonus: {
      score: Math.round(bonusScore * 100) / 100,
      maxScore: Math.round(bonusMaxScore * 100) / 100,
      percentage: Math.round(bonusPercentage * 100) / 100,
      habits: bonusContributions,
    },
    total: {
      score: Math.round(totalScore * 100) / 100,
      maxScore: Math.round(totalMaxScore * 100) / 100,
      percentage: Math.round(finalPercentage * 100) / 100,
    },
    grade,
  };

  // Save to database
  await scoreRepository.upsertScore(userId, date, {
    coreScore: breakdown.core.percentage,
    growthScore: breakdown.growth.percentage,
    bonusScore: breakdown.bonus.percentage,
    totalScore: breakdown.total.percentage,
    overallGrade: grade,
    isMinimumDay: options?.isMinimumDay || false,
    minimumDayTemplateId: options?.minimumDayTemplateId,
    isRestDay: options?.isRestDay || false,
    habitCompletionRate: totalMaxScore > 0
      ? (logs.filter(l => l.status === 'COMPLETED').length / habits.length) * 100
      : 0,
    calculationData: JSON.stringify({
      timestamp: new Date().toISOString(),
      breakdown,
      habitCount: habits.length,
      completedCount: logs.filter(l => l.status === 'COMPLETED').length,
    }),
  });

  return breakdown;
}

/**
 * Recalculate score for a date
 */
export async function recalculateScore(
  userId: string,
  date: string
): Promise<ScoreBreakdown> {
  const existingScore = await scoreRepository.findByDate(userId, date);

  return calculateDailyScore(userId, date, {
    isMinimumDay: existingScore?.isMinimumDay || false,
    minimumDayTemplateId: existingScore?.minimumDayTemplateId || undefined,
    isRestDay: existingScore?.isRestDay || false,
  });
}