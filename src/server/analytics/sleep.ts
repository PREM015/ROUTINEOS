import { compareAsc } from 'date-fns';
import { APP_CONFIG } from '@/config/app';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import {
  analyzeSleep,
  sleepMinutes,
  type SleepLogLike,
} from '@/server/domain/sleep/sleep-analyzer';
import type { DateRange, SleepAnalyticsSummary } from '@/types/analytics';

/**
 * Sleep Analytics
 * Averages, consistency variance, debt trend, quality, and a daily timeline.
 */

const sleepRepository = new SleepRepository();

const TARGET_DURATION = APP_CONFIG.defaults.sleep.targetDuration;

function toSleepLogLike(log: {
  date: string;
  actualBedtime: string | null;
  actualWakeTime: string | null;
  quality: number | null;
  wakeUpCount?: number | null;
}): SleepLogLike | null {
  if (log.actualBedtime === null || log.actualWakeTime === null) return null;
  return {
    date: log.date,
    actualBedtime: log.actualBedtime,
    actualWakeTime: log.actualWakeTime,
    quality: log.quality,
    wakeUpCount: log.wakeUpCount,
  };
}

function toTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${String(hours % 24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Full sleep analytics report over a date range: averages, consistency,
 * debt trend, quality, and a timeline of duration/quality/deficit.
 */
export async function sleepAnalytics(userId: string, range: DateRange): Promise<SleepAnalyticsSummary> {
  const logs = await sleepRepository.findByRange(userId, range.startDate, range.endDate);
  const analyzable = logs
    .map(toSleepLogLike)
    .filter((log): log is SleepLogLike => log !== null);

  const analysis = analyzeSleep(analyzable, TARGET_DURATION);

  const durations = logs
    .filter(log => log.actualDurationMinutes !== null)
    .map(log => log.actualDurationMinutes as number);

  const half = Math.ceil(analyzable.length / 2);
  const firstHalfDeficit = meanOf(analyzable.slice(0, half).map(log => Math.max(0, TARGET_DURATION - sleepMinutes(log))));
  const secondHalfDeficit = meanOf(analyzable.slice(half).map(log => Math.max(0, TARGET_DURATION - sleepMinutes(log))));
  const debtTrend: 'IMPROVING' | 'WORSENING' | 'STABLE' =
    secondHalfDeficit < firstHalfDeficit - 10 ? 'IMPROVING'
      : secondHalfDeficit > firstHalfDeficit + 10 ? 'WORSENING'
        : 'STABLE';

  const rated = analyzable.filter(log => log.quality !== null && log.quality !== undefined);
  const daysFeelRested = await sleepRepository.countRestedDays(userId, range.startDate, range.endDate);

  const timeline = analyzable
    .sort((a, b) => compareAsc(new Date(`${a.date}T00:00:00Z`), new Date(`${b.date}T00:00:00Z`)))
    .map(log => {
      const duration = sleepMinutes(log);
      const deficit = Math.max(0, TARGET_DURATION - duration);
      return {
        date: log.date,
        duration: Math.round(duration),
        quality: log.quality ?? null,
        deficit,
      };
    });

  return {
    period: range,
    averages: {
      duration: Math.round(analysis.averageDuration),
      bedtime: toTimeString(analysis.averageBedtimeMinutes),
      wakeTime: toTimeString(analysis.averageWakeTimeMinutes),
      quality: analysis.averageQuality !== null ? round(analysis.averageQuality) : null,
      interruptions: null,
    },
    consistency: {
      bedtimeVariance: Math.round(stdDev(
        analyzable.map(log => toMinutes(log.actualBedtime))
      )),
      wakeTimeVariance: Math.round(stdDev(
        analyzable.map(log => toMinutes(log.actualWakeTime))
      )),
      durationVariance: Math.round(stdDev(durations)),
      score: Math.round(analysis.consistencyScore),
    },
    debt: {
      total: Math.round(analysis.totalDeficit),
      average: round(analysis.averageDeficit),
      trend: debtTrend,
    },
    quality: {
      averageRating: rated.length > 0
        ? round(rated.reduce((sum, log) => sum + (log.quality ?? 0), 0) / rated.length)
        : null,
      daysFeelRested,
      percentageRested: logs.length > 0
        ? round((daysFeelRested / logs.length) * 100)
        : 0,
    },
    timeline,
  };
}

function toMinutes(time: string): number {
  const [hours = '0', minutes = '0'] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function meanOf(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}