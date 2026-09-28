import { ReviewRepository } from '@/server/repositories/review.repository';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { generateWeeklyRecap } from '@/server/recap/weekly';
import { addMonths, endOfMonth, parse } from 'date-fns';
import type { MonthlyReset, Prisma, WeeklyReview } from '@/generated/prisma';

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
  /** Goals the user chose to drop. Archived, not completed. */
  goalsDropped?: string[];
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
  private goalRepository: GoalRepository;

  constructor() {
    this.reviewRepository = new ReviewRepository();
    this.habitRepository = new HabitRepository();
    this.goalRepository = new GoalRepository();
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

    // Apply goal decisions. Previously these lists were only written into the
    // snapshot JSON, so the wizard's "Mark Complete" / "Carry Over" / "Drop"
    // buttons changed nothing about the goals themselves — the reset screen
    // reported success while every goal kept its old status.
    const appliedGoals = await this.applyGoalDecisions(userId, input);

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
        appliedGoals,
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


    return reset;
  }

  /**
   * Apply the goal decisions from a monthly reset.
   *
   * - `goalsCompleted` → status COMPLETED, `completedAt` stamped.
   * - `goalsInProgress` → the goal's window is rolled forward to the end of the
   *   following month so it stays visible instead of silently ageing out.
   * - `goalsDropped`   → archived, which is what "Drop Goal" means.
   * - `nextMonthGoals`  → real goals are created, not just noted.
   *
   * A goal that is both completed and carried over is treated as completed.
   * Failures are collected rather than thrown, so one bad goal id does not
   * discard the whole reset — but the reason is recorded, because silently
   * skipping a goal is exactly the failure mode this method exists to prevent.
   */
  private async applyGoalDecisions(
    userId: string,
    input: MonthlyResetInput
  ): Promise<{
    completed: string[];
    carriedOver: string[];
    dropped: string[];
    created: string[];
    failed: Array<{ goalId: string; reason: string }>;
  }> {
    const completed = new Set(input.goalsCompleted ?? []);
    const carriedOver = new Set(input.goalsInProgress ?? []);
    const dropped = new Set(input.goalsDropped ?? []);

    // The reset is for `month` (e.g. "2026-08"), so the new window ends at the
    // end of the following month ("2026-09").
    const carriedTo = this.endOfFollowingMonth(input.month);

    const completedOk: string[] = [];
    const carriedOk: string[] = [];
    const droppedOk: string[] = [];
    const failed: Array<{ goalId: string; reason: string }> = [];

    for (const goalId of completed) {
      try {
        await this.goalRepository.complete(goalId, userId);
        completedOk.push(goalId);
      } catch (err) {
        failed.push({ goalId, reason: err instanceof Error ? err.message : 'unknown error' });
      }
    }

    for (const goalId of carriedOver) {
      // A goal already completed or dropped this round should not be re-opened.
      if (completed.has(goalId) || dropped.has(goalId)) continue;
      try {
        await this.goalRepository.update(goalId, userId, {
          endDate: carriedTo,
        });
        carriedOk.push(goalId);
      } catch (err) {
        failed.push({ goalId, reason: err instanceof Error ? err.message : 'unknown error' });
      }
    }

    for (const goalId of dropped) {
      // "Complete" and "Drop" are mutually exclusive; completing wins, because
      // archiving a goal the user just finished would lose the achievement.
      if (completed.has(goalId)) continue;
      try {
        // Matches `goalService.archiveGoal`: CANCELLED is the closest
        // GoalStatus to "dropped", and `archivedAt` is what the list queries
        // filter on. There is no ARCHIVED status in the enum.
        await this.goalRepository.update(goalId, userId, {
          status: 'CANCELLED',
          archivedAt: new Date(),
        });
        droppedOk.push(goalId);
      } catch (err) {
        failed.push({ goalId, reason: err instanceof Error ? err.message : 'unknown error' });
      }
    }

    const created: string[] = [];
    for (const planned of input.nextMonthGoals ?? []) {
      if (!planned.title?.trim()) continue;
      try {
        const goal = await this.goalRepository.create({
          user: { connect: { id: userId } },
          title: planned.title.trim(),
          type: 'CUSTOM',
          priority: 'MEDIUM',
          status: 'ACTIVE',
          targetValue: planned.targetValue,
          currentValue: 0,
          unit: planned.unit ?? null,
          startDate: new Date(),
          endDate: carriedTo,
        } as Prisma.GoalCreateInput);
        created.push(goal.id);
      } catch (err) {
        failed.push({
          goalId: planned.title,
          reason: err instanceof Error ? err.message : 'unknown error',
        });
      }
    }

    if (failed.length > 0) {
      console.error(
        `Monthly reset for ${userId}: ${failed.length} goal decision(s) could not be applied`,
        failed
      );
    }

    return { completed: completedOk, carriedOver: carriedOk, dropped: droppedOk, created, failed };
  }

  /** Last day of the month after `month` ("2026-08" → 2026-09-30). */
  private endOfFollowingMonth(month: string): Date {
    const start = parse(month, 'yyyy-MM', new Date());
    return endOfMonth(addMonths(start, 1));
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
