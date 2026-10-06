/**
 * Pure derivations for the recap report.
 *
 * ## Why this file exists
 *
 * Two of the recap's most consequential decisions are *absence* decisions —
 * "does this period have anything to show?" and "is this day a zero or an
 * unknown?" — and both were previously written inline inside
 * `RecapService`, where they were unreachable from a test because the module
 * constructs sixteen repositories at import time.
 *
 * They are separated here for three reasons:
 *
 *  1. **Testability.** Everything below is a pure function over plain data, so
 *     `tests/lib/recap-derive.test.ts` can pin it without a database.
 *  2. **One implementation.** The heatmap and the period heroes both need to
 *     agree about what "scheduled" means. When the heatmap computed its own
 *     denominator it became a *fourth* definition of a word the codebase had
 *     already fought over twice (see `lib/analytics/period-habits.ts`). A
 *     heatmap built from `PeriodHabitDay` cannot drift, because there is no
 *     second rule left to drift toward.
 *  3. **The client/server boundary.** This module imports only types, so it is
 *     safe in a `'use client'` file and safe in `tests/`. It must never gain a
 *     runtime import of a repository or of `@/lib/prisma`.
 */

import type { PeriodHabitModel } from '@/lib/analytics/period-habits';
import type { RecapExtras } from '@/types/recap';

export type { RecapExtras } from '@/types/recap';

/**
 * Minimal structural shapes of the four period summaries.
 *
 * Declared here rather than imported from `@/server/analytics/*` on purpose.
 * Those modules import repositories, which reach `@/lib/prisma` and throw at
 * import time without a `DATABASE_URL` — and a `'use client'` file that imported
 * them would pull the Node Prisma entry point into the browser bundle. Naming
 * only the fields this function reads keeps the module importable from a test
 * and from a client component, and it also documents the predicate's real
 * dependencies instead of accepting a whole summary and reading six fields.
 */
export interface DayActivityInput {
  routine: { total: number };
  sleep: { logged: boolean };
  reflection: {
    mood: number | null;
    energy: number | null;
    biggestWin: string | null;
    biggestDifficulty: string | null;
  } | null;
}

export interface WeekActivityInput {
  sleep: { loggedDays: number };
  scores: { perfectDays: number; excellentDays: number };
}

export interface MonthActivityInput {
  sleep: { averageDuration: number };
  focus: { totalSessions: number };
  journal: { entryCount: number };
}

export interface YearActivityInput {
  sleep: { averageDuration: number };
  focus: { totalSessions: number };
  journal: { entryCount: number };
}

/** One day of the recap heatmap, carrying the third state alongside the two rates. */
export interface RecapHeatmapDay {
  /** `YYYY-MM-DD` in the user's timezone. */
  date: string;
  completed: number;
  /** Habits actually due that day, after the eligibility rule. */
  scheduled: number;
  /**
   * Habits that were due and have no log row at all.
   *
   * `0` completed with `0` no-record and `> 0` scheduled is a real 0%.
   * `scheduled > 0 && noRecord === scheduled` is "I had this due and recorded
   * nothing", which is *not* a failure — it is the absence of an observation.
   * AGENTS.md: "a day with no `HabitLog` row is unknown, not failed."
   */
  noRecord: number;
}

/**
 * What a recap heatmap cell actually means, so the renderer never has to
 * infer it from arithmetic.
 */
export type HeatmapCellState = 'full' | 'partial' | 'missed' | 'noRecord' | 'notDue';

export function heatmapCellState(day: RecapHeatmapDay): HeatmapCellState {
  if (day.scheduled <= 0) return 'notDue';
  if (day.noRecord >= day.scheduled) return 'noRecord';
  if (day.completed >= day.scheduled) return 'full';
  if (day.completed > 0) return 'partial';
  return 'missed';
}

/**
 * Build the heatmap from the shared period model.
 *
 * The days the model reports are already clipped to today, already eligibility-
 * scored, and already carry `noRecord`. Nothing here re-derives a denominator.
 * Days with nothing due are kept rather than filtered out: "nothing was due"
 * is information, and dropping the cell would make a rest day and an unlogged
 * day look identical.
 */
export function heatmapFromModel(model: PeriodHabitModel): RecapHeatmapDay[] {
  return model.days.map((day) => ({
    date: day.date,
    completed: day.completed,
    scheduled: day.scheduled,
    noRecord: day.noRecord,
  }));
}

/** Any habits were due in this window at all. */
function habitsWereDue(model: PeriodHabitModel): boolean {
  return model.totals.scheduled > 0;
}

/** Anything at all was logged against a habit in this window. */
function habitsWereRecorded(model: PeriodHabitModel): boolean {
  return model.totals.completed > 0 || model.perHabit.some((habit) => habit.missed > 0);
}

/**
 * Does the *period data alone* prove this window is empty?
 *
 * Deliberately narrow: this is the cheap probe that gates the sixteen extras
 * queries, so a false negative here costs a wasted fetch while a false positive
 * costs nothing. Anything only `extras` can see — journal, focus, nutrition,
 * achievements — is therefore absent by design and is added afterwards by
 * `extrasHaveActivity`.
 *
 * The previous predicate used `score?.totalScore !== null`, which is
 * `undefined !== null` — always `true` — so the day period claimed to have data
 * for a user who had none. The score is represented here as `hasScore: boolean`,
 * which cannot be written wrong.
 */
export function periodHasActivity(
  _period: 'day' | 'week' | 'month' | 'year',
  input: {
    hasScore: boolean;
    habits: PeriodHabitModel;
    points: ReadonlyArray<{ totalScore: number }>;
    day?: DayActivityInput;
    week?: WeekActivityInput;
    month?: MonthActivityInput;
    year?: YearActivityInput;
  }
): boolean {
  const { hasScore, habits, points, day, week, month, year } = input;

  if (hasScore) return true;
  if (points.length > 0) return true;
  if (habitsWereDue(habits) || habitsWereRecorded(habits)) return true;

  if (day) {
    if (day.routine.total > 0) return true;
    if (day.sleep.logged) return true;
    /*
      `dailyBreakdown` already loaded the reflection, so the day period can honour
      a user who wrote something and ticked nothing without paying for the whole
      extras block first. Mood and energy are on the same row and cost nothing
      extra to check.
    */
    if (reflectionHasContent(day.reflection)) return true;
    if (day.reflection?.mood != null || day.reflection?.energy != null) return true;
  }

  if (week) {
    if (week.sleep.loggedDays > 0) return true;
    if (week.scores.perfectDays > 0 || week.scores.excellentDays > 0) return true;
  }

  if (month) {
    if (month.sleep.averageDuration > 0) return true;
    if (month.focus.totalSessions > 0) return true;
    if (month.journal.entryCount > 0) return true;
  }

  if (year) {
    if (year.sleep.averageDuration > 0) return true;
    if (year.focus.totalSessions > 0) return true;
    if (year.journal.entryCount > 0) return true;
  }

  return false;
}

/**
 * Does a reflection carry anything worth rendering?
 *
 * Only the columns the day summary exposes. `Reflection` has more (gratitude,
 * tomorrow priorities, `reflectionText`), and those arrive through `extras`
 * instead — see `extrasHaveActivity`, which is where a narrative-only day is
 * finally caught.
 */
export function reflectionHasContent(
  reflection: {
    mood?: number | null;
    energy?: number | null;
    biggestWin?: string | null;
    biggestDifficulty?: string | null;
  } | null
  | undefined
): boolean {
  if (!reflection) return false;
  return (
    reflection.mood != null ||
    reflection.energy != null ||
    Boolean(reflection.biggestWin?.trim()) ||
    Boolean(reflection.biggestDifficulty?.trim())
  );
}

/**
 * Does the enrichment block prove the period is not empty?
 *
 * Only *recorded* activity counts. `goalsDelta.activeCount` and
 * `taskThroughput.open` are live counts against the whole account, not things
 * that happened inside the window, so a user with ten goals but no activity
 * this week correctly sees the empty state rather than a recap full of zeroes.
 */
export function extrasHaveActivity(extras: RecapExtras): boolean {
  if (extras.habitHeatmap.length > 0) return true;
  if (extras.sleepTrend.length > 0) return true;
  if (extras.moodEnergy.length > 0) return true;
  if (extras.focusByCategory.length > 0) return true;
  if (extras.journal.length > 0) return true;
  if (extras.reflections.length > 0) return true;
  if (extras.routineExceptions.length > 0) return true;
  if (extras.milestoneHits.length > 0) return true;
  if (extras.streakEvents.length > 0) return true;
  if (extras.achievements.length > 0) return true;
  if (extras.nutrition !== null) return true;
  if (extras.health !== null && extras.health.length > 0) return true;
  if (extras.linkedReview !== null) return true;
  if (extras.taskThroughput.created > 0 || extras.taskThroughput.completed > 0) return true;
  if (extras.goalsDelta.completedInPeriod > 0) return true;

  return false;
}

/**
 * How many days in the window had at least one habit due.
 *
 * Used for the one honest sentence a recap can say about a sparse window:
 * "3 of 5 days had anything scheduled" is true, where "60% completion" over a
 * window where four days had nothing due is not.
 */
export function windowCoverage(model: PeriodHabitModel): { dueDays: number; totalDays: number } {
  return {
    dueDays: model.days.filter((day) => day.scheduled > 0).length,
    totalDays: model.days.length,
  };
}

/** One sentence describing how much of the window had anything scheduled. */
export function coverageSentence(model: PeriodHabitModel, noun: string): string | null {
  const { dueDays, totalDays } = windowCoverage(model);
  if (dueDays === 0 || totalDays === 0) return null;
  if (dueDays === totalDays) return `Something was scheduled every one of these ${totalDays} ${noun}.`;
  return `${dueDays} of these ${totalDays} ${noun} had anything scheduled.`;
}