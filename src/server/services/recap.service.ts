import type { DailyScore, EnergyLog, MoodLog } from '@/generated/prisma';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { DailyBreakdown, dailyBreakdown } from '@/server/analytics/daily';
import { WeeklySummary, weeklySummary } from '@/server/analytics/weekly';
import { MonthlySummary, monthlySummary } from '@/server/analytics/monthly';
import { YearlySummary, yearlySummary } from '@/server/analytics/yearly';
import { streakAnalytics } from '@/server/analytics/streaks';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { UserRepository } from '@/server/repositories/user.repository';
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
  resolveWeekStartsOn,
  type Period as PeriodKey,
  type PeriodRange,
  type WeekStartsOn,
} from '@/lib/period-range';
import { loadPeriodHabits } from '@/server/analytics/period-habits';
import type { PeriodHabitModel } from '@/lib/analytics/period-habits';
import {
  extrasHaveActivity,
  heatmapFromModel,
  periodHasActivity,
  type RecapHeatmapDay,
} from '@/lib/recap/derive';
import type { RecapExtras } from '@/types/recap';
import type { UserId } from '@/types/ids';

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

/**
 * Everything a period module needs, resolved once per request.
 *
 * Grouped into one object because passing six positional arguments to four
 * methods is how `today` and `weekStartsOn` came to be omitted in the first
 * place. Adding a dimension to the period context is now a change to this type
 * and to `getReport`, not a hunt through call sites.
 */
interface PeriodContext {
  userId: UserId;
  range: PeriodRange;
  timezone: string;
  /** The user's real today, in their zone. Clips live windows. */
  today: string;
  weekStartsOn: WeekStartsOn;
  /** Loaded once, shared by the period module and the heatmap. */
  habitModel: PeriodHabitModel;
}

/**
 * What a period builder hands back.
 *
 * `probe` is deliberately *not* the final `hasData`. It answers only "can the
 * period data alone prove this window is empty", and it runs before the sixteen
 * extras reads. `getReport` combines it with what `extras` found.
 */
interface PeriodBuild<TSummary> {
  probe: boolean;
  points: RecapScorePoint[];
  habitModel: PeriodHabitModel;
  summary: TSummary;
}

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
  /**
   * The weekday this report's range was resolved against.
   *
   * Reported so the client can navigate by the same week the server used.
   * Without it the URL hook falls back to Monday, and for a user who set "week
   * starts on Sunday" the label and the arrows would describe a different week
   * from the data on screen — the same two-answers failure `AnalyticsService`
   * already solves by reporting `range.weekStartsOn`.
   */
  weekStartsOn: WeekStartsOn;
  hasData: boolean;
  points: RecapScorePoint[];
  habitCoverage: {
    dueDays: number;
    totalDays: number;
    completionRate: number | null;
  };
  /**
   * Absent — not empty — when the period has no activity at all.
   *
   * `buildExtras` issues sixteen reads, so it is skipped entirely for a window
   * the cheap probe can already prove is empty, and this is genuinely
   * `undefined` in that case rather than an object full of empty arrays.
   */
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

  /**
   * Resolve the reporting window and build the whole report.
   *
   * ## Period context is resolved once, completely
   *
   * `timezone`, `today` and `weekStartsOn` all come from the same settings row
   * `AnalyticsService` uses, and all three are passed to the period modules.
   * This service used to pass only `timezone`, which meant:
   *
   *  - `loadPeriodHabits` fell back to `today = range.endDate`, so the window
   *    was clipped to the *end of the period* rather than to now. The live week
   *    was scored against the Sunday that had not happened yet and the live
   *    year against December — the exact failure
   *    `lib/analytics/period-habits.ts` documents as fixed.
   *  - `getPeriodRange` fell back to `DEFAULT_WEEK_STARTS_ON`, so a user who set
   *    "week starts on Sunday" saw a Monday-bounded week here and the correct
   *    one on `/analytics`.
   *
   * Two surfaces, two answers, from one account. The fix is not to pass the
   * right argument at each of the six call sites below; it is to resolve the
   * context once and thread it.
   *
   * ## Order of operations
   *
   * The period is built first, then a cheap activity probe decides whether the
   * sixteen `extras` reads are worth running at all. `extras` can only ever add
   * activity, never remove it, so the final `hasData` is the probe OR what
   * `extras` found.
   */
  async getReport(
    userId: UserId,
    period: RecapPeriod,
    anchorDate?: string
  ): Promise<RecapReport> {
    const settings = await this.userRepository.getSettings(userId);
    const timezone = settings?.timezone || DEFAULT_TZ;
    const today = getTodayString(timezone);
    const weekStartsOn = resolveWeekStartsOn(settings?.weekStartsOn);
    const anchor = isValidDate(anchorDate) ? (anchorDate as string) : today;
    const range = getPeriodRange(period, anchor, timezone, weekStartsOn);

    const base = {
      period,
      anchorDate: range.anchorDate,
      startDate: range.start,
      endDate: range.end,
      label: range.label,
      isCurrent: range.isCurrent,
      weekStartsOn,
    };

    /*
      One habit model for the whole request.

      Every period module would otherwise load its own, and `buildExtras` loaded
      a third overlapping copy with `findLogsByUserRange` just to rebuild the
      heatmap denominator by hand. Loading it here and handing it to both is what
      let the heatmap drop its private rule — see `heatmapFromModel`.
    */
    const habitModel = await loadPeriodHabits(userId, range.start, range.end, today);

    const context: PeriodContext = { userId, range, timezone, today, weekStartsOn, habitModel };

    const built =
      period === 'day'
        ? await this.buildDay(context)
        : period === 'week'
          ? await this.buildWeek(context)
          : period === 'month'
            ? await this.buildMonth(context)
            : await this.buildYear(context);

    const coverage = {
      dueDays: built.habitModel.days.filter((day) => day.scheduled > 0).length,
      totalDays: built.habitModel.days.length,
      completionRate: built.habitModel.totals.rate,
    };

    if (!built.probe) {
      // Provably empty. Thirteen of ~21 queries never ran.
      return {
        ...base,
        hasData: false,
        points: built.points,
        habitCoverage: coverage,
        ...built.summary,
      };
    }

    const extras = await this.buildExtras(context);

    return {
      ...base,
      hasData: built.probe || extrasHaveActivity(extras),
      points: built.points,
      habitCoverage: coverage,
      extras,
      ...built.summary,
    };
  }

  /**
   * Assemble the `extras` enrichment block. Every dataset runs in parallel
   * (one query per repo — no N+1). Sections with no rows for the period return
   * empty arrays or null so each client card decides its own empty state.
   *
   * Runs only when the cheap probe says the period has activity, so the sixteen
   * reads below are never paid for a window that has none.
   */
  private async buildExtras(context: PeriodContext): Promise<RecapExtras> {
    const { userId, range, timezone } = context;
    const { start, end } = range;
    const rangeStart = fromZonedTime(`${start}T00:00:00`, timezone);
    const rangeEnd = fromZonedTime(`${end}T23:59:59.999`, timezone);

    const [
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
      this.linkedReviewFor(userId, range.period, range),
      this.journalRepository.findAll(userId, { from: start, to: end, limit: 6 }),
      this.routineRepository.findExceptionsByRange(userId, start, end),
      this.moodRepository.getMoodRange(userId, rangeStart, rangeEnd),
      this.energyRepository.getRange(userId, rangeStart, rangeEnd),
      this.goalRepository.findCompletedMilestones(userId, rangeStart, rangeEnd),
    ]);

    /*
      Heatmap, from the shared period model rather than from raw logs.

      This used to rebuild `{completed, scheduled}` from `HabitLog` rows, counting
      every row that was not SKIPPED or NOT_APPLICABLE. That made it a *fourth*
      definition of "scheduled" in a codebase that had already fought over the
      word twice, and it had no way to express "due but never recorded". The
      model is already loaded for this request and already answers both questions.
    */
    const habitHeatmap: RecapHeatmapDay[] = heatmapFromModel(context.habitModel);

    const sleepTrend = sleepLogs.map((log) => ({
      date: log.date,
      durationMinutes: log.actualDurationMinutes ?? null,
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
    //
    // `completedAt` is bucketed with `formatInTimeZone(..., timezone, ...)` to
    // match how the sleep logs above are bucketed. It used to be sliced straight
    // to a UTC string, so a goal completed at 23:30 local counted towards the
    // *previous* period for anyone east of UTC and the next one for anyone west —
    // the two halves of this same report disagreed with each other.
    const activeGoals = goals.filter((goal) => goal.status === 'ACTIVE');
    const completedInPeriod = goals.filter(
      (goal) =>
        goal.completedAt !== null &&
        isWithin(
          formatInTimeZone(goal.completedAt as Date, timezone, 'yyyy-MM-dd'),
          start,
          end
        )
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

    // Achievements unlocked inside this period. Zoned like everything else in
    // this report, for the same reason as `completedInPeriod` above.
    const achievementsInPeriod = achievements
      .map((achievement) => ({
        title: achievement.title,
        description: achievement.description,
        unlockedAt: formatInTimeZone(
          achievement.unlockedAt as Date,
          timezone,
          'yyyy-MM-dd'
        ),
      }))
      .filter((achievement) =>
        isWithin(achievement.unlockedAt, start, end)
      );

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
    userId: UserId,
    period: RecapPeriod,
    range: PeriodRange
  ): Promise<RecapExtras['linkedReview']> {
    if (period === 'week') {
      const review = await this.reviewRepository.findReviewByWeek(userId, range.start);
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
      const reset = await this.reviewRepository.findMonthlyByMonth(userId, month);
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

private async buildDay(context: PeriodContext): Promise<PeriodBuild<{ day: DailyBreakdown }>> {
    const { userId, range, timezone, today, habitModel } = context;
    const anchor = range.anchorDate;
    const [breakdown, score] = await Promise.all([
      dailyBreakdown(userId, anchor, timezone, today, habitModel),
      this.scoreRepository.findByDate(userId, anchor),
    ]);

    const points = score && score.totalScore !== null
      ? [{
          date: anchor,
          totalScore: score.totalScore ?? 0,
          core: score.coreScore ?? 0,
          growth: score.growthScore ?? 0,
          bonus: score.bonusScore ?? 0,
        }]
      : [];

    /*
      `hasScore` is a boolean, not a comparison against `null`.

      The previous expression was `score?.totalScore !== null`, which is
      `undefined !== null` when the row is absent — always `true`. The day period
      therefore reported that it had data for a user who had none, and the
      "No recap data available" state could never render.
    */
    const hasScore = score !== null && score.totalScore !== null;

    return {
      probe: periodHasActivity('day', {
        hasScore,
        habits: habitModel,
        points,
        day: breakdown,
      }),
      points,
      habitModel,
      summary: { day: breakdown },
    };
  }

  private async buildWeek(context: PeriodContext): Promise<PeriodBuild<{ week: WeeklySummary }>> {
    const { userId, range, timezone, today, weekStartsOn, habitModel } = context;

    /*
      Scores are fetched once here and handed to `weeklySummary`, which used to
      read the identical range itself. The caller needed the rows for `points`
      and the summary needed them for its averages, so one of the two had to
      accept them from the other; the summary is the better owner of the shape,
      so it takes the rows.
    */
    const scores = await this.scoreRepository.findByRange(userId, range.start, range.end);
    const summary = await weeklySummary(
      userId,
      range.start,
      timezone,
      weekStartsOn,
      today,
      habitModel,
      scores
    );
    const points = toPoints(scores);

    return {
      probe: periodHasActivity('week', {
        hasScore: points.length > 0,
        habits: habitModel,
        points,
        week: summary,
      }),
      points,
      habitModel,
      summary: { week: summary },
    };
  }

  private async buildMonth(context: PeriodContext): Promise<PeriodBuild<{ month: MonthlySummary }>> {
    const { userId, range, timezone, today, weekStartsOn, habitModel } = context;
    const month = range.anchorDate.slice(0, 7);

    const scores = await this.scoreRepository.findByRange(userId, range.start, range.end);
    const summary = await monthlySummary(
      userId,
      month,
      timezone,
      weekStartsOn,
      today,
      habitModel,
      scores
    );
    const points = toPoints(scores);

    return {
      probe: periodHasActivity('month', {
        hasScore: points.length > 0,
        habits: habitModel,
        points,
        month: summary,
      }),
      points,
      habitModel,
      summary: { month: summary },
    };
  }

  private async buildYear(context: PeriodContext): Promise<PeriodBuild<{ year: YearlySummary }>> {
    const { userId, range, timezone, today, habitModel } = context;
    const year = Number(range.anchorDate.slice(0, 4));
    const summary = await yearlySummary(userId, year, timezone, today, habitModel);

    // A month with no scored day is not a zero. Keeping the gap means the recap's
    // trend line breaks rather than diving to the floor for months the user had
    // not reached.
    const points = summary.monthlyScoreTrend
      .filter((entry) => entry.averageScore !== null)
      .map((entry) => ({
        date: entry.month,
        totalScore: entry.averageScore as number,
        core: 0,
        growth: 0,
        bonus: 0,
      }));

    return {
      probe: periodHasActivity('year', {
        hasScore: summary.totalDaysScored > 0,
        habits: habitModel,
        points,
        year: summary,
      }),
      points,
      habitModel,
      summary: { year: summary },
    };
  }
}

export const recapService = new RecapService();
