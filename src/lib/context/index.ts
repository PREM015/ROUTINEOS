/**
 * Day Context System
 * Manage different day contexts and their effects
 */

import type { DailyReflection } from '@prisma/client';
import prisma from '@/lib/prisma';

export type DayContext =
  | 'NORMAL'
  | 'COLLEGE'
  | 'EXAM'
  | 'TRAVEL'
  | 'SICK'
  | 'LOW_ENERGY'
  | 'BUSY'
  | 'HOLIDAY';

export interface DayContextConfig {
  context: DayContext;
  label: string;
  description: string;
  color: string;
  icon: string;
  suggestedAdjustments: string[];
}

export const DAY_CONTEXTS: Record<DayContext, DayContextConfig> = {
  NORMAL: {
    context: 'NORMAL',
    label: 'Normal Day',
    description: 'Regular day with normal energy and schedule',
    color: '#3b82f6',
    icon: '📅',
    suggestedAdjustments: [],
  },
  COLLEGE: {
    context: 'COLLEGE',
    label: 'College Day',
    description: 'Day with classes and academic commitments',
    color: '#8b5cf6',
    icon: '🎓',
    suggestedAdjustments: [
      'Focus on academic habits',
      'Adjust workout time around classes',
      'Plan study sessions',
    ],
  },
  EXAM: {
    context: 'EXAM',
    label: 'Exam Day',
    description: 'Day with important exam or deadline',
    color: '#ef4444',
    icon: '📝',
    suggestedAdjustments: [
      'Activate minimum day',
      'Skip optional habits',
      'Prioritize sleep',
      'Light exercise only',
    ],
  },
  TRAVEL: {
    context: 'TRAVEL',
    label: 'Travel Day',
    description: 'Day spent traveling or away from home',
    color: '#10b981',
    icon: '✈️',
    suggestedAdjustments: [
      'Use travel-friendly habits',
      'Focus on essential habits only',
      'Adjust routine for timezone',
    ],
  },
  SICK: {
    context: 'SICK',
    label: 'Sick Day',
    description: 'Not feeling well, need rest',
    color: '#f59e0b',
    icon: '🤒',
    suggestedAdjustments: [
      'Activate rest day',
      'Focus on recovery',
      'Skip exercise',
      'Prioritize sleep and hydration',
    ],
  },
  LOW_ENERGY: {
    context: 'LOW_ENERGY',
    label: 'Low Energy',
    description: 'Feeling tired or low energy',
    color: '#6b7280',
    icon: '😴',
    suggestedAdjustments: [
      'Consider minimum day',
      'Lighter workout',
      'Earlier bedtime',
      'Focus on core habits',
    ],
  },
  BUSY: {
    context: 'BUSY',
    label: 'Busy Day',
    description: 'Packed schedule with many commitments',
    color: '#f97316',
    icon: '⚡',
    suggestedAdjustments: [
      'Use minimum day template',
      'Batch similar tasks',
      'Skip time-intensive bonus habits',
    ],
  },
  HOLIDAY: {
    context: 'HOLIDAY',
    label: 'Holiday',
    description: 'Holiday or day off',
    color: '#ec4899',
    icon: '🎉',
    suggestedAdjustments: [
      'Use weekend routine',
      'Focus on personal projects',
      'Flexible schedule',
    ],
  },
};

export function getDayContextConfig(context: DayContext): DayContextConfig {
  return DAY_CONTEXTS[context];
}

export function suggestDayContext(
  energy: number | null,
  mood: number | null,
  stress: number | null,
  currentDate: Date
): DayContext {
  // Check if weekend
  const dayOfWeek = currentDate.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return 'HOLIDAY';
  }

  // Check energy and mood
  if (energy && energy <= 2) {
    return 'LOW_ENERGY';
  }

  if (stress && stress >= 4) {
    return 'BUSY';
  }

  if (mood && mood <= 2 && energy && energy <= 2) {
    return 'SICK';
  }

  return 'NORMAL';
}

// ============================================================================
// Day context snapshots
// ============================================================================

/**
 * Normalized snapshot of a single day's context, derived from the user's
 * `DailyReflection` for that date.
 */
export interface DayContextSnapshot {
  /** YYYY-MM-DD date the snapshot refers to. */
  date: string;
  dayType: DayContext;
  energy: number | null;
  mood: number | null;
  stress: number | null;
  focus: number | null;
  reflectionText: string | null;
  biggestWin: string | null;
  biggestDifficulty: string | null;
  suggestedAdjustments: string[];
  /** Whether a DailyReflection row existed for the date. */
  hasReflection: boolean;
}

function emptySnapshot(date: string, dayType: DayContext): DayContextSnapshot {
  return {
    date,
    dayType,
    energy: null,
    mood: null,
    stress: null,
    focus: null,
    reflectionText: null,
    biggestWin: null,
    biggestDifficulty: null,
    suggestedAdjustments: [],
    hasReflection: false,
  };
}

/**
 * Read and normalize the day context for a user and date (YYYY-MM-DD).
 *
 * Loads the user's `DailyReflection` for that date and derives the day type via
 * `suggestDayContext`. Missing reflections and transient DB errors degrade
 * gracefully to an empty (but valid) snapshot rather than throwing.
 */
export async function getDayContext(
  userId: string,
  date: string
): Promise<DayContextSnapshot> {
  let reflection: DailyReflection | null = null;
  try {
    reflection = await prisma.dailyReflection.findUnique({
      where: { userId_date: { userId, date } },
    });
  } catch {
    reflection = null;
  }

  if (!reflection) {
    return emptySnapshot(date, suggestDayContext(null, null, null, new Date()));
  }

  const dayType = suggestDayContext(
    reflection.energy,
    reflection.mood,
    reflection.stress,
    parseISODate(date)
  );

  return {
    date,
    dayType,
    energy: reflection.energy,
    mood: reflection.mood,
    stress: reflection.stress,
    focus: reflection.focus,
    reflectionText: reflection.reflectionText,
    biggestWin: reflection.biggestWin,
    biggestDifficulty: reflection.biggestDifficulty,
    suggestedAdjustments: DAY_CONTEXTS[dayType].suggestedAdjustments,
    hasReflection: true,
  };
}

/**
 * Parse a YYYY-MM-DD string as a local `Date` (safe fallback: epoch).
 */
function parseISODate(date: string): Date {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

/**
 * Build a stable cache/queue key for a context lookup.
 *
 * @example
 * buildContextKey('2026-09-18', 'Asia/Kolkata') // => "2026-09-18@Asia/Kolkata"
 */
export function buildContextKey(date: string, timezone: string): string {
  return `${date}@${timezone}`;
}

/**
 * Human-readable label for a day context.
 *
 * @example
 * getContextLabel('LOW_ENERGY') // => "Low Energy"
 */
export function getContextLabel(context: DayContext): string {
  return DAY_CONTEXTS[context].label;
}