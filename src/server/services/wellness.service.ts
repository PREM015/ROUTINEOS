import { MoodRepository } from '@/server/repositories/mood.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { analyzeMood, type MoodLogLike } from '@/lib/wellness/mood-analytics';
import { analyzeEnergyPatterns, type EnergyPoint } from '@/lib/wellness/energy-patterns';
import { correlateMoodWithSleep } from '@/lib/wellness/correlations';
import { generateWellnessInsights } from '@/lib/wellness/insights';
import {
  analyzeSleep,
  type SleepLogLike,
} from '@/server/domain/sleep/sleep-analyzer';
import type { EnergyLog, MoodLog } from '@/generated/prisma';
import type { UserId } from '@/types/ids';

/**
 * Wellness Service
 *
 * Owns the wellness aggregation: date-range defaults, log→analysis projection,
 * pagination and the insight generation that combines mood, energy and sleep.
 *
 * All of this previously lived in the four `/api/wellness/*` routes, with
 * `toDateString`, `defaultRange` and the log projections copy-pasted between
 * them — so a change to, say, the default 30-day window had to be made four
 * times and the pages could disagree.
 */

/** Default lookback window, in days, when no range is supplied. */
export const DEFAULT_WELLNESS_WINDOW_DAYS = 30;

/** Fallback sleep target (minutes) when the user has not set one. */
export const DEFAULT_SLEEP_TARGET_MINUTES = 480;

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The default [start, end] window ending today. */
export function defaultWellnessRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (DEFAULT_WELLNESS_WINDOW_DAYS - 1));
  return { startDate: toDateString(start), endDate: toDateString(end) };
}

/** Inclusive day count between two YYYY-MM-DD strings (minimum 1). */
export function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function toMoodLogLike(log: MoodLog): MoodLogLike {
  return {
    date: log.timestamp.toISOString().slice(0, 10),
    mood: log.mood,
    energy: log.energy,
    timestamp: log.timestamp.toISOString(),
  };
}

function toEnergyPoint(log: EnergyLog): EnergyPoint {
  return {
    date: log.timestamp.toISOString().slice(0, 10),
    time: log.timestamp.toISOString().slice(11, 16),
    energy: log.energyLevel,
  };
}

/** Project sleep rows into the analyser's shape, dropping incomplete nights. */
export function toSleepLogLike(log: {
  date: string;
  actualBedtime: string | null;
  actualWakeTime: string | null;
  quality?: number | null;
  wakeUpCount?: number | null;
}): SleepLogLike | null {
  if (!log.actualBedtime || !log.actualWakeTime) return null;
  return {
    date: log.date,
    actualBedtime: log.actualBedtime,
    actualWakeTime: log.actualWakeTime,
    quality: log.quality,
    wakeUpCount: log.wakeUpCount,
  };
}

export interface WellnessRange {
  startDate?: string;
  endDate?: string;
}

export interface ResolvedRange {
  startDate: string;
  endDate: string;
}

export class WellnessService {
  private moodRepository: MoodRepository;
  private sleepRepository: SleepRepository;
  private userRepository: UserRepository;

  constructor() {
    this.moodRepository = new MoodRepository();
    this.sleepRepository = new SleepRepository();
    this.userRepository = new UserRepository();
  }

  /** Fill in the default window when the caller omitted either bound. */
  resolveRange(range: WellnessRange): ResolvedRange {
    const fallback = defaultWellnessRange();
    return {
      startDate: range.startDate ?? fallback.startDate,
      endDate: range.endDate ?? fallback.endDate,
    };
  }

  /** The user's configured sleep target, or the default. */
  private async sleepTargetMinutes(userId: UserId): Promise<number> {
    const settings = await this.userRepository.getSettings(userId);
    return settings?.minSleepDuration ?? DEFAULT_SLEEP_TARGET_MINUTES;
  }

  // ==========================================================================
  // Mood
  // ==========================================================================

  /**
   * Mood logs over a range, plus a summary computed from today's entries when
   * there are any, otherwise from the whole period.
   */
  async getMoodLogs(
    userId: UserId,
    input: WellnessRange & { limit?: number; offset?: number }
  ) {
    const { startDate, endDate } = this.resolveRange(input);
    const logs = await this.moodRepository.getMoodRange(userId, startDate, endDate);

    const today = toDateString(new Date());
    const todayLogs = logs.filter((log) => toDateString(log.timestamp) === today);
    const summary = analyzeMood(
      (todayLogs.length > 0 ? todayLogs : logs).map(toMoodLogLike)
    );

    const offset = input.offset ?? 0;
    const limit = input.limit ?? 30;
    const data = logs
      .slice()
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(offset, offset + limit);

    return {
      data,
      summary,
      meta: { total: logs.length, limit, offset, startDate, endDate },
    };
  }

  /** Record a mood check-in. */
  async logMood(userId: UserId, input: Parameters<MoodRepository['logMood']>[1]) {
    return this.moodRepository.logMood(userId, input);
  }

  // ==========================================================================
  // Energy
  // ==========================================================================

  /**
   * Energy check-ins over a range, or the pattern analysis when requested.
   */
  async getEnergyLogs(
    userId: UserId,
    input: {
      from?: string;
      to?: string;
      analyze?: boolean;
      limit?: number;
      offset?: number;
    }
  ) {
    const fallback = defaultWellnessRange();
    const from = input.from ?? fallback.startDate;
    const to = input.to ?? fallback.endDate;
    const limit = input.limit ?? 30;
    const offset = input.offset ?? 0;

    if (input.analyze) {
      const logs = await this.moodRepository.getEnergyRange(userId, from, to);
      return {
        analysis: analyzeEnergyPatterns(logs.map(toEnergyPoint)),
        meta: { startDate: from, endDate: to, sampleCount: logs.length },
      };
    }

    const logs = await this.moodRepository.findEnergyByUserId(userId, {
      from,
      to,
      limit,
      offset,
    });

    return {
      data: logs,
      meta: { total: logs.length, limit, offset, startDate: from, endDate: to },
    };
  }

  /** Record an energy check-in. */
  async logEnergy(userId: UserId, input: Parameters<MoodRepository['logEnergy']>[1]) {
    return this.moodRepository.logEnergy(userId, input);
  }

  // ==========================================================================
  // Sleep
  // ==========================================================================

  /**
   * Sleep analytics for a range plus the raw logs. Pagination is only applied
   * when the caller asked for it, so the analysis always sees the full period.
   */
  async getSleepAnalysis(
    userId: UserId,
    input: WellnessRange & { limit?: number; offset?: number }
  ) {
    const { startDate, endDate } = this.resolveRange(input);
    const logs = await this.sleepRepository.findByRange(userId, startDate, endDate);

    const sleepLike = logs
      .map(toSleepLogLike)
      .filter((log): log is SleepLogLike => log !== null);

    const targetMinutes = await this.sleepTargetMinutes(userId);

    const offset = input.offset ?? 0;
    const limit = input.limit ?? 100;
    const paginated = input.limit === undefined ? logs : logs.slice(offset, offset + limit);

    return {
      data: { analysis: analyzeSleep(sleepLike, targetMinutes), logs: paginated },
      meta: {
        total: logs.length,
        limit,
        offset,
        startDate,
        endDate,
        targetMinutes,
      },
    };
  }

  // ==========================================================================
  // Combined overview
  // ==========================================================================

  /**
   * Combined mood + energy + sleep analytics, their correlation, and generated
   * insights for the period.
   */
  async getWellnessStats(userId: UserId, input: WellnessRange) {
    const { startDate, endDate } = this.resolveRange(input);
    const daysAnalyzed = daysBetween(startDate, endDate);

    const [moodLogs, energyLogs, sleepLogs, targetMinutes] = await Promise.all([
      this.moodRepository.getMoodRange(userId, startDate, endDate),
      this.moodRepository.getEnergyRange(userId, startDate, endDate),
      this.sleepRepository.findByRange(userId, startDate, endDate),
      this.sleepTargetMinutes(userId),
    ]);

    const sleepLike = sleepLogs
      .map(toSleepLogLike)
      .filter((log): log is SleepLogLike => log !== null);

    const moodAnalysis = analyzeMood(moodLogs.map(toMoodLogLike));
    const energyAnalysis = analyzeEnergyPatterns(energyLogs.map(toEnergyPoint));
    const sleepAnalysis = analyzeSleep(sleepLike, targetMinutes);

    const sleepMinutesByDate: Record<string, number> = {};
    for (const log of sleepLogs) {
      if (log.actualDurationMinutes !== null) {
        sleepMinutesByDate[log.date] = log.actualDurationMinutes;
      }
    }

    const sleepCorrelation = correlateMoodWithSleep(
      moodLogs.map((log) => ({
        date: log.timestamp.toISOString().slice(0, 10),
        mood: log.mood,
      })),
      sleepMinutesByDate
    );

    const insights = generateWellnessInsights(
      moodAnalysis,
      energyAnalysis,
      { daysAnalyzed, averageSleepMinutes: sleepAnalysis.averageDuration },
      sleepAnalysis,
      sleepCorrelation
    );

    return {
      period: { startDate, endDate, daysAnalyzed },
      mood: moodAnalysis,
      energy: energyAnalysis,
      sleep: sleepAnalysis,
      correlations: { moodWithSleep: sleepCorrelation },
      insights,
    };
  }
}

export const wellnessService = new WellnessService();
