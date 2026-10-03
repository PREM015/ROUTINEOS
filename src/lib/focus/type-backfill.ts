/**
 * Focus session type backfill — the pure core of Migration 1's data fix.
 *
 * `FocusSession` had no `type` column for its whole life, so the only record of
 * what a row *was* was the `title` string that `FocusService.createSession`
 * wrote: 'Focus session', 'Short break', 'Long break' or 'Stopwatch session'.
 *
 * This module is the single place that mapping is expressed, in both directions:
 *
 *   - `focusTypeFromTitle` / `titleForFocusType` are the *backfill* logic, run
 *     once inside the migration SQL and then never again.
 *   - `focusTimerPayloadToSessionType` maps the wire format the timer posts
 *     (`'short-break'`) onto the stored enum (`'SHORT_BREAK'`), which the
 *     migration SQL obviously cannot do because it only sees stored rows.
 *
 * Keeping the reverse mapping next to the forward one is what stops the two
 * drifting: the original bug was that the forward mapping (title) and the
 * consumer's expectation ("is this focus work?") were maintained in two files
 * that could never be compared. Now the title *is* derived from the type, so a
 * new mode cannot be added without the backfill knowing about it.
 *
 * Pure and dependency-free so it is unit-testable without a database.
 */

import type { FocusSessionType } from '@/constants/prisma-enums';

/** Stored enum values, as a runtime list (the enum mirror is client-safe). */
export const FOCUS_SESSION_TYPES: readonly FocusSessionType[] = [
  'FOCUS',
  'SHORT_BREAK',
  'LONG_BREAK',
  'STOPWATCH',
];

/** The four modes of the timer UI, which is what a client actually sends. */
export type FocusMode = 'focus' | 'short-break' | 'long-break' | 'stopwatch';

export const FOCUS_MODES: readonly FocusMode[] = [
  'focus',
  'short-break',
  'long-break',
  'stopwatch',
];

/** UI mode → stored enum. */
const MODE_TO_TYPE: Readonly<Record<FocusMode, FocusSessionType>> = {
  focus: 'FOCUS',
  'short-break': 'SHORT_BREAK',
  'long-break': 'LONG_BREAK',
  stopwatch: 'STOPWATCH',
};

/** Stored enum → UI mode. Inverse of {@link MODE_TO_TYPE}. */
const TYPE_TO_MODE: Readonly<Record<FocusSessionType, FocusMode>> = {
  FOCUS: 'focus',
  SHORT_BREAK: 'short-break',
  LONG_BREAK: 'long-break',
  STOPWATCH: 'stopwatch',
};

/**
 * Default titles, matching the strings the pre-migration code wrote.
 *
 * These are still what a session with no user-supplied title is called, so old
 * rows and new rows read identically in the UI.
 */
const TYPE_TO_TITLE: Readonly<Record<FocusSessionType, string>> = {
  FOCUS: 'Focus session',
  SHORT_BREAK: 'Short break',
  LONG_BREAK: 'Long break',
  STOPWATCH: 'Stopwatch session',
};

/**
 * The pre-migration titles, in the exact casing the old code used.
 *
 * The SQL backfill uses these literals; this map is what the unit tests assert
 * the SQL against, so the two cannot diverge silently.
 */
const TITLE_TO_TYPE: Readonly<Record<string, FocusSessionType>> = {
  'Focus session': 'FOCUS',
  'Short break': 'SHORT_BREAK',
  'Long break': 'LONG_BREAK',
  'Stopwatch session': 'STOPWATCH',
};

/**
 * Resolve a stored title to its type, defaulting to `FOCUS`.
 *
 * Deliberately case-sensitive and exact: the migration must be a pure widening
 * with no data loss, and an approximate match could silently reclassify a
 * user's own custom-titled session. Anything unrecognised becomes `FOCUS`,
 * which is exactly what the old aggregations did with it.
 */
export function focusTypeFromTitle(title: string | null | undefined): FocusSessionType {
  if (typeof title !== 'string') return 'FOCUS';
  return TITLE_TO_TYPE[title] ?? 'FOCUS';
}

/** Default title for a stored type. */
export function titleForFocusType(type: FocusSessionType): string {
  return TYPE_TO_TITLE[type] ?? 'Focus session';
}

/** Map a client-sent timer mode onto the stored enum. */
export function focusTimerPayloadToSessionType(
  type: FocusMode | string
): FocusSessionType {
  return MODE_TO_TYPE[type as FocusMode] ?? 'FOCUS';
}

/** Map a stored enum back to the timer UI mode that produced it. */
export function sessionTypeToFocusMode(type: FocusSessionType): FocusMode {
  return TYPE_TO_MODE[type] ?? 'focus';
}

/**
 * The types that count as focus time.
 *
 * `FOCUS` and `STOPWATCH` are both real work the user chose to do; breaks are
 * the absence of work. Every "focus minutes" aggregate in the product is now
 * filtered to this set.
 */
export const FOCUS_TIME_TYPES: readonly FocusSessionType[] = ['FOCUS', 'STOPWATCH'];

/** True when a row of this type counts towards focus minutes. */
export function countsAsFocusTime(type: FocusSessionType): boolean {
  return FOCUS_TIME_TYPES.includes(type);
}

/** True when a row of this type is a break (shown muted, never counted). */
export function isBreakType(type: FocusSessionType): boolean {
  return type === 'SHORT_BREAK' || type === 'LONG_BREAK';
}

/** Narrow an arbitrary value to a stored type, for validating API input. */
export function asFocusSessionType(value: unknown): FocusSessionType | null {
  return typeof value === 'string' &&
    (FOCUS_SESSION_TYPES as readonly string[]).includes(value)
    ? (value as FocusSessionType)
    : null;
}
