import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { Goal } from '@/generated/prisma';
import { DEFAULT_WINDOW_DAYS } from '@/constants/dashboard';
import {
  bucketByDayType,
  clampPercent,
  goalPace,
  meanOfPresent,
  type DayTypeExceptionLike,
  type PaceGoal,
} from '@/lib/dashboard/derive';
import { DEFAULT_TZ, getTodayString, shiftCalendarDay } from '@/lib/dates';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { ReflectionRepository } from '@/server/repositories/reflection.repository';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import type {
  DashboardDay,
  DashboardGoalsSummary,
  DashboardOverview,
  DashboardRadar,
  DashboardRadarAxis,
} from '@/types/dashboard';

/**
 * One read for every trend-shaped widget on `/dashboard`.
 *
 * ## Why this exists
 *
 * The dashboard used to be nine independent client fetches. Momentum, Weekly
 * Recap, Weekly Adherence and three of the five radar axes are all functions of
 * the same trailing window of `DailyScore` rows, so serving them separately meant
 * the same arithmetic ran nine times and could disagree with itself - which is how
 * the page came to show two different "habits due today" counts. One payload, one
 * arithmetic, one place to be wrong.
 *
 * ## Query budget
 *
 * Eight queries, all independent so they run concurrently:
 *
 *   1  UserRepository.getSettings               timezone
 *   2  ScoreRepository.findByRange              the `days` array
 *   3  StreakRepository.findByUserId            streak
 *   4  RoutineRepository.listDayTypeDefinitions day-type names
 *   5  RoutineRepository.findExceptionsByRange  day-type overrides
 *   6  GoalRepository.findAll                   goals velocity + radar axis
 *   7  FocusRepository.getStats                 radar axis
 *   8  RoutineRepository.findLogsByRange        biggest recurring miss
 *
 * Queries 4 and 5 exist specifically to avoid `resolveDayTypeForDate` per day,
 * which is 2 queries x 30. The pure rule in `lib/dashboard/derive` is that same
 * resolver, applied without the round trips.
 *
 * Every derivation lives in `lib/dashboard/derive` so it is testable without a
 * database; this class only fetches and composes.
 */

/** Radar reads the trailing 7 days, per the brief. */
const RADAR_WINDOW_DAYS = 7;

/**
 * Below this many scored days in the window, the radar renders a faded
 * placeholder instead of a pentagon. A polygon through one data point is
 * technically drawable and completely meaningless - it reads as a confident
 * answer to a question the data cannot answer yet.
 */
export const RADAR_MIN_DAYS = 3;

/**
 * A day type needs this many scored days before it earns a bar.
 *
 * The alternative - rendering a 1-day average as a full-width bar - is how a
 * dashboard ends up confidently claiming you score 94 on exam days off a single
 * exam day.
 */
export const DAY_TYPE_MIN_SCORED_DAYS = 3;

/**
 * Reference for normalising the focus radar axis to 0-100.
 *
 * NOT a user goal and not stored anywhere: `UserSettings` has no focus target
 * (`minSleepDuration` is the only duration setting). It is a denominator, stated
 * here so the axis is reproducible rather than a magic number buried in the
 * maths, and it matches the Pomodoro default the focus timer ships with.
 */
const FOCUS_DAILY_REFERENCE_MINUTES = 50;

/** Recurring misses below this are noise; the recap's "biggest miss" needs a pattern. */
const RECAP_MIN_MISSES = 2;

const RECAP_MAX_MISSES = 3;

const RADAR_AXES: { key: DashboardRadarAxis['key']; label: string; href: string }[] = [
  { key: 'habits', label: 'Habits', href: '/habits' },
  { key: 'routine', label: 'Routine', href: '/routine' },
  { key: 'sleep', label: 'Sleep', href: '/wellness' },
  { key: 'goals', label: 'Goals', href: '/goals' },
  { key: 'focus', label: 'Focus', href: '/focus' },
  { key: 'reflections', label: 'Reflections', href: '/journal' },
];

export class DashboardOverviewService {
  private userRepository = new UserRepository();
  private scoreRepository = new ScoreRepository();
  private streakRepository = new StreakRepository();
  private routineRepository = new RoutineRepository();
  private goalRepository = new GoalRepository();
  private focusRepository = new FocusRepository();
  private reflectionRepository = new ReflectionRepository();

  async getOverview(
    userId: string,
    windowDays = DEFAULT_WINDOW_DAYS
  ): Promise<DashboardOverview> {
    const settings = await this.userRepository.getSettings(userId);
    const timezone = settings?.timezone || DEFAULT_TZ;
    const today = getTodayString(timezone);

    const days = Math.max(7, Math.min(90, windowDays));
    const start = shiftCalendarDay(today, -(days - 1));
    const weekStart = shiftCalendarDay(today, -(RADAR_WINDOW_DAYS - 1));

    const [scoreRows, streakRow, definitions, exceptions, goals, focusStats, routineLogs, reflections] =
      await Promise.all([
        this.scoreRepository.findByRange(userId, start, today),
        this.streakRepository.findByUserId(userId),
        this.routineRepository.listDayTypeDefinitions(userId),
        this.routineRepository.findExceptionsByRange(userId, start, today),
        this.goalRepository.findAll(userId, { status: ['ACTIVE', 'CARRIED_OVER'] }),
        this.focusRepository.getStats(
          userId,
          fromZonedTime(`${weekStart}T00:00:00`, timezone),
          fromZonedTime(`${today}T23:59:59.999`, timezone)
        ),
        this.routineRepository.findLogsByRange(userId, weekStart, today),
        // The radar window only, not the full dashboard range: the axis reads
        // "last 7 days", so loading 90 days of reflections to count 7 would be
        // 13x the rows for no extra information.
        this.reflectionRepository.findByRange(userId, weekStart, today),
      ]);

    const dense = denseDays(scoreRows, start, today);
    const pace = goalPace(toPaceGoals(goals), today);

    return {
      today,
      timezone,
      days: dense,
      windowDays: days,
      streak: {
        current: streakRow?.currentStreak ?? 0,
        longest: streakRow?.longestStreak ?? 0,
        lastCompletedDate: streakRow?.lastCompletedDate
          ? formatInTimeZone(streakRow.lastCompletedDate, timezone, 'yyyy-MM-dd')
          : null,
      },
      dayTypes: bucketByDayType(dense, definitions, exceptions as DayTypeExceptionLike[]),
      radar: buildRadar(
        dense,
        pace,
        focusStats.totalFocusMinutes,
        new Set(reflections.map((r) => r.date)).size
      ),
      goals: pace satisfies DashboardGoalsSummary,
      routineMisses: buildRoutineMisses(routineLogs),
      focus: {
        totalMinutes: focusStats.totalFocusMinutes,
        sessions: focusStats.totalSessions,
      },
    };
  }
}

/**
 * `Goal` rows -> the narrow shape the pace rule needs.
 *
 * Both `DateTime` fields are flattened to calendar dates **in the user's
 * timezone**, in UTC. Formatting an instant in UTC is what
 * `resolveNaturalDayType` does deliberately: a goal's start day is a fact about
 * the calendar, not about an instant, so a zone behind UTC must not be allowed to
 * report the previous day.
 */
function toPaceGoals(goals: Goal[]): PaceGoal[] {
  return goals.map((g) => ({
    id: g.id,
    title: g.title,
    status: g.status,
    targetValue: g.targetValue,
    currentValue: g.currentValue,
    startDate: formatInTimeZone(g.startDate, 'UTC', 'yyyy-MM-dd'),
    endDate: formatInTimeZone(g.endDate, 'UTC', 'yyyy-MM-dd'),
  }));
}

/**
 * Fill the gaps so every date in the window is present.
 *
 * `findByRange` only returns rows that exist, and a day with no `DailyScore` row
 * is the normal state for any day the user never logged - not an error and not a
 * zero. Without densifying, a 30-day view with three gaps would draw three
 * consecutive columns and imply the user scored on days that were never scored.
 */
function denseDays(
  rows: {
    date: string;
    totalScore: number | null;
    habitCompletionRate: number | null;
    routineCompletionRate: number | null;
    sleepScore: number | null;
  }[],
  start: string,
  end: string
): DashboardDay[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: DashboardDay[] = [];
  for (let date = start; date <= end; date = shiftCalendarDay(date, 1)) {
    const row = byDate.get(date);
    out.push({
      date,
      totalScore: row?.totalScore ?? null,
      habitCompletionRate: row?.habitCompletionRate ?? null,
      routineCompletionRate: row?.routineCompletionRate ?? null,
      sleepScore: row?.sleepScore ?? null,
    });
  }
  return out;
}

/**
 * The five-axis balance view.
 *
 * Three axes come straight off the score rows; Goals and Focus do not exist in
 * `DailyScore` at all, which is why they needed real queries rather than another
 * derivation of data already on the page.
 */
function buildRadar(
  days: DashboardDay[],
  pace: DashboardGoalsSummary,
  focusMinutes: number,
  /** Distinct dates with a `DailyReflection`, within the radar window. */
  reflectionDays: number
): DashboardRadar {
  const window = days.slice(-RADAR_WINDOW_DAYS);
  const daysWithData = window.filter((d) => d.totalScore !== null).length;

  const values: Record<DashboardRadarAxis['key'], number | null> = {
    habits: meanOfPresent(window.map((d) => d.habitCompletionRate)),
    routine: meanOfPresent(window.map((d) => d.routineCompletionRate)),
    sleep: meanOfPresent(window.map((d) => d.sleepScore)),
    // No active goals is an absence, not a zero. A radar that dipped its Goals
    // vertex to the centre would report "you have neglected goals" to a user who
    // simply has none.
    goals: pace.active === 0 ? null : clampPercent((pace.onPace / pace.active) * 100),
    focus: clampPercent(
      (focusMinutes / (RADAR_WINDOW_DAYS * FOCUS_DAILY_REFERENCE_MINUTES)) * 100
    ),
    /*
      Reflections: the share of days in the window with a `DailyReflection` row.

      Deliberately a COUNT and not a mood average. A mood average would compare
      numbers the user rated on different scales on different days, and "how
      often did I actually stop and write" is the same question this whole card
      asks. No row in the window means the user has not used the feature, which is
      an absence rather than a zero, so it is `null` and the vertex sits at the
      centre as a hollow marker.
    */
    reflections:
      reflectionDays === 0
        ? null
        : clampPercent((reflectionDays / RADAR_WINDOW_DAYS) * 100),
  };

  return {
    daysWithData,
    axes: RADAR_AXES.map((axis) => ({
      ...axis,
      value: values[axis.key] === null ? null : Math.round(values[axis.key] as number),
    })),
  };
}

/**
 * Which routine blocks keep getting missed, and how often.
 *
 * Grouped by block *title* rather than id on purpose: "Evening Routine" missed
 * three times reads as a pattern a user can act on, while three ids do not. The
 * recap copy names the block, so a title collision across two templates is the
 * acceptable trade.
 */
function buildRoutineMisses(
  logs: { status: string; routineBlock: { title: string } | null }[]
): DashboardOverview['routineMisses'] {
  const counts = new Map<string, number>();

  for (const log of logs) {
    if (log.status !== 'MISSED') continue;
    const title = log.routineBlock?.title;
    if (!title) continue;
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, misses]) => misses >= RECAP_MIN_MISSES)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, RECAP_MAX_MISSES)
    .map(([blockTitle, misses]) => ({ blockTitle, misses }));
}

export const dashboardOverviewService = new DashboardOverviewService();
