import type { DailyScore } from '@prisma/client';
import { DailyBreakdown, dailyBreakdown } from '@/server/analytics/daily';
import { WeeklySummary, weeklySummary } from '@/server/analytics/weekly';
import { MonthlySummary, monthlySummary } from '@/server/analytics/monthly';
import { YearlySummary, yearlySummary } from '@/server/analytics/yearly';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { DEFAULT_TZ, getTodayString } from '@/lib/dates';
import {
  getPeriodRange,
  type Period as PeriodKey,
  type PeriodRange,
} from '@/lib/period-range';

/**
 * Recap Service
 * Period summaries (day / week / month / year) built entirely from real user
 * data. Period boundaries + labels come from the shared period-range utility so
 * every surface in the app resolves the same range, in the user's timezone.
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
  day?: DailyBreakdown;
  week?: WeeklySummary;
  month?: MonthlySummary;
  year?: YearlySummary;
}

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

export class RecapService {
  private scoreRepository: ScoreRepository;
  private userRepository: UserRepository;

  constructor() {
    this.scoreRepository = new ScoreRepository();
    this.userRepository = new UserRepository();
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

    if (period === 'day') {
      const result = await this.buildDay(userId, range);
      return { ...base, ...result };
    }
    if (period === 'week') {
      const result = await this.buildWeek(userId, range);
      return { ...base, ...result };
    }
    if (period === 'month') {
      const result = await this.buildMonth(userId, range);
      return { ...base, ...result };
    }
    const result = await this.buildYear(userId, range);
    return { ...base, ...result };
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