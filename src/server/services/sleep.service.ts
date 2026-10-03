import type { Prisma, SleepLog } from '@/generated/prisma';
import { format, parseISO, subDays } from 'date-fns';
import { SleepRepository } from '../repositories/sleep.repository';
import { UserRepository } from '../repositories/user.repository';
import {
  calculateSleepDuration,
  calculateSleepDeficit,
} from '@/lib/sleep/calculate-duration';
import { DEFAULT_TZ, getTodayString } from '@/lib/dates';
import type { LogSleepInput } from '@/schemas/sleep.schema';
import type { UserId } from '@/types/ids';

/**
 * Sleep Service
 * Business logic for sleep logging. Routes delegate here; the service owns the
 * repository. The sleep-deficit target always comes from the user's settings,
 * never a hard-coded constant.
 */

function normalizeTime(value: string): string {
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : trimmed.slice(-5);
}

export interface ListLogsParams {
  date?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export class SleepService {
  private sleepRepository: SleepRepository;
  private userRepository: UserRepository;
  private readonly defaultTarget = 8 * 60;

  constructor() {
    this.sleepRepository = new SleepRepository();
    this.userRepository = new UserRepository();
  }

  /**
   * Log (or update) a night of sleep for a user+date. Only the fields the
   * client actually sent are written, so updating a wake-time summary never
   * clobbers quality/notes/feltRested that were saved earlier the same day.
   *
   * The target window is the exception: it is snapshotted from
   * `UserSettings` when the client did not send one. `/today`'s form sends only
   * bedtime, wake time, quality and restedness, so without this the log's
   * `targetBedtime`/`targetWakeTime` stayed null forever — which meant the
   * "Target" cell rendered an em-dash and `SleepQualityMeter` was stuck on
   * "not enough data yet" for every night logged from the page. Snapshotting
   * on write is also the only way the plan a night was judged against survives
   * a later change to the user's settings.
   */
  async logSleep(userId: UserId, input: LogSleepInput): Promise<SleepLog> {
    const settings = await this.userRepository.getSettings(userId);
    const target = settings?.minSleepDuration ?? this.defaultTarget;
    const bedtime = normalizeTime(input.actualBedtime);
    const wakeTime = normalizeTime(input.actualWakeTime);
    const durationMinutes = calculateSleepDuration(bedtime, wakeTime);

    const targetBedtime = input.targetBedtime ?? settings?.targetBedtime?.trim() ?? null;
    const targetWakeTime = input.targetWakeTime ?? settings?.targetWakeTime?.trim() ?? null;

    const data: Omit<Prisma.SleepLogCreateInput, 'userId' | 'date'> = {
      user: { connect: { id: userId } },
      actualBedtime: bedtime,
      actualWakeTime: wakeTime,
      actualDurationMinutes: durationMinutes,
      deficitMinutes: calculateSleepDeficit(durationMinutes, target),
      ...(targetBedtime !== null && { targetBedtime }),
      ...(targetWakeTime !== null && { targetWakeTime }),
      ...(input.quality !== undefined && { quality: input.quality }),
      ...(input.wakeUpCount !== undefined && { wakeUpCount: input.wakeUpCount }),
      ...(input.feltRested !== undefined && { feltRested: input.feltRested }),
      ...(input.moodOnWaking !== undefined && { moodOnWaking: input.moodOnWaking }),
      ...(input.energyOnWaking !== undefined && { energyOnWaking: input.energyOnWaking }),
      ...(input.notes !== undefined && { notes: input.notes }),
    };

    const log = await this.sleepRepository.upsertLog(userId, input.date, data);

    const { ScoringService } = await import('./scoring.service');
    await new ScoringService().calculateDailyScore(userId, input.date);

    return log;
  }

  /**
   * List sleep logs. Without an explicit date range the last 30 days ending
   * "today" in the user's timezone are used (never UTC).
   */
  async listLogs(userId: UserId, params: ListLogsParams = {}): Promise<{
    logs: SleepLog[];
    total: number;
    startDate: string;
    endDate: string;
  }> {
    if (params.date) {
      const log = await this.sleepRepository.findByDate(userId, params.date);
      return {
        logs: log ? [log] : [],
        total: log ? 1 : 0,
        startDate: params.date,
        endDate: params.date,
      };
    }

    const settings = await this.userRepository.getSettings(userId);
    const timezone = settings?.timezone || DEFAULT_TZ;
    const endDate = params.endDate ?? getTodayString(timezone);
    const startDate =
      params.startDate ?? format(subDays(parseISO(endDate), 29), 'yyyy-MM-dd');

    const logs = await this.sleepRepository.findByRange(userId, startDate, endDate);
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 100;
    return {
      logs: logs.slice(offset, offset + limit),
      total: logs.length,
      startDate,
      endDate,
    };
  }

  /**
   * Average duration across the days that actually recorded one.
   *
   * Days with no `actualDurationMinutes` are excluded from both numerator and
   * denominator — dividing by every logged day (as this used to) under-reports
   * the average whenever a night was missed.
   */
  async getSleepStats(userId: UserId, startDate: string, endDate: string) {
    const logs = await this.sleepRepository.findByRange(userId, startDate, endDate);
    const valid = logs.filter((l) => l.actualDurationMinutes !== null);
    if (valid.length === 0) return null;

    const total = valid.reduce((acc, l) => acc + (l.actualDurationMinutes || 0), 0);
    return { avgDuration: total / valid.length, logsCount: valid.length };
  }

  /**
   * Sleep logs for a date range plus the summary shown alongside them.
   *
   * This is the single implementation of the sleep-history summary;
   * `/api/sleep/history` used to compute its own, slightly different version
   * inline (and divided by all logged days rather than only the ones with a
   * recorded duration).
   */
  async getSleepHistory(userId: UserId, startDate: string, endDate: string) {
    const logs = await this.sleepRepository.findByRange(userId, startDate, endDate);

    const validLogs = logs.filter((l) => l.actualDurationMinutes !== null);
    const qualityLogs = logs.filter((l) => l.quality !== null && l.quality !== undefined);

    const summary = {
      totalDays: logs.length,
      averageDuration:
        validLogs.length > 0
          ? Math.round(
              validLogs.reduce((sum, l) => sum + (l.actualDurationMinutes || 0), 0) /
                validLogs.length
            )
          : 0,
      averageQuality:
        qualityLogs.length > 0
          ? Math.round(
              (qualityLogs.reduce((sum, l) => sum + (l.quality || 0), 0) /
                qualityLogs.length) * 100
            ) / 100
          : null,
      totalDeficit: validLogs.reduce((sum, l) => sum + (l.deficitMinutes || 0), 0),
      daysRested: logs.filter((l) => l.feltRested).length,
    };

    return { logs, summary };
  }

  async detectConflicts(_userId: string, _sleepStart: string, _sleepEnd: string) {
    // Conflict detection logic
    return [];
  }
}

export const sleepService = new SleepService();
