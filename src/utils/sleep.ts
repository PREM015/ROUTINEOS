/**
 * Sleep/wellness helpers built on the timezone-aware date utilities in `@/lib/dates`.
 */

import { calculateSleepWindow, formatMinutes, timeToMinutes } from '@/lib/dates';

/**
 * Whether a sleep window crosses midnight (wake time is on or before bedtime).
 * @example isOvernight('23:00', '06:00') // true
 */
export function isOvernight(bedtime: string, wakeTime: string): boolean {
  return timeToMinutes(wakeTime) <= timeToMinutes(bedtime);
}

/**
 * Duration between bedtime and wake time in minutes, handling overnight windows.
 * @example sleepDurationMinutes('23:00', '06:30') // 450
 */
export function sleepDurationMinutes(bedtime: string, wakeTime: string): number {
  return calculateSleepWindow(bedtime, wakeTime);
}

/**
 * Whether a sleep duration is within `toleranceMinutes` of its target.
 * @example isSleepWithinRange(430, 450) // true
 */
export function isSleepWithinRange(
  durationMinutes: number,
  targetMinutes: number,
  toleranceMinutes = 30
): boolean {
  return Math.abs(durationMinutes - targetMinutes) <= toleranceMinutes;
}

/**
 * Score a sleep duration against its target, 0-100 (exact target = 100).
 * @example sleepScoreFromDuration(450, 450) // 100
 */
export function sleepScoreFromDuration(durationMinutes: number, targetMinutes: number): number {
  if (targetMinutes <= 0 || durationMinutes <= 0) return 0;
  const deviationPercent = Math.abs(durationMinutes / targetMinutes - 1) * 100;
  return Math.max(0, Math.min(100, Math.round(100 - deviationPercent)));
}

/**
 * Format a sleep window as a readable range plus its duration.
 * @example formatSleepWindow('23:00', '06:00') // '11:00 PM – 06:00 AM (7h)'
 */
export function formatSleepWindow(bedtime: string, wakeTime: string): string {
  const duration = sleepDurationMinutes(bedtime, wakeTime);
  return `${formatClock(bedtime)} – ${formatClock(wakeTime)} (${formatMinutes(duration)})`;
}

function formatClock(time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  if (hour === undefined || minute === undefined) return time;
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}