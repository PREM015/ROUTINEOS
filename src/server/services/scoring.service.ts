import type { DailyScore, HabitLog, HabitTier } from '@prisma/client';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { computeDayScore } from '@/server/domain/scoring/score-calculator';
import {
  DEFAULT_TIER_WEIGHTS,
  tierToPoints,
  weightForTier,
} from '@/server/domain/scoring/tier-weights';
import type { TierWeights } from '@/server/domain/scoring/tier-weights';
import { CALCULATION_RULES } from '@/config/scoring';
import {
  calculateScoreSchema,
  scoreQuerySchema,
} from '@/lib/validation/score.schema';
import type {
  CalculateDailyScoreInput,
  DailyScoreWithContext,
  HabitScoreContribution,
  ScoreBreakdown,
  ScoreHistoryEntry,
  ScoreHistoryRange,
} from '@/types/score';
import { getGradeFromPercentage, isValidScoreGrade } from '@/types/score';

/**
 * Score Service
 * Daily score calculation, history and analytics for a user
 */

// Tier groupings (canonical mapping shared with lib/scoring/calculate-daily-score):
// core = GROWTH; growth = BONUS + LIFESTYLE + FLEXIBLE;
// bonus = OPTIONAL + EXPERIMENTAL + SPECIAL + JUST_FOR_FUN.
const CORE_TIERS: HabitTier[] = ['GROWTH'];
const GROWTH_TIERS: HabitTier[] = ['BONUS', 'LIFESTYLE', 'FLEXIBLE'];
const BONUS_TIERS: HabitTier[] = ['OPTIONAL', 'EXPERIMENTAL', 'SPECIAL', 'JUST_FOR_FUN'];
const SCORED_TIERS: HabitTier[] = [...CORE_TIERS, ...GROWTH_TIERS, ...BONUS_TIERS];

type HabitForScoring = {
  id: string;
  name: string;
  tier: HabitTier;
  points: number | null;
};

export class ScoringService {
  private habitRepository: HabitRepository;
  private scoreRepository: ScoreRepository;
  private userRepository: UserRepository;
  private routineRepository: RoutineRepository;

  constructor() {
    this.habitRepository = new HabitRepository();
    this.scoreRepository = new ScoreRepository();
    this.userRepository = new UserRepository();
    this.routineRepository = new RoutineRepository();
  }

  /**
   * Calculate and persist the daily score for a date
   */
  async calculateDailyScore(
    userId: string,
    date: string,
    options?: Omit<CalculateDailyScoreInput, 'userId' | 'date'>
  ): Promise<DailyScoreWithContext> {
    const parsed = calculateScoreSchema.parse({
      date,
      isMinimumDay: options?.isMinimumDay,
      minimumDayTemplateId: options?.minimumDayTemplateId,
      minimumDayReason: options?.minimumDayReason,
      isRestDay: options?.isRestDay,
      restDayReason: options?.restDayReason,
      contextTags: options?.contextTags,
    });

    const settings = await this.userRepository.getSettings(userId);
    const weights: TierWeights = {
      ...DEFAULT_TIER_WEIGHTS,
      weightNonNeg:
        settings?.weightNonNeg ?? DEFAULT_TIER_WEIGHTS.weightNonNeg,
      weightGrowth:
        settings?.weightGrowth ?? DEFAULT_TIER_WEIGHTS.weightGrowth,
      weightBonus: settings?.weightBonus ?? DEFAULT_TIER_WEIGHTS.weightBonus,
    };

    const habits = await this.habitRepository.findAll(userId, {
      status: 'ACTIVE',
      includeArchived: false,
    });
    const logs = await this.habitRepository.findLogsByDate(userId, parsed.date);
    const logMap = new Map(logs.map((log) => [log.habitId, log]));
    const routineLogs = await this.routineRepository.findLogsByDate(userId, parsed.date);

    const core = this.buildBucket(CORE_TIERS, habits, logMap, weights);
    const growth = this.buildBucket(GROWTH_TIERS, habits, logMap, weights);
    const bonus = this.buildBucket(BONUS_TIERS, habits, logMap, weights);

    const result = computeDayScore(
      {
        nonNeg: core.percentage, // GROWTH habits
        growth: growth.percentage, // BONUS + LIFESTYLE + FLEXIBLE
        bonus: bonus.percentage, // OPTIONAL + EXPERIMENTAL + SPECIAL + JUST_FOR_FUN
        core: null, // never used: avoids the zero-weight core bucket
      },
      {
        weights,
        isRestDay: parsed.isRestDay ?? false,
        isMinimumDay: parsed.isMinimumDay ?? false,
      }
    );

    const scoredHabits = habits.filter((h) => SCORED_TIERS.includes(h.tier));
    const completedCount = logs.filter((l) => l.status === 'COMPLETED').length;
    const routineCompletedCount = routineLogs.filter(
      (l) => l.status === 'COMPLETED'
    ).length;

    const breakdown: ScoreBreakdown = {
      core: {
        score: core.score,
        maxScore: core.maxScore,
        percentage: core.percentage ?? 0,
        habits: core.contributions,
      },
      growth: {
        score: growth.score,
        maxScore: growth.maxScore,
        percentage: growth.percentage ?? 0,
        habits: growth.contributions,
      },
      bonus: {
        score: bonus.score,
        maxScore: bonus.maxScore,
        percentage: bonus.percentage ?? 0,
        habits: bonus.contributions,
      },
      total: {
        score: result.totalScore,
        maxScore: 100,
        percentage: result.totalScore,
      },
      grade: result.band.grade,
    };

    const persisted = await this.scoreRepository.upsertScore(userId, parsed.date, {
      coreScore: core.percentage ?? 0,
      growthScore: growth.percentage ?? 0,
      bonusScore: bonus.percentage ?? 0,
      totalScore: result.totalScore,
      overallGrade: result.band.grade,
      isMinimumDay: parsed.isMinimumDay ?? false,
      minimumDayTemplateId: parsed.minimumDayTemplateId ?? null,
      minimumDayReason: parsed.minimumDayReason ?? null,
      isRestDay: parsed.isRestDay ?? false,
      restDayReason: parsed.restDayReason ?? null,
      contextTags: parsed.contextTags ? JSON.stringify(parsed.contextTags) : null,
      habitCompletionRate:
        scoredHabits.length > 0
          ? Math.round((completedCount / scoredHabits.length) * 100)
          : 0,
      routineCompletionRate:
        routineLogs.length > 0
          ? Math.round((routineCompletedCount / routineLogs.length) * 100)
          : 0,
      calculationData: JSON.stringify({
        timestamp: new Date().toISOString(),
        breakdown,
        habitCount: scoredHabits.length,
        completedCount,
        weights,
      }),
    });

    return this.withBreakdown(persisted);
  }

  /**
   * Recalculate the persisted score for a date, preserving special-day flags
   */
  async recalculateDate(userId: string, date: string): Promise<DailyScoreWithContext> {
    const existing = await this.scoreRepository.findByDate(userId, date);

    return this.calculateDailyScore(userId, date, {
      isMinimumDay: existing?.isMinimumDay ?? false,
      minimumDayTemplateId: existing?.minimumDayTemplateId ?? undefined,
      minimumDayReason: existing?.minimumDayReason ?? undefined,
      isRestDay: existing?.isRestDay ?? false,
      restDayReason: existing?.restDayReason ?? undefined,
    });
  }

  /**
   * Get a stored daily score with its breakdown context
   */
  async getDailyScore(userId: string, date: string): Promise<DailyScoreWithContext | null> {
    const parsed = calculateScoreSchema.parse({ date });

    const score = await this.scoreRepository.findByDate(userId, parsed.date);
    return score ? this.withBreakdown(score) : null;
  }

  /**
   * Get score history for a date range with a summary
   */
  async getScoreHistory(
    userId: string,
    query: {
      startDate?: string;
      endDate?: string;
      grade?: string;
      isMinimumDay?: boolean;
      isRestDay?: boolean;
      sortOrder?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<ScoreHistoryRange> {
    const parsed = scoreQuerySchema.parse(query);
    const endDate = parsed.endDate ?? new Date().toISOString().slice(0, 10);
    const startDate = parsed.startDate ?? endDate;

    const scores = await this.scoreRepository.findByRange(userId, startDate, endDate);

    let entries: ScoreHistoryEntry[] = scores.map((score) => ({
      date: score.date,
      coreScore: score.coreScore,
      growthScore: score.growthScore,
      bonusScore: score.bonusScore,
      totalScore: score.totalScore,
      grade: isValidScoreGrade(score.overallGrade) ? score.overallGrade : null,
      isMinimumDay: score.isMinimumDay,
      isRestDay: score.isRestDay,
      habitCompletionRate: score.habitCompletionRate,
      routineCompletionRate: score.routineCompletionRate,
    }));

    if (parsed.grade !== undefined) {
      entries = entries.filter((entry) => entry.grade === parsed.grade);
    }
    if (parsed.isMinimumDay !== undefined) {
      entries = entries.filter((entry) => entry.isMinimumDay === parsed.isMinimumDay);
    }
    if (parsed.isRestDay !== undefined) {
      entries = entries.filter((entry) => entry.isRestDay === parsed.isRestDay);
    }

    entries.sort((a, b) => {
      if (!parsed.sortOrder || parsed.sortOrder === 'asc') {
        return a.date.localeCompare(b.date);
      }
      return b.date.localeCompare(a.date);
    });

    if (parsed.offset !== undefined) {
      entries = entries.slice(parsed.offset);
    }
    if (parsed.limit !== undefined) {
      entries = entries.slice(0, parsed.limit);
    }

    const scoredEntries = entries.filter((e) => e.totalScore !== null);

    const gradeCounts = new Map<ScoreHistoryEntry['grade'], number>();
    for (const entry of scoredEntries) {
      gradeCounts.set(entry.grade, (gradeCounts.get(entry.grade) ?? 0) + 1);
    }

    let mostCommonGrade: ScoreHistoryEntry['grade'] = null;
    let maxCount = 0;
    for (const [grade, count] of gradeCounts.entries()) {
      if (count > maxCount) {
        mostCommonGrade = grade;
        maxCount = count;
      }
    }

    const totals = scoredEntries.map((e) => e.totalScore as number);
    const averageScore =
      totals.length > 0
        ? Math.round((totals.reduce((sum, t) => sum + t, 0) / totals.length) * 100) / 100
        : 0;

    return {
      startDate,
      endDate,
      entries,
      summary: {
        daysWithData: entries.length,
        averageScore,
        highestScore: totals.length > 0 ? Math.max(...totals) : 0,
        lowestScore: totals.length > 0 ? Math.min(...totals) : 0,
        mostCommonGrade,
      },
    };
  }

  /**
   * Compute the score, max score, percentage and breakdown for a tier bucket
   */
  private buildBucket(
    tiers: HabitTier[],
    habits: HabitForScoring[],
    logMap: Map<string, HabitLog>,
    weights: TierWeights
  ): {
    score: number;
    maxScore: number;
    percentage: number | null;
    contributions: HabitScoreContribution[];
  } {
    const bucketHabits = habits.filter(
      (habit) => habit.tier && tiers.includes(habit.tier)
    );

    if (bucketHabits.length === 0) {
      return { score: 0, maxScore: 0, percentage: null, contributions: [] };
    }

    let score = 0;
    let maxScore = 0;
    const contributions: HabitScoreContribution[] = [];

    for (const habit of bucketHabits) {
      const log = logMap.get(habit.id);
      const points = habit.points ?? tierToPoints(habit.tier);
      const weight = weightForTier(habit.tier, weights);

      maxScore += points * weight;

      if (log?.status === 'COMPLETED') {
        const contribution = points * weight;
        score += contribution;

        contributions.push({
          habitId: habit.id,
          habitName: habit.name,
          tier: habit.tier,
          status: log.status,
          points,
          weight,
          contribution: Math.round(contribution * 100) / 100,
        });
      } else if (log?.status === 'PARTIAL') {
        const contribution =
          points * weight * CALCULATION_RULES.partialCompletion.scoreMultiplier;
        score += contribution;

        contributions.push({
          habitId: habit.id,
          habitName: habit.name,
          tier: habit.tier,
          status: log.status,
          points,
          weight,
          contribution: Math.round(contribution * 100) / 100,
        });
      }
    }

    return {
      score: Math.round(score * 100) / 100,
      maxScore: Math.round(maxScore * 100) / 100,
      percentage: Math.round((score / maxScore) * 1000) / 10,
      contributions,
    };
  }

  /**
   * Attach breakdown context to a persisted score row
   */
  private withBreakdown(score: DailyScore): DailyScoreWithContext {
    let breakdown: ScoreBreakdown | null = null;

    if (score.calculationData) {
      try {
        const parsed = JSON.parse(score.calculationData) as {
          breakdown?: ScoreBreakdown;
        };
        if (parsed?.breakdown) {
          breakdown = parsed.breakdown;
        }
      } catch {
        breakdown = null;
      }
    }

    if (!breakdown) {
      const percentage = score.totalScore ?? 0;
      breakdown = {
        core: {
          score: score.coreScore ?? 0,
          maxScore: 100,
          percentage: score.coreScore ?? 0,
          habits: [],
        },
        growth: {
          score: score.growthScore ?? 0,
          maxScore: 100,
          percentage: score.growthScore ?? 0,
          habits: [],
        },
        bonus: {
          score: score.bonusScore ?? 0,
          maxScore: 100,
          percentage: score.bonusScore ?? 0,
          habits: [],
        },
        total: { score: percentage, maxScore: 100, percentage },
        grade: getGradeFromPercentage(percentage),
      };
    }

    return {
      ...score,
      context: {
        isMinimumDay: score.isMinimumDay,
        isRestDay: score.isRestDay,
        dayType: null,
      },
      breakdown,
    };
  }
}