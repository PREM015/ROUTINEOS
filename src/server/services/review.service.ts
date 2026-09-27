import { ReviewRepository } from '@/server/repositories/review.repository';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { generateWeeklyRecap } from '@/server/recap/weekly';
import { invalidateDashboard } from '@/server/cache/dashboard-cache';
import { invalidateAnalyticsCache } from '@/server/cache/analytics-cache';
import type { MonthlyReset, WeeklyReview } from '@/generated/prisma';

/**
 * Review Service
 *
 * Business logic for the periodic review features (weekly review, monthly
 * reset).
 *
 * This service existed but was an orphaned three-method stub while the real
 * weekly-review logic lived inline in `app/api/weekly-review/route.ts` — the
 * API route talked to Prisma directly and the service was imported by nobody.
 * Weekly review is a genuinely wired feature (the recap page renders it), so
 * the correct resolution is to wire the service up, not to delete it.
 *
 * It also owns the JSON serialisation for the models' JSON text columns, so
 * callers never hand-build `JSON.stringify` payloads.
 */

export interface WeeklyReviewInput {
  weekStart: string;
  weekEnd: string;
  answers: Record<string, string>;
  biggestWins?: string;
  challenges?: string;
  lessonsLearned?: string;
  nextWeekFocus?: string;
  nextWeekGoals?: string[];
  overallSatisfaction?: number;
  energyLevel?: number;
  stressLevel?: number;
}

export interface WeeklyReviewResult {
  review: WeeklyReview | null;
  recap: unknown;
}

export interface MonthlyResetInput {
  month: string;
  habitsToKeep?: string[];
  habitsToRemove?: string[];
  habitsToModify?: Array<{ habitId: string; changes: Record<string, unknown> }>;
  newHabitsToAdd?: Array<{ name: string; tier: string; frequencyType: string }>;
  goalsCompleted?: string[];
  goalsInProgress?: string[];
  goalsReviewNotes?: string;
  nextMonthPriorities?: string[];
  nextMonthGoals?: Array<{ title: string; targetValue: number; unit?: string }>;
  nextMonthFocus?: string;
  monthHighlights?: string;
  monthChallenges?: string;
  overallSatisfaction?: number;
  personalGrowth?: number;
  goalProgress?: number;
}

/** Serialise a JSON column value, or null when there is nothing to store. */
function toJsonColumn(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  if (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 0
  ) {
    return null;
  }
  return JSON.stringify(value);
}

/** Parse a JSON text column, tolerating null and malformed content. */
function parseJsonColumn<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class ReviewService {
  private reviewRepository: ReviewRepository;
  private habitRepository: HabitRepository;

  constructor() {
    this.reviewRepository = new ReviewRepository();
    this.habitRepository = new HabitRepository();
  }

  // ==========================================================================
  // Weekly review
  // ==========================================================================

  /**
   * Fetch a week's review, generating the recap stats on the fly when the user
   * has not written one yet.
   */
  async getWeeklyReview(
    userId: string,
    weekStart: string
  ): Promise<WeeklyReviewResult> {
    const review = await this.reviewRepository.findReviewByWeek(userId, weekStart);

    if (review) {
      return { review, recap: parseJsonColumn<unknown>(review.statsSnapshot) };
    }

    // No review yet: return live recap data so the page has something to show.
    const weekEndDate = new Date(weekStart);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const recap = await generateWeeklyRecap(
      userId,
      weekStart,
      weekEndDate.toISOString().slice(0, 10)
    );

    return { review: null, recap };
  }

  /**
   * Create or update a week's review, snapshotting the recap stats alongside it.
   */
  async saveWeeklyReview(
    userId: string,
    input: WeeklyReviewInput
  ): Promise<WeeklyReview> {
    const recap = await generateWeeklyRecap(
      userId,
      input.weekStart,
      input.weekEnd
    );

    const shared = {
      answers: JSON.stringify(input.answers ?? {}),
      biggestWins: input.biggestWins,
      challenges: input.challenges,
      lessonsLearned: input.lessonsLearned,
      nextWeekFocus: input.nextWeekFocus,
      nextWeekGoals: toJsonColumn(input.nextWeekGoals),
      overallSatisfaction: input.overallSatisfaction,
      energyLevel: input.energyLevel,
      stressLevel: input.stressLevel,
    };

    const review = await this.reviewRepository.upsertReview(
      userId,
      input.weekStart,
      {
        weekEnd: input.weekEnd,
        statsSnapshot: JSON.stringify(recap),
        ...shared,
      },
      shared
    );

    invalidateDashboard(userId);
    invalidateAnalyticsCache(userId);

    return review;
  }

  /**
   * Every weekly review for a user, newest first.
   */
  async getReviewHistory(userId: string): Promise<WeeklyReview[]> {
    return this.reviewRepository.findReviewsByUser(userId);
  }

  // ==========================================================================
  // Monthly reset
  // ==========================================================================

  /**
   * Record a monthly reset, archiving the habits the user chose to drop.
   */
  async createMonthlyReset(
    userId: string,
    input: MonthlyResetInput
  ): Promise<MonthlyReset> {
    // Archive habits marked for removal before recording the decision.
    if (input.habitsToRemove?.length) {
      await Promise.all(
        input.habitsToRemove.map((habitId) =>
          this.habitRepository.archive(habitId, userId)
        )
      );
    }

    const reset = await this.reviewRepository.createMonthlyReset({
      userId,
      month: input.month,
      summarySnapshot: toJsonColumn({
        habitsToKeep: input.habitsToKeep,
        habitsToRemove: input.habitsToRemove,
        goalsCompleted: input.goalsCompleted,
        goalsInProgress: input.goalsInProgress,
        nextMonthPriorities: input.nextMonthPriorities,
        nextMonthGoals: input.nextMonthGoals,
      }),
      monthHighlights: input.monthHighlights,
      monthChallenges: input.monthChallenges,
      habitsToKeep: toJsonColumn(input.habitsToKeep),
      habitsToRemove: toJsonColumn(input.habitsToRemove),
      habitsToModify: toJsonColumn(input.habitsToModify),
      newHabitsToAdd: toJsonColumn(input.newHabitsToAdd),
      goalsCompleted: toJsonColumn(input.goalsCompleted),
      goalsInProgress: toJsonColumn(input.goalsInProgress),
      goalsReviewNotes: input.goalsReviewNotes,
      nextMonthPriorities: toJsonColumn(input.nextMonthPriorities),
      nextMonthGoals: toJsonColumn(input.nextMonthGoals),
      nextMonthFocus: input.nextMonthFocus,
      overallSatisfaction: input.overallSatisfaction,
      personalGrowth: input.personalGrowth,
      goalProgress: input.goalProgress,
    });

    invalidateDashboard(userId);
    invalidateAnalyticsCache(userId);

    return reset;
  }

  /**
   * Fetch a monthly reset by YYYY-MM.
   */
  async getMonthlyReset(
    userId: string,
    month: string
  ): Promise<MonthlyReset | null> {
    return this.reviewRepository.findMonthlyByMonth(userId, month);
  }
}

export const reviewService = new ReviewService();
