/**
 * Life Context System
 *
 * ── Pure module: no database access, no HTTP calls ───────────────────────────
 *
 * Everything here is a pure function over data the caller already has. The
 * `DailyReflection` lookup lives in `LifeContextService`, which reaches it
 * through `ReflectionRepository` — domain logic in `lib/` must not query the
 * database directly.
 *
 * ── Two distinct day axes — do not conflate them ────────────────────────────
 *
 * 1. `DayType` (Prisma enum, 6 values: WORKDAY/WEEKEND/HOLIDAY/EXAM_DAY/
 *    LOW_ENERGY/CUSTOM) answers **"which schedule applies?"** It is a *routine*
 *    concern. The single source of truth for resolving it is
 *    `lib/scheduling/resolve-routine.ts` — RoutineException override first,
 *    then the weekday/weekend default. `lib/constants/routine.ts` only holds
 *    display config for it; it never decides a day type.
 *
 * 2. `LifeContext` (this module, 8 values) answers **"what situation is the
 *    user in, and how should they adapt?"** It is derived from the user's own
 *    reported energy/mood/stress, not from the calendar. Values like SICK,
 *    TRAVEL and BUSY have no `DayType` equivalent and cannot be derived from a
 *    date, which is exactly why this axis exists separately.
 *
 * The two axes overlap on HOLIDAY and LOW_ENERGY, which is why this type was
 * previously called `DayContext` — a name that invited exactly the confusion
 * this header exists to prevent, and that collided with a since-removed
 * hand-rolled clone of the `DayType` enum in `DayContextSelector.tsx`. The
 * `LifeContext` name is deliberate: if you are about to reason about the
 * schedule for a date, you want `DayType`; if you are reasoning about the
 * person's capacity on that date, you want `LifeContext`.
 */

import type { DailyReflection } from '@/generated/prisma';
import { resolveNaturalDayType } from '@/lib/scheduling/resolve-routine';

export type LifeContext =
  | 'NORMAL'
  | 'COLLEGE'
  | 'EXAM'
  | 'TRAVEL'
  | 'SICK'
  | 'LOW_ENERGY'
  | 'BUSY'
  | 'HOLIDAY';

export interface LifeContextConfig {
  context: LifeContext;
  label: string;
  description: string;
  color: string;
  icon: string;
  suggestedAdjustments: string[];
}

export const LIFE_CONTEXTS: Record<LifeContext, LifeContextConfig> = {
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

export function getLifeContextConfig(context: LifeContext): LifeContextConfig {
  return LIFE_CONTEXTS[context];
}

/**
 * Format a `Date` as the YYYY-MM-DD calendar string the resolvers expect.
 */
function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Suggest a life context from the user's reported vitals.
 *
 * Weekend detection is delegated to the canonical day-type resolver rather
 * than re-deriving "is this a weekend?" here — previously this function mapped
 * Sat/Sun to HOLIDAY while the routine resolver mapped the same days to
 * WEEKEND, which is precisely the kind of silent disagreement that makes two
 * pages show different answers for the same date.
 */
export function suggestLifeContext(
  energy: number | null,
  mood: number | null,
  stress: number | null,
  currentDate: Date
): LifeContext {
  if (resolveNaturalDayType(toDateString(currentDate), 'UTC') === 'WEEKEND') {
    return 'HOLIDAY';
  }

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
// Life context snapshots
// ============================================================================

/**
 * Normalized snapshot of a single day's context, derived from the user's
 * `DailyReflection` for that date.
 */
export interface LifeContextSnapshot {
  /** YYYY-MM-DD date the snapshot refers to. */
  date: string;
  /** Life context (capacity axis) — NOT the routine `DayType`. */
  lifeContext: LifeContext;
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

function emptySnapshot(
  date: string,
  lifeContext: LifeContext
): LifeContextSnapshot {
  return {
    date,
    lifeContext,
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
 * Build the day-context snapshot for a date from an already-loaded reflection.
 *
 * Pure: the caller supplies the `DailyReflection` (or null when there is none),
 * so this function performs no I/O. A missing reflection degrades gracefully to
 * an empty — but still valid — snapshot rather than throwing.
 *
 * @see LifeContextService.getLifeContext for the database-backed entry point.
 */
export function buildLifeContextSnapshot(
  date: string,
  reflection: DailyReflection | null
): LifeContextSnapshot {
  if (!reflection) {
    return emptySnapshot(date, suggestLifeContext(null, null, null, new Date()));
  }

  const lifeContext = suggestLifeContext(
    reflection.energy,
    reflection.mood,
    reflection.stress,
    parseISODate(date)
  );

  return {
    date,
    lifeContext,
    energy: reflection.energy,
    mood: reflection.mood,
    stress: reflection.stress,
    focus: reflection.focus,
    reflectionText: reflection.reflectionText,
    biggestWin: reflection.biggestWin,
    biggestDifficulty: reflection.biggestDifficulty,
    suggestedAdjustments: LIFE_CONTEXTS[lifeContext].suggestedAdjustments,
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
 * Human-readable label for a life context.
 *
 * @example
 * getContextLabel('LOW_ENERGY') // => "Low Energy"
 */
export function getContextLabel(context: LifeContext): string {
  return LIFE_CONTEXTS[context].label;
}
