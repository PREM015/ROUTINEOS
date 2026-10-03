import { differenceInCalendarDays, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { APP_CONFIG } from '@/config/app';
import { dailyBreakdown } from '@/server/analytics/daily';
import { weeklySummary, type WeeklySummary } from '@/server/analytics/weekly';
import { monthlySummary, type MonthlySummary } from '@/server/analytics/monthly';
import { yearlySummary, type YearlySummary } from '@/server/analytics/yearly';
import { streakAnalytics, streakProjections } from '@/server/analytics/streaks';
import { loadPeriodHabits } from '@/server/analytics/period-habits';
import type { PeriodHabitModel } from '@/lib/analytics/period-habits';
import {
  buildFreshness,
  buildScoreAverage,
  type ScoreAverage,
} from '@/lib/analytics/score-average';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { EnergyRepository } from '@/server/repositories/energy.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { InsightRepository } from '@/server/repositories/insight.repository';
import { ValidationError } from '@/lib/errors/app-error';
import { JournalRepository } from '@/server/repositories/journal.repository';
import { MoodRepository } from '@/server/repositories/mood.repository';
import { ProductivityPatternRepository } from '@/server/repositories/productivity-pattern.repository';
import { ProjectRepository } from '@/server/repositories/project.repository';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import { NutritionRepository } from '@/server/repositories/nutrition.repository';
import { HealthMetricRepository } from '@/server/repositories/health-metric.repository';
import { AchievementRepository } from '@/server/repositories/achievement.repository';
import { TaskRepository } from '@/server/repositories/task.repository';
import { TimeEntryRepository } from '@/server/repositories/time-entry.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { getGradeFromPercentage } from '@/types/score';
import {
  DEFAULT_TZ,
  getTodayString,
  isCalendarDate,
  shiftCalendarDay,
} from '@/lib/dates';
import { getPeriodRange, type Period } from '@/lib/period-range';
import type {
  AnalyticsChartData,
  AnalyticsDashboard,
  AnalyticsFocusSummary,
  AnalyticsInsight,
  AnalyticsMoodPulsePoint,
  AnalyticsProjectProgress,
  AnalyticsRoutineBlockBreakdown,
  AnalyticsRoutineDetail,
  AnalyticsSleepSnapshot,
  AnalyticsStreakSnapshot,
  AnalyticsTaskQuadrant,
  AnalyticsTimeAllocation,
  AnalyticsTimeAllocationEntry,
  StreakAnalytics,
} from '@/types/analytics';
import type { UserId } from '@/types/ids';

/**
 * Analytics Service
 *
 * Thin orchestration layer that resolves the selected period (day / week /
 * month / year) in the user's timezone (not the host's) and assembles the live
 * /analytics dashboard from the shared aggregation core plus real widget
 * datasets. Every number below is derived from Prisma rows — no fabricated
 * values, and each widget carries its own null/empty semantics.
 *
 * Two rules hold this together:
 *
 *   1. **One habit metric.** The period habit model is loaded once here and passed
 *      into every period module, so the hero tile, the consistency chart, the tier
 *      chart and the `/recap` surface cannot drift apart. See
 *      `lib/analytics/period-habits` for the definition and for the four
 *      denominators it replaced.
 *   2. **Nothing is fetched for a widget the page cannot show.** A period that is
 *      entirely in the future loads no habits and no habits-per-day work at all.
 */

/** Cap for mood-pulse series so multi-month periods stay readable. */
const MOOD_PULSE_LIMIT = 300;

/**
 * Resolve the requested period, or refuse it.
 *
 * The route already rejects an unknown period with a 400, but a service is a
 * public entry point too: `getReport`, `getMonthly` and `getYearly` are called
 * directly, and a future caller would get `monthlySummary`'s answer to a
 * question about a fortnight. Defaulting to `day` turned a caller bug into a
 * plausible-looking dashboard for the wrong day, which is the worst possible
 * failure for a reporting surface — nothing signals that it happened.
 */
function assertPeriod(value: string): Period {
  if (value === 'day' || value === 'week' || value === 'month' || value === 'year') {
    return value;
  }
  throw new ValidationError(`Invalid period "${value}": expected day, week, month or year`);
}

/**
 * Resolve the requested anchor day, or refuse it.
 *
 * Shape is not validity: `2026-13-45` is well-formed and is not a date. It used
 * to pass every check on the way in, become an Invalid Date in `fromZonedTime`,
 * and surface as `NaN` in every average computed from it.
 */
function assertDate(value: string): string {
  if (isCalendarDate(value)) return value;
  throw new ValidationError(`Invalid date "${value}": expected a real YYYY-MM-DD calendar date`);
}

export type DashboardQuery = {
  period?: string;
  date?: string;
};

export class AnalyticsService {
  private userRepository: UserRepository;
  private goalRepository: GoalRepository;
  private sleepRepository: SleepRepository;
  private focusRepository: FocusRepository;
  private moodRepository: MoodRepository;
  private energyRepository: EnergyRepository;
  private taskRepository: TaskRepository;
  private projectRepository: ProjectRepository;
  private streakRepository: StreakRepository;
  private patternRepository: ProductivityPatternRepository;
  private insightRepository: InsightRepository;

  /**
   * Dismiss one of the user's insights.
   *
   * `InsightRepository.deleteOwned` is already scoped by `userId`, so this
   * cannot delete another user's insight; the id is validated here so a
   * malformed value returns 400 rather than reaching the database.
   */
  async dismissInsight(userId: UserId, insightId: string): Promise<void> {
    const trimmed = insightId?.trim();
    if (!trimmed) {
      throw new ValidationError('Invalid insight id');
    }
    await this.insightRepository.deleteOwned(userId, trimmed);
  }
  private routineRepository: RoutineRepository;
  private timeEntryRepository: TimeEntryRepository;
  private nutritionRepository: NutritionRepository;
  private healthMetricRepository: HealthMetricRepository;
  private journalRepository: JournalRepository;
  private achievementRepository: AchievementRepository;
  private scoreRepository: ScoreRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.goalRepository = new GoalRepository();
    this.sleepRepository = new SleepRepository();
    this.focusRepository = new FocusRepository();
    this.moodRepository = new MoodRepository();
    this.energyRepository = new EnergyRepository();
    this.taskRepository = new TaskRepository();
    this.projectRepository = new ProjectRepository();
    this.streakRepository = new StreakRepository();
    this.patternRepository = new ProductivityPatternRepository();
    this.insightRepository = new InsightRepository();
    this.routineRepository = new RoutineRepository();
    this.timeEntryRepository = new TimeEntryRepository();
    this.nutritionRepository = new NutritionRepository();
    this.healthMetricRepository = new HealthMetricRepository();
    this.journalRepository = new JournalRepository();
    this.achievementRepository = new AchievementRepository();
    this.scoreRepository = new ScoreRepository();
  }

  /**
   * GET /api/analytics/dashboard
   * Period-scoped rollup for day / week / month / year in the user's timezone,
   * plus the bento widgets (streaks, tier mix, focus, tasks, projects, mood
   * pulse, sleep, and the latest AI insight). Every widget dataset is computed
   * against the selected period range so browsing any week / month shows that
   * period's real data.
   */
  async getDashboard(userId: UserId, query: DashboardQuery = {}): Promise<AnalyticsDashboard> {
    const settings = await this.userRepository.getSettings(userId);
    const timezone = settings?.timezone || DEFAULT_TZ;
    const userToday = getTodayString(timezone);
    const today = query.date === undefined ? userToday : assertDate(query.date);
    const period = query.period === undefined ? 'day' : assertPeriod(query.period);
    const range = getPeriodRange(period, today, timezone);

    const rangeStart = fromZonedTime(`${range.start}T00:00:00`, timezone);
    const rangeEnd = fromZonedTime(`${range.end}T23:59:59.999`, timezone);
    const daysInRange = differenceInCalendarDays(parseISO(range.end), parseISO(range.start)) + 1;

    const monthKey = range.start.slice(0, 7);
    const year = Number(range.start.slice(0, 4));

    /*
      One habit model for the whole request, shared with whichever period module
      runs.

      Previously each of `dailyBreakdown`, `weeklySummary`, `monthlySummary` and
      `yearlySummary` loaded its own habits *and* its own per-habit logs, and the
      dashboard additionally fetched the month summary on the week tab purely to
      render a tier chart — so the week tab paid for two full months of habit
      aggregates to show a month's numbers under a week's heading.
    */
    const periodHabitsPromise = loadPeriodHabits(userId, range.start, range.end, userToday);

    const [
      periodHabits,
      previousRange,
      streakRow,
      sleepLogs,
      focusStats,
      peakPatterns,
      openTasks,
      projects,
      moodLogs,
      energyLogs,
      recentInsights,
      routineLogs,
      completedMilestones,
      breakRows,
      focusSessionRows,
      timeEntries,
      nutritionEntries,
      healthMetrics,
      journalEntries,
      recentAchievements,
      latestScoredDate,
    ] = await Promise.all([
      periodHabitsPromise,
      this.previousRange(period, today, timezone),
      this.streakRepository.findByUserId(userId),
      this.sleepRepository.findByRange(userId, range.start, range.end),
      this.focusRepository.getStats(userId, rangeStart, rangeEnd),
      this.patternRepository.findPeakHours(userId),
      this.taskRepository.findAll(userId, { status: ['TODO', 'IN_PROGRESS', 'WAITING'] }),
      this.projectRepository.findAll(userId, { status: ['PLANNING', 'ACTIVE', 'ON_HOLD'] }),
      this.moodRepository.getMoodRange(userId, rangeStart, rangeEnd),
      this.energyRepository.getRange(userId, rangeStart, rangeEnd),
      this.insightRepository.findLatestByUser(userId, 5),
      this.routineRepository.findLogsByRange(userId, range.start, range.end),
      this.goalRepository.findCompletedMilestones(userId, rangeStart, rangeEnd),
      this.focusRepository.listBreaks(userId, rangeStart, rangeEnd),
      this.focusRepository.findSessions(userId, { from: rangeStart, to: rangeEnd }),
      this.timeEntryRepository.list(userId, { from: rangeStart, to: rangeEnd }),
      this.nutritionRepository.findAll(userId, { startDate: range.start, endDate: range.end }),
      this.healthMetricRepository.findAll(userId, { startDate: range.start, endDate: range.end }),
      this.journalRepository.findAll(userId, { from: range.start, to: range.end, limit: 5 }),
      this.achievementRepository.recentUnlocked(userId, 8),
      this.scoreRepository.findLatestDate(userId),
    ]);

    /*
      Two score reads, doing two different jobs.

      `periodScores` covers the selected range and is the single source for the
      hero's score, its core / growth / bonus breakdown and the scored-day count —
      on all four tabs, derived one way. `previousScores` covers the equivalent
      earlier range and exists only for a day or a week; see `buildComparison` for
      why a month and a year are left without one.
    */
    const [
      day,
      week,
      month,
      yearSummary,
      periodScores,
      previousScores,
    ] = await Promise.all([
      period === 'day'
        ? dailyBreakdown(userId, range.start, timezone, userToday, periodHabits)
        : Promise.resolve(null),
      period === 'week'
        ? weeklySummary(userId, range.start, timezone, userToday, periodHabits)
        : Promise.resolve(null),
      period === 'month'
        ? monthlySummary(userId, monthKey, timezone, userToday, periodHabits)
        : Promise.resolve(null),
      period === 'year'
        ? yearlySummary(userId, year, timezone, userToday, periodHabits)
        : Promise.resolve(null),
      this.scoreRepository.findByRange(userId, range.start, range.end),
      period === 'day' || period === 'week'
        ? this.scoreRepository.findByRange(userId, previousRange.start, previousRange.end)
        : Promise.resolve([]),
    ]);

    const tierMix = periodHabits.activeTierMix;
    const tasks = buildTaskQuadrant(openTasks, today, timezone);
    const moodPulse = buildMoodPulse(moodLogs, energyLogs);
    const sleep = buildSleepSnapshot(sleepLogs);
    const focusedMinutes = focusStats.totalFocusMinutes;
    const routine = buildRoutineDetail(routineLogs);
    const scoreAverage = buildScoreAverage(periodScores);

    return {
      period,
      date: today,
      range: {
        start: range.start,
        end: range.end,
        label: range.label,
        isCurrent: range.isCurrent,
      },
      today: userToday,
      comparison: buildComparison(period, previousRange, previousScores, scoreAverage.average),
      freshness: buildFreshness(range, userToday, latestScoredDate, scoreAverage.daysScored),
      hero: buildHero(scoreAverage, periodHabits),
      tiles: {
        routine: buildRoutineTile(period, day, routineLogs),
        habitCompletion: periodHabits.totals.rate,
        sleepMinutes: buildSleepMinutes(period, day, week, month, yearSummary),
        mood: buildAverageMood(moodLogs),
        focusMinutes: focusedMinutes,
      },
      habits: buildHabitPanel(periodHabits),
      chart1: buildChart1(period, day, periodHabits),
      chart2: buildChart2(period, timezone, periodHabits, yearSummary),
      routine,
      streaks: buildStreakSnapshot(streakRow, userToday),
      tierMix,
      focus: buildFocusSummary(focusStats, daysInRange, peakPatterns, breakRows),
      timeAllocation: buildTimeAllocation(timeEntries, focusSessionRows),
      tasks,
      projects: projects.map(buildProjectProgress),
      milestones: completedMilestones.map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        description: milestone.description,
        goalTitle: milestone.goal.title,
        projectTitle: milestone.goal.project?.name ?? null,
        completedAt: formatInTimeZone(milestone.completedAt as Date, timezone, 'yyyy-MM-dd'),
      })),
      moodPulse,
      sleep,
      nutrition:
        nutritionEntries.length > 0
          ? {
              entries: nutritionEntries.length,
              calories: nutritionEntries.some((entry) => entry.calories !== null)
                ? Math.round(
                    nutritionEntries.reduce((sum, entry) => sum + (entry.calories ?? 0), 0),
                  )
                : null,
              daysLogged: new Set(nutritionEntries.map((entry) => entry.date)).size,
            }
          : null,
      health:
        healthMetrics.length > 0
          ? healthMetrics.map((metric) => ({
              metricType: metric.metricType,
              value: metric.value,
              unit: metric.unit,
              date: metric.date,
            }))
          : [],
      journal: journalEntries.map((entry) => ({
        date: entry.date,
        title: entry.title,
        snippet:
          entry.content != null && entry.content.length > 160
            ? `${entry.content.slice(0, 160)}\u2026`
            : (entry.content ?? ''),
      })),
      achievements: recentAchievements.map((achievement) => ({
        id: achievement.id,
        title: achievement.title,
        description: achievement.description,
        unlockedAt: formatInTimeZone(achievement.unlockedAt, timezone, 'yyyy-MM-dd'),
      })),
      aiInsight: pickInsight(recentInsights),
    };
  }

  /**
   * The equivalent preceding period, so "vs previous" compares like with like.
   *
   * A day compares against the day before and a week against the week before.
   * Month and year are deliberately left without a comparison on this endpoint:
   * a part-lived month against a whole one is not a comparison, it is a flattering
   * number, and the service does not have a defensible way to clip the earlier
   * period to match without inventing one.
   */
  private async previousRange(
    period: Period,
    anchor: string,
    timezone: string
  ): Promise<{ start: string; end: string }> {
    const step = period === 'day' ? 1 : 7;
    const previousAnchor = shiftCalendarDay(anchor, -step);
    const range = getPeriodRange(period, previousAnchor, timezone);
    return { start: range.start, end: range.end };
  }

  /** GET /api/analytics/streaks — thin delegation to the streak aggregation core. */
  async getStreaks(userId: UserId, from: string, to: string): Promise<StreakAnalytics> {
    return streakAnalytics(userId, { startDate: from, endDate: to });
  }

  /**
 * GET /api/analytics/reports — weekly or monthly summary delegating to the core.
 *
 * The timezone is resolved rather than defaulted, because the period modules need
 * the user's zone to bucket any `Date`-typed column. A caller that omitted it would
 * silently get UTC bucketing — the exact bug this service fixes elsewhere.
 */
  async getReport(
    userId: UserId,
    type: 'weekly' | 'monthly',
    date: string,
  ): Promise<WeeklySummary | MonthlySummary> {
    const { timezone, today } = await this.resolvePeriodContext(userId);
    return type === 'monthly'
      ? monthlySummary(userId, date, timezone, today)
      : weeklySummary(userId, date, timezone, today);
  }

  /** GET /api/analytics/monthly — month summary delegating to the core. */
  async getMonthly(userId: UserId, month: string): Promise<MonthlySummary> {
    const { timezone, today } = await this.resolvePeriodContext(userId);
    return monthlySummary(userId, month, timezone, today);
  }

  /** GET /api/analytics/yearly — year summary delegating to the core. */
  async getYearly(userId: UserId, year: number): Promise<YearlySummary> {
    const { timezone, today } = await this.resolvePeriodContext(userId);
    return yearlySummary(userId, year, timezone, today);
  }

  /** GET /api/analytics/daily — day breakdown delegating to the core. */
  async getDaily(
    userId: UserId,
    date: string
  ): Promise<Awaited<ReturnType<typeof dailyBreakdown>>> {
    const { timezone, today } = await this.resolvePeriodContext(userId);
    return dailyBreakdown(userId, date, timezone, today);
  }

  private async resolvePeriodContext(
    userId: UserId
  ): Promise<{ timezone: string; today: string }> {
    const settings = await this.userRepository.getSettings(userId);
    const timezone = settings?.timezone || DEFAULT_TZ;
    return { timezone, today: getTodayString(timezone) };
  }
}

/* ───────────────────────────── widget builders ───────────────────────────── */

interface StreakRowLike {
  currentStreak: number;
  longestStreak: number;
  coreStreak: number;
  growthStreak: number;
  minimumDayStreak: number;
  lastCompletedDate: string | null;
}

/**
 * Streaks are an all-time property, not a period metric, and the API now says so
 * with `scope`. The previous build took `Math.max(row, report)` with a number
 * produced by scanning every `DailyScore` the account has ever had; the row is
 * maintained by the write path, so the scan only ever added latency.
 */
function buildStreakSnapshot(
  row: StreakRowLike | null,
  today: string
): AnalyticsStreakSnapshot {
  const projections = streakProjections(row, today);
  return {
    current: projections.current,
    core: row?.coreStreak ?? 0,
    growth: row?.growthStreak ?? 0,
    minimum: row?.minimumDayStreak ?? 0,
    longest: projections.longest,
    riskLevel: projections.riskLevel,
    nextMilestone: projections.nextMilestone,
    daysToNextMilestone: projections.daysToNextMilestone,
  };
}

/* ───────────────────────────── score hero ──────────────────────────────── */

function buildHero(score: ScoreAverage, habits: PeriodHabitModel): AnalyticsDashboard['hero'] {
  return {
    total: score.average,
    grade: score.average != null ? getGradeFromPercentage(score.average) : null,
    core: score.core,
    growth: score.growth,
    bonus: score.bonus,
    /** Real scored-day count, so "average" can say what it averaged over. */
    daysScored: score.daysScored,
    /*
      One value, straight from the shared period model, for every tab.

      It used to be read from four different places that computed it four
      different ways - mean of tier rates for a day, mean of per-habit rates for
      a week and month, completed / every-logged-row for a year. Two tabs that
      said "this week" and "this month" could disagree about the same week.
    */
    habitReliability: habits.totals.rate,
  };
}

/**
 * How far behind the scores are, so the page can say so.
 *
 * Lives in `lib/analytics/score-average` with the rest of the hero arithmetic, so
 * it can be tested without a database. See that module for why.
 */

interface RoutineLogCountLike {
  status: string;
}

/**
 * Routine adherence for **every** period, not just the day tab.
 *
 * This used to be `day && day.routine`, so switching to week, month or year left
 * the Routine tile reading a dash while the Routine card further down the page
 * happily listed real per-block numbers for the same range. The routine logs were
 * already loaded for the range — the tile simply was not reading them.
 */
function buildRoutineTile(
  period: Period,
  day: Awaited<ReturnType<typeof dailyBreakdown>> | null,
  routineLogs: RoutineLogCountLike[]
): AnalyticsDashboard['tiles']['routine'] {
  if (period === 'day' && day) {
    return day.routine.total > 0 ? day.routine : null;
  }
  const total = routineLogs.length;
  if (total === 0) return null;
  const completed = routineLogs.filter((log) => log.status === 'COMPLETED').length;
  return {
    completed,
    total,
    completionRate: Math.round((completed / total) * 100),
  };
}

function buildSleepMinutes(
  period: Period,
  day: Awaited<ReturnType<typeof dailyBreakdown>> | null,
  week: WeeklySummary | null,
  month: MonthlySummary | null,
  year: YearlySummary | null,
): number | null {
  if (period === 'day' && day) return day.sleep.durationMinutes;
  if (period === 'week' && week) return week.sleep.averageDuration;
  if (period === 'month' && month) return month.sleep.averageDuration;
  if (period === 'year' && year) return year.sleep.averageDuration;
  return null;
}

function buildAverageMood(moodLogs: Array<{ mood: number }>): number | null {
  const values = moodLogs.map((log) => log.mood);
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

/* ───────────────────────────── charts ──────────────────────────────────── */

function monthLabel(monthKey: string, timezone: string): string {
  return formatInTimeZone(fromZonedTime(`${monthKey}-15T00:00:00`, timezone), timezone, 'MMM');
}

/**
 * Chart 1 — how well the habits went.
 *
 * A day shows the four outcomes the day can end in; every longer period shows the
 * same rate the hero tile shows, sliced per habit. `value` is `null` for a habit
 * that was never due in the window, which is different from a habit that was due
 * and never done, and the chart renders the difference as a gap.
 */
function buildChart1(
  period: Period,
  day: Awaited<ReturnType<typeof dailyBreakdown>> | null,
  habits: PeriodHabitModel
): AnalyticsChartData[] {
  if (period === 'day' && day) {
    const byStatus = new Map<string, number>();
    for (const habit of day.habits) {
      const key =
        habit.status === 'COMPLETED'
          ? 'Completed'
          : habit.status === 'MISSED'
            ? 'Missed'
            : habit.status === 'SKIPPED'
              ? 'Skipped'
              // "Not due" is not a failure and must not be counted as one; it is
              // reported separately so the day reads honestly.
              : habit.status === 'NOT_LOGGED'
                ? 'Not logged'
                : 'Not due';
      byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
    }
    return ['Completed', 'Missed', 'Skipped', 'Not logged'].map((name) => ({
      name,
      value: byStatus.get(name) ?? 0,
    }));
  }

  return habits.perHabit.map((habit) => ({
    name: habit.habitName,
    value: habit.rate,
  }));
}

/**
 * Chart 2 — what the number is made of.
 *
 * For a day, week or month this is tier completion, and it comes from the same
 * period model as the hero. It used to come from `monthlySummary` on the **week**
 * tab, so browsing any week drew that calendar month's tier rates: the week of
 * 29 January was labelled with January's numbers and silently ignored the four
 * February days on screen, and the page paid for a second month of habit
 * aggregates to do it.
 *
 * The year tab is the exception. Twelve habits' rates say less about a year than
 * twelve months of scores do, so it shows the monthly score trend - with `null`
 * for months with no scored day, so an un-reached month draws a gap instead of a
 * bar at zero.
 */
function buildChart2(
  period: Period,
  timezone: string,
  habits: PeriodHabitModel,
  year: YearlySummary | null
): AnalyticsChartData[] {
  if (period === 'day' || period === 'week' || period === 'month') {
    return habits.byTier.map((tier) => ({ name: tier.tier, value: tier.rate }));
  }
  if (period === 'year' && year) {
    return year.monthlyScoreTrend.map((entry) => ({
      name: monthLabel(entry.month, timezone),
      value: entry.averageScore,
    }));
  }
  return [];
}

/* ─────────────────────────── habit panel + comparison ───────────────────── */

function buildHabitPanel(model: PeriodHabitModel): AnalyticsDashboard['habits'] {
  return {
    completed: model.totals.completed,
    scheduled: model.totals.scheduled,
    rate: model.totals.rate,
    scheduledDays: model.scheduledDays,
    fullDays: model.fullDays,
    /** Due days with nothing recorded. Unknown, not failed. */
    noRecordDays: model.noRecordDays,
    perHabit: model.perHabit.map((habit) => ({
      habitId: habit.habitId,
      name: habit.habitName,
      tier: habit.tier,
      completed: habit.completed,
      scheduled: habit.scheduled,
      rate: habit.rate,
    })),
  };
}

/**
 * Score delta against the equivalent previous period.
 *
 * `previous` is `null` — not `0` — when the earlier period has no scored day, so
 * the UI can say "no data to compare" instead of implying the user improved by
 * their current score.
 */
function buildComparison(
  period: Period,
  previousRange: { start: string; end: string },
  previousScores: Array<{ totalScore: number | null }>,
  currentAverage: number | null
): AnalyticsDashboard['comparison'] {
  if (period !== 'day' && period !== 'week') return null;

  const scored = previousScores.filter((score) => score.totalScore !== null);
  if (scored.length === 0 || currentAverage == null) {
    return { start: previousRange.start, end: previousRange.end, average: null, delta: null };
  }

  const average =
    scored.reduce((sum, score) => sum + (score.totalScore ?? 0), 0) / scored.length;

  return {
    start: previousRange.start,
    end: previousRange.end,
    average: Math.round(average),
    delta: Math.round((currentAverage - average) * 10) / 10,
  };
}

/* ───────────────────────────── task quadrant ───────────────────────────── */

function buildTaskQuadrant(
  tasks: Array<{ isUrgent: boolean; isImportant: boolean; dueDate: Date | null; status: string }>,
  today: string,
  timezone: string,
): AnalyticsTaskQuadrant {
  const quadrant: AnalyticsTaskQuadrant = {
    urgentImportant: 0,
    urgentNotImportant: 0,
    importantNotUrgent: 0,
    neither: 0,
    open: tasks.length,
    overdue: 0,
  };
  for (const task of tasks) {
    if (task.isUrgent && task.isImportant) quadrant.urgentImportant++;
    else if (task.isUrgent) quadrant.urgentNotImportant++;
    else if (task.isImportant) quadrant.importantNotUrgent++;
    else quadrant.neither++;

    // `dueDate` is bucketed into the user's zone, not sliced to UTC, so it is
    // comparable with the zoned `today`. A task due at 23:00 local yesterday read
    // as *today* in UTC, so `due < today` was false and it was never counted as
    // overdue — for every user east of UTC on the evening due date.
    if (
      task.dueDate !== null &&
      task.status !== 'COMPLETED' &&
      formatInTimeZone(task.dueDate, timezone, 'yyyy-MM-dd') < today
    ) {
      quadrant.overdue++;
    }
  }
  return quadrant;
}

type ProjectLike = {
  id: string;
  name: string;
  progress: number;
  status: AnalyticsProjectProgress['status'];
  color: string | null;
};

function buildProjectProgress(project: ProjectLike): AnalyticsProjectProgress {
  return {
    id: project.id,
    name: project.name,
    progress: project.progress,
    status: project.status,
    color: project.color,
  };
}

interface FocusStatsLike {
  totalSessions: number;
  totalFocusMinutes: number;
}

interface BreakLike {
  durationMinutes: number | null;
  startedAt: Date;
  endedAt: Date | null;
}

function buildFocusSummary(
  stats: FocusStatsLike,
  daysInRange: number,
  peakPatterns: Array<{ timeOfDay: string }>,
  breaks: BreakLike[],
): AnalyticsFocusSummary {
  const breakMinutes = breaks.reduce((sum, row) => {
    if (row.durationMinutes !== null && row.durationMinutes !== undefined) {
      return sum + row.durationMinutes;
    }
    if (row.endedAt) {
      return (
        sum + Math.max(0, Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 60000))
      );
    }
    return sum;
  }, 0);
  const averageMinutes = breaks.length > 0 ? Math.round(breakMinutes / breaks.length) : null;
  const ratio =
    stats.totalFocusMinutes > 0
      ? Number((breakMinutes / stats.totalFocusMinutes).toFixed(2))
      : null;

  return {
    period: { sessions: stats.totalSessions, minutes: stats.totalFocusMinutes },
    dailyAverage: {
      sessions: Math.round(stats.totalSessions / Math.max(daysInRange, 1)),
      minutes: Math.round(stats.totalFocusMinutes / Math.max(daysInRange, 1)),
    },
    peakHours: peakPatterns.map((pattern) => pattern.timeOfDay),
    breaks: { count: breaks.length, averageMinutes, ratio },
  };
}

interface TimeEntryLike {
  description: string;
  startTime: Date;
  endTime: Date | null;
  duration: number | null;
  project: { id: string; name: string; color: string | null } | null;
  habit: { id: string; name: string } | null;
  goal: { id: string; title: string } | null;
}

interface FocusSessionLike {
  actualDuration: number | null;
  category: { id: string; name: string; color: string | null } | null;
}

function buildTimeAllocation(
  timeEntries: TimeEntryLike[],
  focusSessions: FocusSessionLike[],
): AnalyticsTimeAllocation {
  const summary = new Map<string, AnalyticsTimeAllocationEntry>();
  let totalMinutes = 0;

  for (const entry of timeEntries) {
    const minutes =
      entry.duration !== null && entry.duration !== undefined
        ? entry.duration
        : entry.endTime
          ? Math.max(0, Math.round((entry.endTime.getTime() - entry.startTime.getTime()) / 60000))
          : 0;
    if (minutes <= 0) continue;

    const label = entry.project?.name ?? entry.habit?.name ?? entry.goal?.title ?? 'Uncategorized';
    const color = entry.project?.color ?? null;
    const current = summary.get(label) ?? { label, minutes: 0, color };
    current.minutes += minutes;
    totalMinutes += minutes;
    summary.set(label, current);
  }

  const entries = Array.from(summary.values()).sort((a, b) => b.minutes - a.minutes);

  const focusMap = new Map<string, AnalyticsTimeAllocationEntry>();
  for (const session of focusSessions) {
    const minutes = session.actualDuration ?? 0;
    if (minutes <= 0) continue;
    const label = session.category?.name ?? 'Uncategorized';
    const color = session.category?.color ?? null;
    const current = focusMap.get(label) ?? { label, minutes: 0, color };
    current.minutes += minutes;
    focusMap.set(label, current);
  }
  const focusByCategory = Array.from(focusMap.values()).sort((a, b) => b.minutes - a.minutes);

  return { totalMinutes, entries, focusByCategory };
}

interface MoodLogLike {
  timestamp: Date;
  mood: number;
  energy: number | null;
}

interface EnergyLogLike {
  timestamp: Date;
  energyLevel: number;
}

function buildMoodPulse(
  moodLogs: MoodLogLike[],
  energyLogs: EnergyLogLike[],
): AnalyticsMoodPulsePoint[] {
  const byTimestamp = new Map<number, AnalyticsMoodPulsePoint>();
  for (const log of moodLogs) {
    const ts = log.timestamp.getTime();
    const point = byTimestamp.get(ts) ?? {
      timestamp: log.timestamp.toISOString(),
      mood: null,
      energy: null,
    };
    point.mood = log.mood;
    if (log.energy !== null && log.energy !== undefined) point.energy = log.energy;
    byTimestamp.set(ts, point);
  }
  for (const log of energyLogs) {
    const ts = log.timestamp.getTime();
    const point = byTimestamp.get(ts) ?? {
      timestamp: log.timestamp.toISOString(),
      mood: null,
      energy: null,
    };
    point.energy = log.energyLevel;
    byTimestamp.set(ts, point);
  }
  const points = Array.from(byTimestamp.values()).sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  return points.length > MOOD_PULSE_LIMIT ? points.slice(-MOOD_PULSE_LIMIT) : points;
}

interface RoutineLogLike {
  date: string;
  status: 'COMPLETED' | 'MISSED' | 'PARTIAL' | 'IN_PROGRESS';
  routineBlock: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
  };
}

function buildRoutineDetail(logs: RoutineLogLike[]): AnalyticsRoutineDetail {
  const byBlock = new Map<string, AnalyticsRoutineBlockBreakdown>();
  const days = new Set<string>();

  for (const log of logs) {
    const block = log.routineBlock;
    const bucket = byBlock.get(block.id) ?? {
      blockId: block.id,
      title: block.title,
      startTime: block.startTime,
      daysTracked: 0,
      completed: 0,
      missed: 0,
      partial: 0,
      completionRate: 0,
    };
    bucket.daysTracked++;
    if (log.status === 'COMPLETED') bucket.completed++;
    else if (log.status === 'MISSED') bucket.missed++;
    else if (log.status === 'PARTIAL') bucket.partial++;
    byBlock.set(block.id, bucket);
    days.add(log.date);
  }

  for (const bucket of byBlock.values()) {
    bucket.completionRate =
      bucket.daysTracked > 0 ? Math.round((bucket.completed / bucket.daysTracked) * 100) : 0;
  }

  const blocks = Array.from(byBlock.values()).sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  const mostMissed =
    blocks.filter((block) => block.missed > 0).sort((a, b) => b.missed - a.missed)[0] ?? null;

  return {
    daysTracked: days.size,
    blocks,
    mostMissed,
  };
}

interface SleepLogLike {
  date: string;
  actualDurationMinutes: number | null;
  actualBedtime: string | null;
  actualWakeTime: string | null;
  deficitMinutes: number | null;
  quality: number | null;
  feltRested: boolean | null;
}

function buildSleepSnapshot(logs: SleepLogLike[]): AnalyticsSleepSnapshot | null {
  const durational = logs.filter((log) => log.actualDurationMinutes !== null);
  const periodStats =
    logs.length > 0
      ? {
          loggedDays: logs.length,
          averageDurationMinutes:
            durational.length > 0
              ? Math.round(
                  durational.reduce((sum, log) => sum + (log.actualDurationMinutes ?? 0), 0) /
                    durational.length,
                )
              : null,
        }
      : null;

  const latest = logs[logs.length - 1];
  if (!latest) return null;

  const target = APP_CONFIG.defaults.sleep.targetDuration;
  return {
    date: latest.date,
    durationMinutes: latest.actualDurationMinutes,
    actualBedtime: latest.actualBedtime,
    actualWakeTime: latest.actualWakeTime,
    deficitMinutes: latest.deficitMinutes,
    quality: latest.quality,
    feltRested: latest.feltRested,
    metTarget:
      latest.actualDurationMinutes !== null ? latest.actualDurationMinutes >= target : null,
    periodStats,
  };
}

interface InsightLike {
  id: string;
  summary: string;
  period: string;
  generatedAt: Date;
  wasHelpful: boolean | null;
}

/** Pick the most recent real insight — skip placeholder/blank rows. */
function pickInsight(insights: InsightLike[]): AnalyticsInsight | null {
  for (const insight of insights) {
    const text = insight.summary?.trim() ?? '';
    if (text.length > 0 && text !== 'RECORDED') {
      return {
        id: insight.id,
        summary: insight.summary,
        period: insight.period,
        generatedAt: insight.generatedAt.toISOString(),
        wasHelpful: insight.wasHelpful,
      };
    }
  }
  return null;
}

export const analyticsService = new AnalyticsService();
