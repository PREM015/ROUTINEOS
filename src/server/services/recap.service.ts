import type { DailyScore, EnergyLog, MoodLog } from '@prisma/client';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { DailyBreakdown, dailyBreakdown } from '@/server/analytics/daily';
import { WeeklySummary, weeklySummary } from '@/server/analytics/weekly';
import { MonthlySummary, monthlySummary } from '@/server/analytics/monthly';
import { YearlySummary, yearlySummary } from '@/server/analytics/yearly';
import { streakAnalytics } from '@/server/analytics/streaks';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { ReflectionRepository } from '@/server/repositories/reflection.repository';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { TaskRepository } from '@/server/repositories/task.repository';
import { NutritionRepository } from '@/server/repositories/nutrition.repository';
import { HealthMetricRepository } from '@/server/repositories/health-metric.repository';
import { AchievementRepository } from '@/server/repositories/achievement.repository';
import { ReviewRepository } from '@/server/repositories/review.repository';
import { JournalRepository } from '@/server/repositories/journal.repository';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { MoodRepository } from '@/server/repositories/mood.repository';
import { EnergyRepository } from '@/server/repositories/energy.repository';
import { DEFAULT_TZ, getTodayString } from '@/lib/dates';
import {
  getPeriodRange,
  type Period as PeriodKey,
  type PeriodRange,
} from '@/lib/period-range';
import type { RecapExtras } from '@/types/recap';

/**
 * Recap Service
 * Period summaries (day / week / month / year) built entirely from real user
 * data. Period boundaries + labels come from the shared period-range utility so
 * every surface in the app resolves the same range, in the user's timezone.
 * Each period also carries an `extras` block (heatmap, sleep trend, focus,
 * goals, tasks, nutrition/health, streak events, journal) — all derived from
 * real rows, never fabricated.
 */

export type RecapPeriod = PeriodKey;

export interface RecapScorePoint {
  /** YYYY-MM-DD day; for the year period a YYYY-MM month key. */
  date: string;
  totalScore: number;
  core: number;
  growth: number;
  bonus: number;
}

export interface RecapReport {
  period: RecapPeriod;
  anchorDate: string;
  startDate: string;
  endDate: string;
  label: string;
  isCurrent: boolean;
  hasData: boolean;
  points: RecapScorePoint[];
  extras?: RecapExtras;
  day?: DailyBreakdown;
  week?: WeeklySummary;
  month?: MonthlySummary;
  year?: YearlySummary;
}

/** 2000-01-01: comfortably older than any real account. */
const ACCOUNT_EPOCH = '2000-01-01';

function toPoints(scores: DailyScore[]): RecapScorePoint[] {
  return scores
    .filter((score) => score.totalScore !== null)
    .map((score) => ({
      date: score.date,
      totalScore: score.totalScore ?? 0,
      core: score.coreScore ?? 0,
      growth: score.growthScore ?? 0,
      bonus: score.bonusScore ?? 0,
    }));
}

function isValidDate(value: string | undefined): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function isWithin(dateStr: string, start: string, end: string): boolean {
  return dateStr >= start && dateStr <= end;
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

type ReflectionField =
  | 'biggestWin'
  | 'biggestDifficulty'
  | 'lessonsLearned'
  | 'improvements'
  | 'tomorrowFocus'
  | 'reflectionText';

const REFLECTION_FIELDS: ReadonlyArray<readonly [ReflectionField, string]> = [
  ['biggestWin', 'Biggest win'],
  ['biggestDifficulty', 'Biggest difficulty'],
  ['lessonsLearned', 'Lesson learned'],
  ['improvements', 'Worth improving'],
  ['tomorrowFocus', 'Tomorrow focus'],
  ['reflectionText', 'Reflection'],
];

export class RecapService {
  private scoreRepository: ScoreRepository;
  private userRepository: UserRepository;
  private habitRepository: HabitRepository;
  private sleepRepository: SleepRepository;
  private reflectionRepository: ReflectionRepository;
  private focusRepository: FocusRepository;
  private goalRepository: GoalRepository;
  private taskRepository: TaskRepository;
  private nutritionRepository: NutritionRepository;
  private healthMetricRepository: HealthMetricRepository;
  private achievementRepository: AchievementRepository;
  private reviewRepository: ReviewRepository;
  private journalRepository: JournalRepository;
  private routineRepository: RoutineRepository;
  private moodRepository: MoodRepository;
  private energyRepository: EnergyRepository;

  constructor() {
    this.scoreRepository = new ScoreRepository();
    this.userRepository = new UserRepository();
    this.habitRepository = new HabitRepository();
    this.sleepRepository = new SleepRepository();
    this.reflectionRepository = new ReflectionRepository();
    this.focusRepository = new FocusRepository();
    this.goalRepository = new GoalRepository();
    this.taskRepository = new TaskRepository();
    this.nutritionRepository = new NutritionRepository();
    this.healthMetricRepository = new HealthMetricRepository();
    this.achievementRepository = new AchievementRepository();
    this.reviewRepository = new ReviewRepository();
    this.journalRepository = new JournalRepository();
    this.routineRepository = new RoutineRepository();
    this.moodRepository = new MoodRepository();
    this.energyRepository = new EnergyRepository();
  }

  async getReport(
    userId: string,
    period: RecapPeriod,
    anchorDate?: string
  ): Promise<RecapReport> {
    const settings = await this.userRepository.getSettings(userId);
    const timezone = settings?.timezone || DEFAULT_TZ;
    const anchor = isValidDate(anchorDate) ? (anchorDate as string) : getTodayString(timezone);
    const range = getPeriodRange(period, anchor, timezone);

    const base = {
      period,
      anchorDate: range.anchorDate,
      startDate: range.start,
      endDate: range.end,
      label: range.label,
      isCurrent: range.isCurrent,
    };

    const extras = await this.buildExtras(userId, period, range, timezone);

    if (period === 'day') {
      const result = await this.buildDay(userId, range);
      return { ...base, extras, ...result };
    }
    if (period === 'week') {
      const result = await this.buildWeek(userId, range);
      return { ...base, extras, ...result };
    }
    if (period === 'month') {
      const result = await this.buildMonth(userId, range);
      return { ...base, extras, ...result };
    }
    const result = await this.buildYear(userId, range);
    return { ...base, extras, ...result };
  }

  /**
   * Assemble the `extras` enrichment block. Every dataset runs in parallel
   * (one query per repo — no N+1). Sections with no rows for the period return
   * empty arrays or null so each client card decides its own empty state.
   */
  private async buildExtras(
    userId: string,
    period: RecapPeriod,
    range: PeriodRange,
    timezone: string
  ): Promise<RecapExtras> {
    const { start, end } = range;
    const rangeStart = fromZonedTime(`${start}T00:00:00`, timezone);
    const rangeEnd = fromZonedTime(`${end}T23:59:59.999`, timezone);

    const [
      habitLogs,
      sleepLogs,
      reflectionRows,
      focusSessions,
      goals,
      taskThroughput,
      nutritionEntries,
      healthMetrics,
      streakReport,
      achievements,
      linkedReview,
      journalEntries,
      routineExceptionRows,
      moodLogs,
      energyLogs,
      completedMilestones,
    ] = await Promise.all([
      this.habitRepository.findLogsByUserRange(userId, start, end),
      this.sleepRepository.findByRange(userId, start, end),
      this.reflectionRepository.findByRange(userId, start, end),
      this.focusRepository.findSessions(userId, { from: start, to: end }),
      this.goalRepository.findAll(userId),
      this.taskRepository.getThroughput(
        userId,
        new Date(`${start}T00:00:00`),
        new Date(`${end}T23:59:59.999`)
      ),
      this.nutritionRepository.findAll(userId, { startDate: start, endDate: end }),
      this.healthMetricRepository.findAll(userId, { startDate: start, endDate: end }),
      streakAnalytics(userId, { startDate: ACCOUNT_EPOCH, endDate: end }),
      this.achievementRepository.findUnlocked(userId),
      this.linkedReviewFor(userId, period, range),
      this.journalRepository.findAll(userId, { from: start, to: end, limit: 6 }),
      this.routineRepository.findExceptionsByRange(userId, start, end),
      this.moodRepository.getMoodRange(userId, rangeStart, rangeEnd),
      this.energyRepository.getRange(userId, rangeStart, rangeEnd),
      this.goalRepository.findCompletedMilestones(userId, rangeStart, rangeEnd),
    ]);

    // Heatmap: per-day habit completion (status-aware scheduled denominator).
    const dayMap = new Map<string, { completed: number; scheduled: number }>();
    for (const log of habitLogs) {
      const bucket = dayMap.get(log.date) ?? { completed: 0, scheduled: 0 };
      if (log.status === 'COMPLETED') bucket.completed++;
      if (log.status !== 'SKIPPED' && log.status !== 'NOT_APPLICABLE') {
        bucket.scheduled++;
      }
      dayMap.set(log.date, bucket);
    }
    const habitHeatmap = Array.from(dayMap.entries()).map(([date, value]) => ({
      date,
      completed: value.completed,
      scheduled: value.scheduled,
    }));

    const sleepTrend = sleepLogs.map((log) => ({
      date: log.date,
      durationMinutes: log.actualDurationMinutes,
    }));

    // Mood & energy: prefer live MoodLog / EnergyLog readings (latest per day),
    // falling back to the daily reflection when no logs exist for that date.
    const moodByDay = new Map<string, MoodLog>();
    for (const log of moodLogs) {
      const day = formatInTimeZone(log.timestamp, timezone, 'yyyy-MM-dd');
      const existing = moodByDay.get(day);
      if (!existing || log.timestamp >= existing.timestamp) moodByDay.set(day, log);
    }
    const energyByDay = new Map<string, EnergyLog>();
    for (const log of energyLogs) {
      const day = formatInTimeZone(log.timestamp, timezone, 'yyyy-MM-dd');
      const existing = energyByDay.get(day);
      if (!existing || log.timestamp >= existing.timestamp) energyByDay.set(day, log);
    }
    const reflectionByDate = new Map(reflectionRows.map((r) => [r.date, r] as const));
    const moodDates = new Set<string>([
      ...moodByDay.keys(),
      ...energyByDay.keys(),
      ...reflectionByDate.keys(),
    ]);
    const moodEnergy = Array.from(moodDates)
      .sort()
      .map((date) => {
        const moodLog = moodByDay.get(date);
        const energyLog = energyByDay.get(date);
        const reflection = reflectionByDate.get(date);
        return {
          date,
          mood: moodLog?.mood ?? reflection?.mood ?? null,
          energy: energyLog?.energyLevel ?? moodLog?.energy ?? reflection?.energy ?? null,
          source: moodLog !== undefined || energyLog !== undefined
            ? ('logs' as const)
            : ('reflection' as const),
          triggers: parseTags(moodLog?.triggers ?? null),
          activities: parseTags(moodLog?.activities ?? null),
        };
      });

    // Focus minutes per category (name from the linked category, fallback tag).
    const focusByCategoryMap = new Map<string, { minutes: number; sessions: number }>();
    for (const session of focusSessions) {
      if (session.completedAt === null || session.actualDuration === null) continue;
      const name = session.category?.name ?? 'Uncategorized';
      const bucket = focusByCategoryMap.get(name) ?? { minutes: 0, sessions: 0 };
      bucket.minutes += session.actualDuration;
      bucket.sessions++;
      focusByCategoryMap.set(name, bucket);
    }
    const focusByCategory = Array.from(focusByCategoryMap.entries()).map(
      ([name, value]) => ({ name, ...value })
    );

    // Goals: completed within the period, live active count, average progress.
    const activeGoals = goals.filter((goal) => goal.status === 'ACTIVE');
    const completedInPeriod = goals.filter(
      (goal) => goal.completedAt !== null && isWithin(goal.completedAt.toISOString().slice(0, 10), start, end)
    ).length;
    const progressValues = activeGoals
      .filter((goal) => goal.targetValue > 0)
      .map((goal) => clamp((goal.currentValue / goal.targetValue) * 100, 0, 100));
    const goalsDelta = {
      completedInPeriod,
      activeCount: activeGoals.length,
      averageProgress:
        progressValues.length > 0
          ? Math.round(progressValues.reduce((sum, v) => sum + v, 0) / progressValues.length)
          : 0,
    };

    // Nutrition: null-when-empty.
    const nutritionDays = new Set(nutritionEntries.map((entry) => entry.date));
    const nutrition =
      nutritionEntries.length > 0
        ? {
            entries: nutritionEntries.length,
            calories: nutritionEntries.some((entry) => entry.calories !== null)
              ? Math.round(
                  nutritionEntries.reduce(
                    (sum, entry) => sum + (entry.calories ?? 0),
                    0
                  )
                )
              : null,
            daysLogged: nutritionDays.size,
          }
        : null;

    // Health metrics: null-when-empty.
    const health =
      healthMetrics.length > 0
        ? healthMetrics.map((metric) => ({
            metricType: metric.metricType,
            value: metric.value,
            unit: metric.unit,
            date: metric.date,
          }))
        : null;

    // Streak milestones reached inside this period only.
    const streakEvents = streakReport.milestones
      .filter((milestone) => isWithin(milestone.reachedDate, start, end))
      .map((milestone) => ({
        type: milestone.type,
        days: milestone.days,
        reachedDate: milestone.reachedDate,
      }));

    // Achievements unlocked inside this period.
    const achievementsInPeriod = achievements
      .filter((achievement) =>
        isWithin(achievement.unlockedAt.toISOString().slice(0, 10), start, end)
      )
      .map((achievement) => ({
        title: achievement.title,
        description: achievement.description,
        unlockedAt: achievement.unlockedAt.toISOString().slice(0, 10),
      }));

    const journal = journalEntries.map((entry) => ({
      date: entry.date,
      title: entry.title,
      snippet:
        entry.content != null && entry.content.length > 160
          ? `${entry.content.slice(0, 160)}\u2026`
          : (entry.content ?? ''),
    }));

    const routineExceptions = routineExceptionRows.map((exception) => ({
      date: exception.date,
      dayType: exception.dayType,
      reason: exception.reason,
      note: exception.note,
      templateName: exception.template?.name ?? null,
    }));

    const milestoneHits = completedMilestones.map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      description: milestone.description,
      goalTitle: milestone.goal.title,
      projectTitle: milestone.goal.project?.name ?? null,
      completedAt: formatInTimeZone(milestone.completedAt as Date, timezone, 'yyyy-MM-dd'),
    }));

    // Reflections: only days with narrative content make the list.
    const reflections = reflectionRows
      .map((reflection) => {
        const narrative: Array<{ label: string; value: string }> = [];
        for (const [field, label] of REFLECTION_FIELDS) {
          const value = reflection[field];
          if (value !== null && value !== undefined && value.trim().length > 0) {
            narrative.push({ label, value });
          }
        }
        const gratitude = parseTags(reflection.gratitude ?? null);
        if (gratitude.length > 0) {
          narrative.push({ label: 'Grateful for', value: gratitude.join(', ') });
        }
        const priorities = parseTags(reflection.tomorrowPriorities ?? null);
        if (priorities.length > 0) {
          narrative.push({ label: 'Tomorrow priorities', value: priorities.join(', ') });
        }
        return {
          date: reflection.date,
          mood: reflection.mood,
          energy: reflection.energy,
          narrative,
        };
      })
      .filter((reflection) => reflection.narrative.length > 0);

    return {
      habitHeatmap,
      sleepTrend,
      moodEnergy,
      focusByCategory,
      goalsDelta,
      taskThroughput,
      nutrition,
      health,
      streakEvents,
      achievements: achievementsInPeriod,
      linkedReview,
      journal,
      routineExceptions,
      milestoneHits,
      reflections,
    };
  }

  private async linkedReviewFor(
    userId: string,
    period: RecapPeriod,
    range: PeriodRange
  ): Promise<RecapExtras['linkedReview']> {
    if (period === 'week') {
      const review = await this.reviewRepository.findByWeek(userId, range.start);
      if (!review) return null;
      return {
        kind: 'weekly' as const,
        period: range.start,
        biggestWins: review.biggestWins,
        challenges: review.challenges,
        lessonsLearned: review.lessonsLearned,
        nextFocus: review.nextWeekFocus,
        overallSatisfaction: review.overallSatisfaction,
      };
    }
    if (period === 'month') {
      const month = range.start.slice(0, 7);
      const reset = await this.reviewRepository.findMonthly(userId, month);
      if (!reset) return null;
      return {
        kind: 'monthly' as const,
        period: month,
        biggestWins: reset.monthHighlights,
        challenges: reset.monthChallenges,
        lessonsLearned: null,
        nextFocus: reset.nextMonthFocus,
        overallSatisfaction: reset.overallSatisfaction,
      };
    }
    return null;
  }

  private async buildDay(userId: string, range: PeriodRange) {
    const anchor = range.anchorDate;
    const breakdown = await dailyBreakdown(userId, anchor);
    const score = await this.scoreRepository.findByDate(userId, anchor);

    const points = score && score.totalScore !== null
      ? [{
          date: anchor,
          totalScore: score.totalScore ?? 0,
          core: score.coreScore ?? 0,
          growth: score.growthScore ?? 0,
          bonus: score.bonusScore ?? 0,
        }]
      : [];

    const hasData =
      score?.totalScore !== null ||
      breakdown.tiers.some((tier) => tier.total > 0) ||
      breakdown.habits.some((habit) => habit.status !== 'NOT_LOGGED') ||
      breakdown.routine.total > 0 ||
      breakdown.sleep.logged;

    return { hasData, points, day: breakdown };
  }

  private async buildWeek(userId: string, range: PeriodRange) {
    const summary = await weeklySummary(userId, range.start);
    const scores = await this.scoreRepository.findByRange(userId, range.start, range.end);
    const points = toPoints(scores);

    const hasData =
      points.length > 0 ||
      summary.scores.average > 0 ||
      summary.scores.perfectDays > 0 ||
      summary.scores.excellentDays > 0 ||
      summary.habits.perHabit.some((habit) => habit.scheduled > 0) ||
      summary.sleep.loggedDays > 0;

    return { hasData, points, week: summary };
  }

  private async buildMonth(userId: string, range: PeriodRange) {
    const month = range.anchorDate.slice(0, 7);
    const summary = await monthlySummary(userId, month);
    const scores = await this.scoreRepository.findByRange(userId, range.start, range.end);
    const points = toPoints(scores);

    const hasData =
      points.length > 0 ||
      summary.scores.average > 0 ||
      summary.habits.totalCompleted > 0 ||
      summary.habits.totalMissed > 0 ||
      summary.sleep.averageDuration > 0 ||
      summary.focus.totalSessions > 0;

    return { hasData, points, month: summary };
  }

  private async buildYear(userId: string, range: PeriodRange) {
    const year = Number(range.anchorDate.slice(0, 4));
    const summary = await yearlySummary(userId, year);

    const points = summary.monthlyScoreTrend.map((entry) => ({
      date: entry.month,
      totalScore: entry.averageScore,
      core: 0,
      growth: 0,
      bonus: 0,
    }));

    const hasData =
      summary.totalDaysScored > 0 ||
      summary.habits.totalCompleted > 0 ||
      summary.habits.totalMissed > 0 ||
      summary.sleep.averageDuration > 0 ||
      summary.focus.totalSessions > 0 ||
      summary.journal.entryCount > 0;

    return { hasData, points, year: summary };
  }
}

export const recapService = new RecapService();