import { StreakRepository } from '@/server/repositories/streak.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { isStreakActiveDay } from '@/server/domain/streak/streak-calculator';
import { format, subDays, differenceInCalendarDays, parseISO } from 'date-fns';
import type { UserId } from '@/types/ids';

/**
 * Streak Recompute
 * Rebuilds the stored `Streak` row from the score history.
 *
 * ## Why this exists
 *
 * `calculateStreak` (in `lib/streaks/calculate-streak.ts`) is *incremental*: it
 * inspects yesterday and mutates the stored counters. That is cheap and correct
 * while logs only ever move forward, but it means a change to the past is never
 * revisited. Backfilling a forgotten day, deleting a log, or a correction to a
 * past score all leave `currentStreak` / `longestStreak` permanently wrong,
 * while the analytics page — which re-derives from the score range — shows the
 * correct number. The two then disagree.
 *
 * This module closes that gap by deriving the same counters from the same
 * source of truth (`DailyScore`, via the shared `isStreakActiveDay` predicate)
 * and writing the result. It is the authority; the incremental path is the fast
 * path.
 */

export interface RecomputeStreakResult {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  totalCompletedDays: number;
  lastCompletedDate: string | null;
  changed: boolean;
}

/** How far back to rebuild. Matches the achievement history window. */
const HISTORY_DAYS = 730;

export class StreakRecomputeService {
  private streakRepository: StreakRepository;
  private scoreRepository: ScoreRepository;

  constructor() {
    this.streakRepository = new StreakRepository();
    this.scoreRepository = new ScoreRepository();
  }

  /**
   * Rebuild the stored streak for a user from their score history.
   *
   * Uses `isStreakActiveDay`, the same predicate the incremental path and the
   * read path share, so all three agree on what counts.
   *
   * @param asOfDate Last date to consider. Defaults to today.
   * @param repair    Allow `longestStreak` to move *down*. Normally a personal
   *   best only ever moves up, and this method honours that. But when the stored
   *   record was produced by a defective predicate the value is not a real
   *   record at all — it is a bug that must be corrected, not protected. Pass
   *   `repair: true` to recompute it from the data and let it fall.
   */
  async recompute(
    userId: UserId,
    asOfDate?: string,
    options: { repair?: boolean } = {}
  ): Promise<RecomputeStreakResult> {
    const { repair = false } = options;
    const end = asOfDate ?? format(new Date(), 'yyyy-MM-dd');
    const start = format(subDays(parseISO(end), HISTORY_DAYS), 'yyyy-MM-dd');

    const scores = await this.scoreRepository.findByRange(userId, start, end);
    const activeDates = [
      ...new Set(scores.filter((score) => isStreakActiveDay(score)).map((score) => score.date)),
    ].sort();

    const current = this.currentRunLength(activeDates, end);
    const longest = this.longestRunLength(activeDates);

    let streak = await this.streakRepository.findByUserId(userId);
    if (!streak) {
      streak = await this.streakRepository.create(userId);
    }

    const lastCompletedDate =
      activeDates.length > 0 ? (activeDates[activeDates.length - 1] ?? null) : null;
    const streakStartDate = current > 0 ? (this.runStart(activeDates, end, current) ?? null) : null;

    // `longestStreak` only ever moves up, unless this is an explicit repair of a
    // value the data does not support.
    const nextLongest = repair ? longest : Math.max(longest, streak.longestStreak);

    const changed =
      streak.currentStreak !== current ||
      streak.longestStreak !== nextLongest ||
      streak.totalCompletedDays !== activeDates.length ||
      streak.lastCompletedDate !== lastCompletedDate;

    if (changed) {
      streak = await this.streakRepository.update(userId, {
        currentStreak: current,
        longestStreak: nextLongest,
        totalCompletedDays: activeDates.length,
        lastCompletedDate,
        streakStartDate,
      });
    }

    return {
      userId,
      currentStreak: current,
      longestStreak: nextLongest,
      totalCompletedDays: activeDates.length,
      lastCompletedDate,
      changed,
    };
  }

  /**
   * Length of the run of consecutive active dates ending at (or immediately
   * before) `endDate`.
   *
   * Yesterday still counts: a user who has not logged today has not broken
   * anything, and breaking the streak on an unlogged morning would make every
   * streak read 0 in the morning.
   */
  private currentRunLength(activeDates: string[], endDate: string): number {
    if (activeDates.length === 0) return 0;

    const active = new Set(activeDates);
    const end = parseISO(endDate);
    const yesterday = subDays(end, 1);
    const endStr = format(end, 'yyyy-MM-dd');
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

    let cursor: Date;
    if (active.has(endStr)) {
      cursor = end;
    } else if (active.has(yesterdayStr)) {
      cursor = yesterday;
    } else {
      return 0;
    }

    let length = 0;
    // Bounded so a corrupted history cannot spin here.
    for (let i = 0; i <= HISTORY_DAYS; i += 1) {
      if (!active.has(format(cursor, 'yyyy-MM-dd'))) break;
      length += 1;
      cursor = subDays(cursor, 1);
    }
    return length;
  }

  /** The first date of the run that produced `length`. */
  private runStart(activeDates: string[], endDate: string, length: number): string | undefined {
    const active = new Set(activeDates);
    const end = parseISO(endDate);
    const yesterdayStr = format(subDays(end, 1), 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    const anchor = active.has(endStr) ? end : subDays(end, 1);
    void yesterdayStr;
    return format(subDays(anchor, length - 1), 'yyyy-MM-dd');
  }

  /** Longest run of consecutive active dates anywhere in the history. */
  private longestRunLength(activeDates: string[]): number {
    let longest = 0;
    let run = 0;
    let previous: string | null = null;

    for (const date of activeDates) {
      if (previous !== null) {
        const gap = differenceInCalendarDays(parseISO(date), parseISO(previous));
        run = gap === 1 ? run + 1 : 1;
      } else {
        run = 1;
      }
      if (run > longest) longest = run;
      previous = date;
    }

    return longest;
  }
}

export const streakRecomputeService = new StreakRecomputeService();
