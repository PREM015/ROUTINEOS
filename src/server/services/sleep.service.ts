import type { Prisma, SleepLog } from '@prisma/client';
import { format, parseISO, subDays } from 'date-fns';
import { SleepRepository } from '../repositories/sleep.repository';
import { UserRepository } from '../repositories/user.repository';
import {
  calculateSleepDuration,
  calculateSleepDeficit,
} from '@/lib/sleep/calculate-duration';
import { DEFAULT_TZ, getTodayString } from '@/lib/dates';
import type { LogSleepInput } from '@/schemas/sleep.schema';

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
   */
  async logSleep(userId: string, input: LogSleepInput): Promise<SleepLog> {
    const settings = await this.userRepository.getSettings(userId);
    const target = settings?.minSleepDuration ?? this.defaultTarget;
    const bedtime = normalizeTime(input.actualBedtime);
    const wakeTime = normalizeTime(input.actualWakeTime);
    const durationMinutes = calculateSleepDuration(bedtime, wakeTime);

    const data: Omit<Prisma.SleepLogCreateInput, 'userId' | 'date'> = {
      user: { connect: { id: userId } },
      actualBedtime: bedtime,
      actualWakeTime: wakeTime,
      actualDurationMinutes: durationMinutes,
      deficitMinutes: calculateSleepDeficit(durationMinutes, target),
      ...(input.targetBedtime !== undefined && { targetBedtime: input.targetBedtime }),
      ...(input.targetWakeTime !== undefined && { targetWakeTime: input.targetWakeTime }),
      ...(input.quality !== undefined && { quality: input.quality }),
      ...(input.wakeUpCount !== undefined && { wakeUpCount: input.wakeUpCount }),
      ...(input.feltRested !== undefined && { feltRested: input.feltRested }),
      ...(input.moodOnWaking !== undefined && { moodOnWaking: input.moodOnWaking }),
      ...(input.energyOnWaking !== undefined && { energyOnWaking: input.energyOnWaking }),
      ...(input.notes !== undefined && { notes: input.notes }),
    };

    return this.sleepRepository.upsertLog(userId, input.date, data);
  }

  /**
   * List sleep logs. Without an explicit date range the last 30 days ending
   * "today" in the user's timezone are used (never UTC).
   */
  async listLogs(userId: string, params: ListLogsParams = {}): Promise<{
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

  async getSleepStats(userId: string, startDate: string, endDate: string) {
    const logs = await this.sleepRepository.findByRange(userId, startDate, endDate);
    if (!logs.length) return null;

    const avgDuration =
      logs.reduce((acc, l) => acc + (l.actualDurationMinutes || 0), 0) / logs.length;
    return { avgDuration, logsCount: logs.length };
  }

  async detectConflicts(_userId: string, _sleepStart: string, _sleepEnd: string) {
    // Conflict detection logic
    return [];
  }
}

export const sleepService = new SleepService();