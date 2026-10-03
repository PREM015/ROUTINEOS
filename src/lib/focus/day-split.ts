/**
 * Daily attribution for focus minutes.
 *
 * A session is listed on its **start** date, but its minutes are **split across
 * local midnight**. A run from 23:40 to 00:20 is 20 minutes on one day and 20 on
 * the next.
 *
 * This matters more than it looks. Without splitting, a user who works late gets
 * a spike on one day and nothing on the other, which makes the daily bar chart
 * and the streak disagree with lived experience — and the streak is the number
 * people actually notice. With splitting, both days get their fair 20 minutes,
 * and a session run entirely within one day is unaffected because the split
 * degenerates to a single bucket.
 *
 * Midnight is resolved with `dayBoundsInTimezone` rather than by arithmetic on
 * `Date` fields. `new Date(y, m, d + 1)` builds midnight in the **host's** zone,
 * which on a UTC server is the wrong instant for any user who is not in UTC — the
 * exact class of bug `lib/dates.ts` documents at length. Everything here goes
 * through `fromZonedTime`, so a DST transition is handled by the zone database
 * rather than by assuming 24-hour days.
 */

import { dayBoundsInTimezone, nextCalendarDay, previousCalendarDay } from '@/lib/dates';
import type { FocusStatsRow } from '@/lib/focus/stats';
import { countedMinutes } from '@/lib/focus/stats';

/** How a session's minutes land on days. */
export interface DailyAttribution {
  /** `YYYY-MM-DD` in the session's own timezone. */
  date: string;
  /** Minutes attributable to this day. Sums to the session's total across days. */
  minutes: number;
  /** True for the day the session started on — the only day it is listed under. */
  isStartDay: boolean;
}

/**
 * `YYYY-MM-DD` label for an instant in a zone.
 *
 * `en-CA` is chosen because it is the locale whose `Intl.DateTimeFormat` output
 * is already ISO-ordered. Deriving it by hand from `getUTC*` would reintroduce
 * UTC bucketing, which is the bug this whole module exists to avoid.
 */
export function labelFor(instant: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  }
}

export interface AttributionInput {
  startedAt: Date;
  /** Effective end, or null when the session is still running. */
  endedAt: Date | null;
  actualMinutes: number;
  /**
   * The zone to attribute in.
   *
   * The **session's snapshotted** zone, not the user's current one. History must
   * not re-bucket when someone moves timezone: a session worked at 09:00 in Tokyo
   * stays a morning session after they move to Berlin.
   */
  timezone: string;
}

/**
 * Split a session's minutes across the local days it touches.
 *
 * Boundaries are taken from `dayBoundsInTimezone`, so each day is the exact
 * instant range the user's zone defines — including a 23- or 25-hour day across a
 * DST change.
 */
export function attributeMinutes(input: AttributionInput): DailyAttribution[] {
  const { startedAt, endedAt, actualMinutes, timezone } = input;
  if (actualMinutes <= 0) return [];

  const end = endedAt ?? new Date(startedAt.getTime() + actualMinutes * 60_000);
  if (end.getTime() <= startedAt.getTime()) {
    return [{ date: labelFor(startedAt, timezone), minutes: actualMinutes, isStartDay: true }];
  }

  const startLabel = labelFor(startedAt, timezone);
  const endLabel = labelFor(end, timezone);

  // Contained within one day: the overwhelmingly common case, so it returns
  // without touching the day-bounds machinery.
  if (startLabel === endLabel) {
    return [{ date: startLabel, minutes: actualMinutes, isStartDay: true }];
  }

  const out: DailyAttribution[] = [];
  let cursor = startLabel;
  // Bounded so a corrupt `endedAt` (a client claiming year 3000) cannot spin here.
  for (let guard = 0; guard < 40 && cursor <= endLabel; guard += 1) {
    const { start, end: dayEnd } = dayBoundsInTimezone(timezone, cursor);
    const overlapStart = Math.max(startedAt.getTime(), start.getTime());
    const overlapEnd = Math.min(end.getTime(), dayEnd.getTime());
    const spanMs = overlapEnd - overlapStart;
    if (spanMs > 0) {
      // Pro-rata rather than recomputing from wall-clock totals: the session's
      // authoritative duration is its stored `actualMinutes`, and the split must
      // sum back to exactly that number. Deriving each bucket from the span
      // independently and rounding would drift by a minute across a boundary.
      out.push({
        date: cursor,
        minutes: (spanMs / (end.getTime() - startedAt.getTime())) * actualMinutes,
        isStartDay: cursor === startLabel,
      });
    }
    cursor = nextCalendarDay(cursor);
  }

  // Force the split to sum to the authoritative total. Pro-rata in floating
  // point leaves a fraction somewhere, and a bucket that reads "24.999999 minutes"
  // would show as 25 while the days sum to 74.
  const sum = out.reduce((acc, d) => acc + d.minutes, 0);
  if (out.length > 0 && sum !== actualMinutes && sum > 0) {
    const scale = actualMinutes / sum;
    for (const d of out) d.minutes *= scale;
  }

  return out;
}

export interface DayTotalsOptions {
  timezone: string;
  from: string;
  to: string;
}

/**
 * Per-day totals for a set of sessions, with minutes split at midnight.
 *
 * `countedMinutes` is reused so this module and the headline statistics cannot
 * disagree about whether a break counts — that was the original defect, and two
 * implementations of "focus minutes" is how it happened.
 */
export function dayTotals(
  rows: FocusStatsRow[],
  options: DayTotalsOptions
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const minutes = countedMinutes(row);
    if (minutes === 0) continue;

    // The session's snapshotted zone when it has one, else the user's current
    // zone. Rows written before the `timezone` column existed have none, and for
    // those the current setting is the best available answer — which is exactly
    // what the backfill documented as approximate.
    const attribution: DailyAttribution[] = attributeMinutes({
      startedAt: row.startedAt,
      endedAt: row.completedAt ?? row.abortedAt,
      actualMinutes: minutes,
      timezone: row.timezone ?? options.timezone,
    });

    for (const part of attribution) {
      if (part.date < options.from || part.date > options.to) continue;
      totals.set(part.date, (totals.get(part.date) ?? 0) + part.minutes);
    }
  }

  return totals;
}

/**
 * Today in a zone, stepping back one calendar day at a time.
 *
 * Exported because the streak walk needs the same backward stepping and must not
 * reimplement it: two implementations of "previous day" is how the original
 * UTC-vs-local bucketing bug got duplicated in the first place.
 */
export { previousCalendarDay, nextCalendarDay };
