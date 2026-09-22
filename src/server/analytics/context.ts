import type { DayType } from '@prisma/client';
import { eachDayOfInterval } from 'date-fns';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { MoodRepository } from '@/server/repositories/mood.repository';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { SleepRepository } from '@/server/repositories/sleep.repository';
import type { ContextAnalytics, DateRange } from '@/types/analytics';

/**
 * Context Analytics
 * Performance breakdown by day type, weekday, and cross-domain correlations.
 */

const habitRepository = new HabitRepository();
const scoreRepository = new ScoreRepository();
const routineRepository = new RoutineRepository();
const moodRepository = new MoodRepository();
const sleepRepository = new SleepRepository();

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

interface DayContext {
  date: string;
  weekdayIndex: number;
  dayType: DayType;
  score: number | null;
  completionRate: number | null;
  sleepMinutes: number | null;
  mood: number | null;
  energy: number | null;
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const meanA = a.slice(0, n).reduce((sum, value) => sum + value, 0) / n;
  const meanB = b.slice(0, n).reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < n; i++) {
    const da = (a[i] ?? 0) - meanA;
    const db = (b[i] ?? 0) - meanB;
    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  if (denomA === 0 || denomB === 0) return 0;
  return round(numerator / Math.sqrt(denomA * denomB));
}

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

/**
 * Context-aware analytics: day-type/weekday averages and correlations
 * between sleep, energy, mood, and daily score/completion.
 */
export async function contextInsights(userId: string, range: DateRange): Promise<ContextAnalytics> {
  const interval = eachDayOfInterval({
    start: new Date(`${range.startDate}T00:00:00Z`),
    end: new Date(`${range.endDate}T00:00:00Z`),
  });

  const days: DayContext[] = await Promise.all(
    interval.map(async (day) => {
      const date = day.toISOString().slice(0, 10);
      const weekdayIndex = day.getUTCDay();

      const [score, exception, logsForDate] = await Promise.all([
        scoreRepository.findByDate(userId, date),
        routineRepository.findException(userId, date),
        habitRepository.findLogsByDate(userId, date),
      ]);

      const completed = logsForDate.filter(log => log.status === 'COMPLETED').length;
      const dayType: DayType = exception?.dayType ?? (weekdayIndex === 0 || weekdayIndex === 6 ? 'WEEKEND' : 'WORKDAY');

      return {
        date,
        weekdayIndex,
        dayType,
        score: score?.totalScore ?? null,
        completionRate: logsForDate.length > 0 ? (completed / logsForDate.length) * 100 : null,
        sleepMinutes: null,
        mood: null,
        energy: null,
      };
    })
  );

  const [sleepLogs, moodLogs, energyLogs] = await Promise.all([
    sleepRepository.findByRange(userId, range.startDate, range.endDate),
    moodRepository.getMoodRange(
      userId,
      new Date(`${range.startDate}T00:00:00.000Z`),
      new Date(`${range.endDate}T23:59:59.999Z`)
    ),
    moodRepository.getEnergyRange(
      userId,
      new Date(`${range.startDate}T00:00:00.000Z`),
      new Date(`${range.endDate}T23:59:59.999Z`)
    ),
  ]);

  const sleepByDate = new Map<string, number>();
  for (const log of sleepLogs) {
    if (log.actualDurationMinutes !== null) {
      sleepByDate.set(log.date, log.actualDurationMinutes);
    }
  }

  const moodByDate = new Map<string, number>();
  const energyByDate = new Map<string, number>();
  for (const log of moodLogs) {
    const date = log.timestamp.toISOString().slice(0, 10);
    moodByDate.set(date, log.mood);
    if (log.energy !== null && log.energy !== undefined && !energyByDate.has(date)) {
      energyByDate.set(date, log.energy);
    }
  }
  for (const log of energyLogs) {
    const date = log.timestamp.toISOString().slice(0, 10);
    if (!energyByDate.has(date)) {
      energyByDate.set(date, log.energyLevel);
    }
  }

  for (const day of days) {
    day.sleepMinutes = sleepByDate.get(day.date) ?? null;
    day.mood = moodByDate.get(day.date) ?? null;
    day.energy = energyByDate.get(day.date) ?? null;
  }

  const byDayType = new Map<DayType, DayContext[]>();
  const byWeekday = new Map<number, DayContext[]>();
  for (const day of days) {
    const typeBucket = byDayType.get(day.dayType) ?? [];
    typeBucket.push(day);
    byDayType.set(day.dayType, typeBucket);

    const weekdayBucket = byWeekday.get(day.weekdayIndex) ?? [];
    weekdayBucket.push(day);
    byWeekday.set(day.weekdayIndex, weekdayBucket);
  }

  const dayTypeSummary = Array.from(byDayType.entries()).map(([dayType, daysInBucket]) => {
    const scores = daysInBucket
      .map(day => day.score)
      .filter((value): value is number => value !== null);
    const completions = daysInBucket
      .map(day => day.completionRate)
      .filter((value): value is number => value !== null);
    return {
      dayType,
      count: daysInBucket.length,
      averageScore: scores.length > 0 ? round(mean(scores)) : 0,
      averageCompletionRate: completions.length > 0 ? round(mean(completions)) : 0,
    };
  });

  const weekdayBest = new Map<number, Array<{ name: string; rate: number }>>();
  const weekdayWorst = new Map<number, Array<{ name: string; rate: number }>>();
  const habits = await habitRepository.findAll(userId, { status: 'ACTIVE' });

  for (const habit of habits) {
    const logs = await habitRepository.findLogsByRange(habit.id, userId, range.startDate, range.endDate);
    const byHabitWeekday = new Map<number, { completed: number; total: number }>();
    for (const log of logs) {
      const isoDay = new Date(`${log.date}T00:00:00Z`).getUTCDay();
      const bucket = byHabitWeekday.get(isoDay) ?? { completed: 0, total: 0 };
      bucket.total++;
      if (log.status === 'COMPLETED') bucket.completed++;
      byHabitWeekday.set(isoDay, bucket);
    }

    for (const [isoDay, bucket] of byHabitWeekday.entries()) {
      if (bucket.total === 0) continue;
      const rate = bucket.completed / bucket.total;
      const best = weekdayBest.get(isoDay) ?? [];
      const worst = weekdayWorst.get(isoDay) ?? [];
      best.push({ name: habit.name, rate });
      worst.push({ name: habit.name, rate });
      weekdayBest.set(isoDay, best);
      weekdayWorst.set(isoDay, worst);
    }
  }

  const weekdaySummary = Array.from(byWeekday.entries()).map(([weekdayIndex, daysInBucket]) => {
    const scores = daysInBucket
      .map(day => day.score)
      .filter((value): value is number => value !== null);
    const completions = daysInBucket
      .map(day => day.completionRate)
      .filter((value): value is number => value !== null);

    const ranked = (weekdayBest.get(weekdayIndex) ?? [])
      .sort((a, b) => b.rate - a.rate)
      .map(entry => entry.name)
      .slice(0, 3);
    const poorest = (weekdayWorst.get(weekdayIndex) ?? [])
      .sort((a, b) => a.rate - b.rate)
      .map(entry => entry.name)
      .slice(0, 3);

    return {
      weekday: WEEKDAY_NAMES[weekdayIndex] ?? '',
      count: daysInBucket.length,
      averageScore: scores.length > 0 ? round(mean(scores)) : 0,
      averageCompletionRate: completions.length > 0 ? round(mean(completions)) : 0,
      bestHabits: ranked,
      worstHabits: poorest,
    };
  });

  const scoreVsSleep: number[] = [];
  const scoreVsSleepB: number[] = [];
  const completionVals: number[] = [];
  const energyVals: number[] = [];
  const moodVals: number[] = [];
  const scoreVals: number[] = [];

  for (const day of days) {
    if (day.sleepMinutes !== null && day.score !== null) {
      scoreVsSleep.push(day.score);
      scoreVsSleepB.push(day.sleepMinutes);
    }
    if (day.completionRate !== null && day.energy !== null) {
      completionVals.push(day.completionRate);
      energyVals.push(day.energy);
    }
    if (day.completionRate !== null && day.mood !== null) {
      moodVals.push(day.mood);
      scoreVals.push(day.completionRate);
    }
  }

  return {
    period: range,
    byDayType: dayTypeSummary,
    byWeekday: weekdaySummary,
    correlations: {
      sleepVsScore: pearson(scoreVsSleep, scoreVsSleepB),
      energyVsCompletion: pearson(energyVals, completionVals),
      moodVsProductivity: pearson(moodVals, scoreVals),
    },
  };
}