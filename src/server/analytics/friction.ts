import type { HabitLog } from '@prisma/client';
import { HabitRepository } from '@/server/repositories/habit.repository';
import type { DateRange, FrictionAnalysis } from '@/types/analytics';

/**
 * Friction Analysis
 * Weighted friction scoring per habit with pattern detection and coaching.
 */

const habitRepository = new HabitRepository();

const FRICTION_WEIGHTS = {
  missRate: 0.4,
  skipRate: 0.1,
  longestBreak: 0.2,
  inconsistency: 0.2,
  decliningTrend: 0.1,
} as const;

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function longestGap(dates: number[]): number {
  if (dates.length < 2) return 0;
  let maxGap = 0;
  for (let i = 1; i < dates.length; i++) {
    const gap = (dates[i] ?? 0) - (dates[i - 1] ?? 0);
    if (gap > maxGap) maxGap = gap;
  }
  return maxGap;
}

interface HabitFrictionMetrics {
  missRate: number;
  skipRate: number;
  longestBreak: number;
  inconsistency: number;
  declining: number;
  strugglingDays: string[];
}

function analyzeFriction(logs: { date: string; status: HabitLog['status'] }[]): HabitFrictionMetrics {
  const completed = logs.filter(log => log.status === 'COMPLETED');
  const missed = logs.filter(log => log.status === 'MISSED');
  const skipped = logs.filter(log => log.status === 'SKIPPED');

  const total = logs.length;
  const missRate = total > 0 ? missed.length / total : 0;
  const skipRate = total > 0 ? skipped.length / total : 0;

  const completedDates = completed
    .map(log => new Date(`${log.date}T00:00:00Z`).getTime())
    .sort((a, b) => a - b);
  const longestBreak = longestGap(completedDates) / 86400000;

  const gaps: number[] = [];
  for (let i = 1; i < completedDates.length; i++) {
    gaps.push(((completedDates[i] ?? 0) - (completedDates[i - 1] ?? 0)) / 86400000);
  }
  const gapMean = gaps.length > 0 ? mean(gaps) : 0;
  const gapVariance = gaps.length > 0
    ? gaps.reduce((sum, gap) => sum + Math.pow(gap - gapMean, 2), 0) / gaps.length
    : 0;
  const gapCv = gapMean > 0 ? Math.sqrt(gapVariance) / gapMean : 0;
  const inconsistency = Math.max(0, Math.min(1, gapCv));

  const declining = (() => {
    const half = Math.floor(completedDates.length / 2);
    const firstHalf = completedDates.slice(0, half);
    const secondHalf = completedDates.slice(half);
    if (firstHalf.length === 0 || secondHalf.length === 0) return 0;
    const rateA = firstHalf.length / (rangeSpan(firstHalf) + 86400000);
    const rateB = secondHalf.length / (rangeSpan(secondHalf) + 86400000);
    if (rateA === 0) return 0;
    return Math.max(0, Math.min(1, (rateA - rateB) / rateA));
  })();

  const missedDays = missed.map(log => new Date(`${log.date}T00:00:00Z`).getUTCDay());
  const dayCounts = new Array(7).fill(0) as number[];
  for (const day of missedDays) dayCounts[day] = (dayCounts[day] ?? 0) + 1;
  const strugglingDays = dayCounts
    .map((count, index) => ({ count, index }))
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .map(entry => WEEKDAY_NAMES[entry.index] ?? '');

  return {
    missRate,
    skipRate,
    longestBreak: Math.max(0, longestBreak - 1),
    inconsistency,
    declining,
    strugglingDays,
  };
}

function rangeSpan(times: number[]): number {
  if (times.length === 0) return 0;
  const first = times[0] ?? 0;
  const last = times[times.length - 1] ?? first;
  return last - first;
}

function frictionScore(metrics: HabitFrictionMetrics): number {
  return round(
    metrics.missRate * FRICTION_WEIGHTS.missRate +
    metrics.skipRate * FRICTION_WEIGHTS.skipRate +
    Math.min(1, metrics.longestBreak / 14) * FRICTION_WEIGHTS.longestBreak +
    metrics.inconsistency * FRICTION_WEIGHTS.inconsistency +
    metrics.declining * FRICTION_WEIGHTS.decliningTrend
  ) * 100;
}

/**
 * Friction score and indicators for a single habit over a range.
 */
export async function analyzeHabitFriction(
  userId: string,
  range: DateRange,
  habitId: string,
  habitName: string
): Promise<FrictionAnalysis | null> {
  const logs = await habitRepository.findLogsByRange(habitId, userId, range.startDate, range.endDate);
  const metrics = analyzeFriction(logs);
  const score = frictionScore(metrics);

  const recommendations: string[] = [];
  if (metrics.missRate > 0.4) recommendations.push('Reduce the habit frequency or split it into a smaller daily action.');
  if (metrics.longestBreak >= 7) recommendations.push('Schedule a "re-entry" day after long breaks to avoid restarting from zero.');
  if (metrics.strugglingDays.length > 0) recommendations.push(`Prep the night before ${metrics.strugglingDays.join(' and ')} to remove morning friction.`);
  if (metrics.inconsistency > 0.5) recommendations.push('Anchor the habit to an existing routine trigger to improve consistency.');
  if (score >= 70) recommendations.push('Consider lowering the cognitive load: put materials out, automate reminders, or set a 5-minute minimum.');

  return {
    habitId,
    habitName,
    frictionScore: score,
    indicators: {
      inconsistentCompletion: metrics.inconsistency > 0.5,
      frequentSkips: metrics.skipRate > 0.25,
      decliningTrend: metrics.declining > 0.3,
    },
    patterns: {
      strugglingDays: metrics.strugglingDays,
    },
    recommendations,
  };
}

/**
 * Ranked friction analysis across all active habits, highest friction first.
 */
export async function frictionAnalysis(userId: string, range: DateRange): Promise<FrictionAnalysis[]> {
  const habits = await habitRepository.findAll(userId, { status: 'ACTIVE' });
  const analyses = await Promise.all(
    habits.map(habit => analyzeHabitFriction(userId, range, habit.id, habit.name))
  );

  return analyses
    .filter((analysis): analysis is FrictionAnalysis => analysis !== null)
    .sort((a, b) => b.frictionScore - a.frictionScore);
}

export { frictionScore as computeFrictionScore };