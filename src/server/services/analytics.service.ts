import type { HabitTier } from '@prisma/client';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { APP_CONFIG } from '@/config/app';
import { dailyBreakdown } from '@/server/analytics/daily';
import { weeklySummary, type WeeklySummary } from '@/server/analytics/weekly';
import { monthlySummary, type MonthlySummary } from '@/server/analytics/monthly';
import { yearlySummary, type YearlySummary } from '@/server/analytics/yearly';
import { streakAnalytics } from '@/server/analytics/streaks';
import { EnergyRepository } from '@/server/repositories/energy.repository';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { InsightRepository } from '@/server/repositories/insight.repository';
import { JournalRepository } from '@/server/repositories/journal.repository';
import { MoodRepository } from '@/server/repositories/mood.repository';
import { ProductivityPatternRepository } from '@/server/repositories/productivity-pattern.repository';
import { ProjectRepository } from '@/server/repositories/project.repository';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import { NutritionRepository } from '@/server/repositories/nutrition.repository';
import { HealthMetricRepository } from '@/server/repositories/health-metric.repository';
import { AchievementRepository } from '@/server/repositories/achievement.repository';
import { TaskRepository } from '@/server/repositories/task.repository';
import { TimeEntryRepository } from '@/server/repositories/time-entry.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { getGradeFromPercentage } from '@/types/score';
import { DEFAULT_TZ, getTodayString } from '@/lib/dates';
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
  AnalyticsTierMix,
  AnalyticsTimeAllocation,
  AnalyticsTimeAllocationEntry,
  StreakAnalytics,
} from '@/types/analytics';

/**
 * Analytics Service
 *
 * Thin orchestration layer that resolves the selected period (day / week /
 * month / year) in the user's timezone (not the host's) and assembles the live
 * /analytics dashboard from the shared aggregation core plus real widget
 * datasets. It also exposes thin wrappers for the streak / weekly / monthly API
 * routes so handlers stay stateless. Every number below is derived from Prisma
 * rows — no fabricated values, and each widget carries its own null/empty
 * semantics.
 */

/** 2000-01-01: comfortably older than any real account so "all time" queries stay correct. */
const ACCOUNT_EPOCH = '2000-01-01';

/** Cap for mood-pulse series so multi-month periods stay readable. */
const MOOD_PULSE_LIMIT = 300;

function isValidDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isPeriod(value: string | undefined): value is Period {
  return value === 'day' || value === 'week' || value === 'month' || value === 'year';
}

export type DashboardQuery = {
  period?: string;
  date?: string;
};

export class AnalyticsService {
  private userRepository: UserRepository;
  private habitRepository: HabitRepository;
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
  private routineRepository: RoutineRepository;
  private timeEntryRepository: TimeEntryRepository;
  private nutritionRepository: NutritionRepository;
  private healthMetricRepository: HealthMetricRepository;
  private journalRepository: JournalRepository;
  private achievementRepository: AchievementRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.habitRepository = new HabitRepository();
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
  }

  /**
   * GET /api/analytics/dashboard
   * Period-scoped rollup for day / week / month / year in the user's timezone,
   * plus the bento widgets (streaks, tier mix, focus, tasks, projects, mood
   * pulse, sleep, and the latest AI insight). Every widget dataset is computed
   * against the selected period range so browsing any week / month shows that
   * period's real data.
   */
  async getDashboard(userId: string, query: DashboardQuery = {}): Promise<AnalyticsDashboard> {
    const settings = await this.userRepository.getSettings(userId);
    const timezone = settings?.timezone || DEFAULT_TZ;
    const today = isValidDate(query.date) ? query.date : getTodayString(timezone);
    const period = isPeriod(query.period) ? query.period : 'day';
    const range = getPeriodRange(period, today, timezone);

    const rangeStart = fromZonedTime(`${range.start}T00:00:00`, timezone);
    const rangeEnd = fromZonedTime(`${range.end}T23:59:59.999`, timezone);
    const daysInRange =
      differenceInCalendarDays(parseISO(range.end), parseISO(range.start)) + 1;

    const monthKey = range.start.slice(0, 7);
    const year = Number(range.start.slice(0, 4));

    const [
      day,
      week,
      month,
      yearSummary,
      streakRow,
      streakFullHistory,
      habitCounts,
      goalCounts,
      activeHabits,
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
    ] = await Promise.all([
      period === 'day' ? dailyBreakdown(userId, range.start) : Promise.resolve(null),
      period === 'week' ? weeklySummary(userId, range.start) : Promise.resolve(null),
      period === 'week' || period === 'month'
        ? monthlySummary(userId, monthKey)
        : Promise.resolve(null),
      period === 'year' ? yearlySummary(userId, year) : Promise.resolve(null),
      this.streakRepository.findByUserId(userId),
      streakAnalytics(userId, { startDate: ACCOUNT_EPOCH, endDate: today }),
      this.habitRepository.countByStatus(userId),
      this.goalRepository.countByStatus(userId),
      this.habitRepository.findAll(userId, { status: 'ACTIVE' }),
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
    ]);

    const tierMix = buildTierMix(activeHabits);
    const tasks = buildTaskQuadrant(openTasks, today);
    const moodPulse = buildMoodPulse(moodLogs, energyLogs);
    const sleep = buildSleepSnapshot(sleepLogs);
    const focusedMinutes = focusStats.totalFocusMinutes;
    const routine = buildRoutineDetail(routineLogs);

    return {
      period,
      date: today,
      range: {
        start: range.start,
        end: range.end,
        label: range.label,
        isCurrent: range.isCurrent,
      },
      hero: buildHero(period, day, week, month, yearSummary),
      tiles: {
        routine:
          day && day.routine.total > 0
            ? day.routine
            : null,
        habitCompletion: buildHabitCompletion(period, day, week, month, yearSummary),
        sleepMinutes: buildSleepMinutes(period, day, week, month, yearSummary),
        mood: buildAverageMood(moodLogs),
        focusMinutes: focusedMinutes,
      },
      chart1: buildChart1(period, day, week, month, yearSummary),
      chart2: buildChart2(period, timezone, day, month, yearSummary),
      routine,
      streaks: buildStreakSnapshot(streakRow, streakFullHistory),
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
                    nutritionEntries.reduce((sum, entry) => sum + (entry.calories ?? 0), 0)
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
      counts: { habits: habitCounts, goals: goalCounts },
    };
  }

  /** GET /api/analytics/streaks — thin delegation to the streak aggregation core. */
  async getStreaks(userId: string, from: string, to: string): Promise<StreakAnalytics> {
    return streakAnalytics(userId, { startDate: from, endDate: to });
  }

  /** GET /api/analytics/reports — weekly or monthly summary delegating to the core. */
  async getReport(
    userId: string,
    type: 'weekly' | 'monthly',
    date: string
  ): Promise<WeeklySummary | MonthlySummary> {
    return type === 'monthly'
      ? monthlySummary(userId, date)
      : weeklySummary(userId, date);
  }

  /** GET /api/analytics/monthly — month summary delegating to the core. */
  async getMonthly(userId: string, month: string): Promise<MonthlySummary> {
    return monthlySummary(userId, month);
  }
}

/* ───────────────────────────── widget builders ───────────────────────────── */

interface StreakRowLike {
  currentStreak: number;
  longestStreak: number;
  coreStreak: number;
  growthStreak: number;
  minimumDayStreak: number;
}

function buildStreakSnapshot(
  row: StreakRowLike | null,
  report: StreakAnalytics
): AnalyticsStreakSnapshot {
  return {
    current: row?.currentStreak ?? report.current.total,
    core: row?.coreStreak ?? report.current.core,
    growth: row?.growthStreak ?? report.current.growth,
    minimum: row?.minimumDayStreak ?? report.current.minimum,
    longest: Math.max(row?.longestStreak ?? 0, report.longest.total),
    riskLevel: report.projections.riskLevel,
    nextMilestone: report.projections.nextMilestone,
    daysToNextMilestone: report.projections.daysToNextMilestone,
  };
}

function buildTierMix(habits: Array<{ tier: HabitTier }>): AnalyticsTierMix[] {
  const counts = new Map<HabitTier, number>();
  for (const habit of habits) {
    counts.set(habit.tier, (counts.get(habit.tier) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => b.count - a.count);
}

/* ───────────────────────────── score hero ──────────────────────────────── */

function buildHero(
  period: Period,
  day: Awaited<ReturnType<typeof dailyBreakdown>> | null,
  week: WeeklySummary | null,
  month: MonthlySummary | null,
  year: YearlySummary | null
): AnalyticsDashboard['hero'] {
  if (period === 'day' && day) {
    return {
      total: day.score.total,
      grade: day.score.grade,
      core: day.score.core,
      growth: day.score.growth,
      bonus: day.score.bonus,
      habitReliability: day.habitReliability,
    };
  }

  if (period === 'week' && week) {
    return {
      total: week.scores.average,
      grade: getGradeFromPercentage(week.scores.average),
      core: week.scores.averageCore,
      growth: week.scores.averageGrowth,
      bonus: week.scores.averageBonus,
      habitReliability: week.habits.averageCompletionRate,
    };
  }

  if (period === 'month' && month) {
    return {
      total: month.scores.average,
      grade: getGradeFromPercentage(month.scores.average),
      core: null,
      growth: null,
      bonus: null,
      habitReliability: month.habits.averageCompletionRate,
    };
  }

  if (period === 'year' && year) {
    return {
      total: year.averageScore,
      grade: getGradeFromPercentage(year.averageScore),
      core: null,
      growth: null,
      bonus: null,
      habitReliability: year.habits.averageCompletionRate,
    };
  }

  return { total: null, grade: null, core: null, growth: null, bonus: null, habitReliability: null };
}

function buildHabitCompletion(
  period: Period,
  day: Awaited<ReturnType<typeof dailyBreakdown>> | null,
  week: WeeklySummary | null,
  month: MonthlySummary | null,
  year: YearlySummary | null
): number | null {
  if (period === 'day' && day) return day.habitReliability;
  if (period === 'week' && week) return week.habits.averageCompletionRate;
  if (period === 'month' && month) return month.habits.averageCompletionRate;
  if (period === 'year' && year) return year.habits.averageCompletionRate;
  return null;
}

function buildSleepMinutes(
  period: Period,
  day: Awaited<ReturnType<typeof dailyBreakdown>> | null,
  week: WeeklySummary | null,
  month: MonthlySummary | null,
  year: YearlySummary | null
): number | null {
  if (period === 'day' && day) return day.sleep.durationMinutes;
  if (period === 'week' && week) return week.sleep.averageDuration;
  if (period === 'month' && month) return month.sleep.averageDuration;
  if (period === 'year' && year) return year.sleep.averageDuration;
  return null;
}

function buildAverageMood(
  moodLogs: Array<{ mood: number }>
): number | null {
  const values = moodLogs.map(log => log.mood);
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

/* ───────────────────────────── charts ──────────────────────────────────── */

function monthLabel(monthKey: string, timezone: string): string {
  return formatInTimeZone(fromZonedTime(`${monthKey}-15T00:00:00`, timezone), timezone, 'MMM');
}

function buildChart1(
  period: Period,
  day: Awaited<ReturnType<typeof dailyBreakdown>> | null,
  week: WeeklySummary | null,
  month: MonthlySummary | null,
  year: YearlySummary | null
): AnalyticsChartData[] {
  if (period === 'day' && day) {
    const byStatus = new Map<string, number>();
    for (const habit of day.habits) {
      const key = habit.status === 'COMPLETED'
        ? 'Completed'
        : habit.status === 'MISSED'
          ? 'Missed'
          : habit.status === 'SKIPPED'
            ? 'Skipped'
            : 'Not logged';
      byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
    }
    return ['Completed', 'Missed', 'Skipped', 'Not logged']
      .map(name => ({ name, value: byStatus.get(name) ?? 0 }));
  }
  if (period === 'week' && week) {
    return week.habits.perHabit.map(habit => ({ name: habit.habitName, value: Math.round(habit.completionRate) }));
  }
  if (period === 'month' && month) {
    return month.habits.perHabit.map(habit => ({ name: habit.habitName, value: Math.round(habit.completionRate) }));
  }
  if (period === 'year' && year) {
    return year.habits.perHabit
      .filter(habit => habit.completionRate > 0 || habit.missed > 0)
      .map(habit => ({ name: habit.habitName, value: Math.round(habit.completionRate) }));
  }
  return [];
}

function buildChart2(
  period: Period,
  timezone: string,
  day: Awaited<ReturnType<typeof dailyBreakdown>> | null,
  month: MonthlySummary | null,
  year: YearlySummary | null
): AnalyticsChartData[] {
  if (period === 'day' && day) {
    return day.tiers.map(tier => ({ name: tier.tier, value: Math.round(tier.completionRate) }));
  }
  if (period === 'week' && month) {
    return month.scores.byTier.map(tier => ({ name: tier.tier, value: Math.round(tier.completionRate) }));
  }
  if (period === 'month' && month) {
    return month.scores.byTier.map(tier => ({ name: tier.tier, value: Math.round(tier.completionRate) }));
  }
  if (period === 'year' && year) {
    return year.monthlyScoreTrend.map(entry => ({
      name: monthLabel(entry.month, timezone),
      value: Math.round(entry.averageScore),
    }));
  }
  return [];
}

/* ───────────────────────────── task quadrant ───────────────────────────── */

function buildTaskQuadrant(
  tasks: Array<{ isUrgent: boolean; isImportant: boolean; dueDate: Date | null; status: string }>,
  today: string
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

    if (
      task.dueDate !== null &&
      task.status !== 'COMPLETED' &&
      formatIso(task.dueDate) < today
    ) {
      quadrant.overdue++;
    }
  }
  return quadrant;
}

type ProjectLike = { id: string; name: string; progress: number; status: AnalyticsProjectProgress['status']; color: string | null };

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
  breaks: BreakLike[]
): AnalyticsFocusSummary {
  const breakMinutes = breaks.reduce((sum, row) => {
    if (row.durationMinutes !== null && row.durationMinutes !== undefined) {
      return sum + row.durationMinutes;
    }
    if (row.endedAt) {
      return sum + Math.max(0, Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 60000));
    }
    return sum;
  }, 0);
  const averageMinutes = breaks.length > 0 ? Math.round(breakMinutes / breaks.length) : null;
  const ratio =
    stats.totalFocusMinutes > 0 ? Number((breakMinutes / stats.totalFocusMinutes).toFixed(2)) : null;

  return {
    period: { sessions: stats.totalSessions, minutes: stats.totalFocusMinutes },
    dailyAverage: {
      sessions: Math.round(stats.totalSessions / Math.max(daysInRange, 1)),
      minutes: Math.round(stats.totalFocusMinutes / Math.max(daysInRange, 1)),
    },
    peakHours: peakPatterns.map(pattern => pattern.timeOfDay),
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
  focusSessions: FocusSessionLike[]
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
  energyLogs: EnergyLogLike[]
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
    a.timestamp.localeCompare(b.timestamp)
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
      bucket.daysTracked > 0
        ? Math.round((bucket.completed / bucket.daysTracked) * 100)
        : 0;
  }

  const blocks = Array.from(byBlock.values()).sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );
  const mostMissed =
    blocks.filter((block) => block.missed > 0).sort((a, b) => b.missed - a.missed)[0] ??
    null;

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
  const durational = logs.filter(log => log.actualDurationMinutes !== null);
  const periodStats = logs.length > 0
    ? {
        loggedDays: logs.length,
        averageDurationMinutes: durational.length > 0
          ? Math.round(
              durational.reduce((sum, log) => sum + (log.actualDurationMinutes ?? 0), 0) /
                durational.length
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
    metTarget: latest.actualDurationMinutes !== null
      ? latest.actualDurationMinutes >= target
      : null,
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

function formatIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const analyticsService = new AnalyticsService();