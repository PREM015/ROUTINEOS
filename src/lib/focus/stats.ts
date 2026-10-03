/**
 * Focus statistics bucketing — the pure core of `GET /api/focus/stats`.
 *
 * Two rules that the rest of the codebase gets wrong, and that this file exists
 * to make impossible to get wrong twice:
 *
 *   1. **Only `FOCUS` and `STOPWATCH` count.** A break is the absence of work.
 *      Before the `type` column, `FocusRepository.getStats` filtered on
 *      `completedAt != null` alone — and the timer posted a `completed: true`
 *      row for every short and long break, so every 5-minute break was added to
 *      every "focus minutes" figure in the product. `countsAsFocusTime` is the
 *      single definition and the repository filters on the same list.
 *
 *   2. **A day is the user's day.** Bucketing by `startedAt.toISOString().slice(0,10)`
 *      is UTC bucketing, and a user in `Asia/Tokyo` running 09:00–12:00 local
 *      lands entirely on the previous calendar day. Every call site therefore
 *      resolves `YYYY-MM-DD` labels through the user's zone first.
 *
 * The streak is a streak of *completed focus* days, not of "days the app was
 * open": an aborted-only day breaks it, because a day of five stopped timers is
 * not a day of work.
 */

import type { FocusSessionEndReason, FocusSessionType } from '@/constants/prisma-enums';
import { countsAsFocusTime } from '@/lib/focus/type-backfill';
import {
  dayBoundsInTimezone,
  getTodayString,
  nextCalendarDay,
  previousCalendarDay,
} from '@/lib/dates';

export interface FocusStatsRow {
  id: string;
  type: FocusSessionType;
  startedAt: Date;
  completedAt: Date | null;
  abortedAt: Date | null;
  actualDuration: number | null;
  endReason: FocusSessionEndReason | null;
  /**
   * The session's snapshotted timezone.
   *
   * Nullable because rows written before the column existed do not have one, and
   * the backfill documents filling it from the user's *current* setting as
   * approximate. Bucketing must therefore prefer this over the user's current
   * zone — otherwise moving timezone would silently re-bucket all of history.
   */
  timezone?: string | null;
  runId?: string | null;
}

export interface FocusDayBucket {
  /** `YYYY-MM-DD` in the user's zone. */
  date: string;
  /** Total counted focus minutes. */
  focusMinutes: number;
  /** Counted sessions of any completion state. */
  sessions: number;
  completedSessions: number;
  abortedSessions: number;
}

export interface FocusStatsResult {
  /** One bucket per day in the requested range, ascending, with no gaps. */
  days: FocusDayBucket[];
  today: FocusDayBucket;
  /** Consecutive days up to today with at least one completed focus session. */
  streakDays: number;
  totalFocusMinutes: number;
  totalSessions: number;
  averageSessionMinutes: number;
  bestDay: FocusDayBucket | null;
}

/** Minutes a row contributes to focus totals. Zero for anything not counted. */
export function countedMinutes(row: FocusStatsRow): number {
  if (!countsAsFocusTime(row.type)) return 0;
  if (row.actualDuration === null || row.actualDuration <= 0) return 0;
  return row.actualDuration;
}

function emptyBucket(date: string): FocusDayBucket {
  return { date, focusMinutes: 0, sessions: 0, completedSessions: 0, abortedSessions: 0 };
}

/**
 * The `YYYY-MM-DD` label for an instant, in the user's zone.
 *
 * Uses `Intl.DateTimeFormat` with an explicit `en-CA` locale because that is the
 * one locale whose `format()` output is already `YYYY-MM-DD`. Deriving it by hand
 * from `getUTC*` would be UTC bucketing again, which is the bug this avoids.
 */
export function dayKeyInTimezone(instant: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    // An invalid zone in a user's settings must not 500 the whole endpoint.
    return getTodayString('UTC');
  }
}

/** Inclusive list of `YYYY-MM-DD` labels from `from` to `to`. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  // Bounded so a malformed `from`/`to` cannot spin here.
  for (let guard = 0; guard < 4000 && cursor <= to; guard += 1) {
    out.push(cursor);
    cursor = nextCalendarDay(cursor);
  }
  return out;
}

export interface ComputeStatsInput {
  rows: FocusStatsRow[];
  /** Inclusive `YYYY-MM-DD` range start, in the user's zone. */
  from: string;
  /** Inclusive `YYYY-MM-DD` range end, in the user's zone. */
  to: string;
  timezone: string;
  /** The user's today, in their own zone. */
  today: string;
}

/**
 * Bucket rows per day and derive the streak.
 *
 * Rows outside the range are ignored for the daily buckets but *do* feed the
 * streak, because a streak is a property of history, not of the visible window —
 * otherwise a 7-day window would report a 7-day streak for someone who worked 40
 * days straight and then opened the app today.
 */
export function computeFocusStats(input: ComputeStatsInput): FocusStatsResult {
  const { rows, from, to, timezone, today } = input;
  const byDate = new Map<string, FocusDayBucket>();
  for (const date of dayRange(from, to)) byDate.set(date, emptyBucket(date));

  // Completion by day, kept separate from the window so the streak can look back
  // past `from`.
  const completedDays = new Set<string>();

  for (const row of rows) {
    const minutes = countedMinutes(row);
    if (minutes === 0) continue;

    const key = dayKeyInTimezone(row.startedAt, timezone);
    if (row.completedAt) completedDays.add(key);

    const bucket = byDate.get(key);
    // A row outside the window contributes to the streak but not to a bucket.
    if (!bucket) continue;
    bucket.focusMinutes += minutes;
    bucket.sessions += 1;
    if (row.completedAt) bucket.completedSessions += 1;
    if (row.abortedAt) bucket.abortedSessions += 1;
  }

  const days = Array.from(byDate.values());
  const totalFocusMinutes = days.reduce((sum, d) => sum + d.focusMinutes, 0);
  const totalSessions = days.reduce((sum, d) => sum + d.sessions, 0);

  let bestDay: FocusDayBucket | null = null;
  for (const day of days) {
    if (day.focusMinutes > 0 && (bestDay === null || day.focusMinutes > bestDay.focusMinutes)) {
      bestDay = day;
    }
  }

  return {
    days,
    today: byDate.get(today) ?? emptyBucket(today),
    streakDays: computeStreak(completedDays, today),
    totalFocusMinutes,
    totalSessions,
    averageSessionMinutes: totalSessions === 0 ? 0 : Math.round(totalFocusMinutes / totalSessions),
    bestDay,
  };
}

/**
 * Consecutive days ending today (or yesterday) with a completed focus session.
 *
 * Today not having a session yet does not break a streak built through
 * yesterday — it is not yet evidence of anything. Every other gap does.
 */
export function computeStreak(completedDays: ReadonlySet<string>, today: string): number {
  let cursor = completedDays.has(today) ? today : previousCalendarDay(today);
  if (!completedDays.has(cursor)) return 0;
  let streak = 0;
  let guard = 0;
  while (completedDays.has(cursor) && guard < 4000) {
    streak += 1;
    cursor = previousCalendarDay(cursor);
    guard += 1;
  }
  return streak;
}

/**
 * The instant range covering a `YYYY-MM-DD` range in the user's zone.
 *
 * Built with `dayBoundsInTimezone` (which resolves through `fromZonedTime`) so the
 * query the repository issues and the labels it buckets by describe the same
 * days. Mixing `new Date('2026-01-01')` into this is UTC bucketing.
 */
export function statsQueryRange(
  timezone: string,
  from: string,
  to: string
): { gte: Date; lte: Date } {
  const start = dayBoundsInTimezone(timezone, from).start;
  const end = dayBoundsInTimezone(timezone, to).end;
  // `startedAt` is inclusive on both ends for the repository, and `end` is the
  // exclusive start of the next day, so subtract 1ms to make the last day whole.
  return { gte: start, lte: new Date(end.getTime() - 1) };
}
