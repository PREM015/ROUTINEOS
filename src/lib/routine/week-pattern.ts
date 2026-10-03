/**
 * Weekly and per-preset derivations for `/routine`.
 *
 * Pure functions over `RoutineProgressResponse`, so the week strip and the
 * day-type comparison can be tested without a component or a database.
 *
 * ## Why this is a separate module
 *
 * Both new rail surfaces read the *same* payload and answer the *same* class of
 * question — "how am I doing, compared to what?" — so they share one fetch and
 * one set of definitions. If the two components each derived their own averages
 * they would drift, exactly as the three completion rates did.
 *
 * ## The rate is tracked-only
 *
 * `RoutineProgressDay.completionRate` is completed ÷ *tracked* blocks, which is
 * the same measurement the day view's ring shows. See
 * `RoutineProgressResponse` for why the service was changed to match. Nothing
 * here recomputes it; these functions only aggregate it.
 *
 * ## A day with nothing tracked is not a zero
 *
 * `total === 0` means the user had nothing to tick, not that they failed. Every
 * average here therefore excludes those days rather than folding in a 0, which
 * would report a week as worse than it was. This is the same rule
 * `getRoutineProgress` applies to its monthly rollup.
 */

import type { RoutineProgressDay, RoutineProgressResponse } from '@/types/routine';

/** One column of the week strip. */
export interface WeekDay {
  date: string;
  /** Three-letter weekday label, e.g. `Mon`. */
  weekday: string;
  dayType: RoutineProgressDay['dayType'];
  /** The resolved preset's real name — never the bare `CUSTOM` enum value. */
  dayTypeName: string;
  dayTypeColor: string | null;
  /** A template resolved for this date. */
  scheduled: boolean;
  /** Tracked blocks, or 0 when none. */
  total: number;
  completed: number;
  /** 0–100, or `null` when nothing was tracked — see the module docblock. */
  completionRate: number | null;
  /**
   * `total` and `completed` are measured against a different schedule than the one
   * this date resolves to, because the day's day type was changed after the work
   * was logged.
   *
   * Carried onto the week day so the strip can mark it. Without a marker the rate
   * silently differs from its neighbours and reads as a mistake rather than as a
   * correct measurement of a different schedule.
   */
  scheduleSwitched: boolean;
  isToday: boolean;
  /** In the future relative to today. */
  isFuture: boolean;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * `YYYY-MM-DD` → weekday label, without constructing a local-time `Date`.
 *
 * `new Date('2026-10-01')` parses as UTC midnight, so on a machine west of
 * Greenwich `getDay()` returns the *previous* day. That is a real off-by-one
 * which would show up as a Monday-start week strip beginning on Sunday. Working
 * from days-since-epoch on the parsed UTC date is timezone-independent.
 *
 * Returns `'—'` for a date it cannot read, so a malformed value degrades one
 * label instead of throwing inside a render.
 */
export function weekdayLabel(date: string): string {
  const parts = date.split('-');
  if (parts.length !== 3) return '—';
  // `noUncheckedIndexedAccess` types each of these as `number | undefined`, so
  // the undefined case is checked explicitly rather than via `isFinite`.
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return '—';
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return '—';

  const epochDays = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  // 1970-01-01 was a Thursday (index 4).
  const index = (((epochDays + 4) % 7) + 7) % 7;
  return WEEKDAY_LABELS[index] ?? '—';
}

/**
 * Shape the response into week columns, in date order.
 *
 * `today` is passed in rather than read from the clock so the caller — which
 * already has the user's timezone-corrected date from `useNowMinutes` — stays
 * the single source of "what day is it".
 */
export function toWeekDays(
  response: RoutineProgressResponse | null,
  today: string
): WeekDay[] {
  if (!response) return [];

  return [...response.days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      date: day.date,
      weekday: weekdayLabel(day.date),
      dayType: day.dayType,
      dayTypeName: day.dayTypeName,
      dayTypeColor: day.dayTypeColor,
      scheduled: day.scheduled,
      total: day.total,
      completed: day.completed,
      // `total === 0` becomes `null`, not 0. Callers render an empty capsule for
      // `null` and a filled one for a real zero.
      completionRate: day.total > 0 ? day.completionRate : null,
      scheduleSwitched: day.scheduleSwitched ?? false,
      isToday: day.date === today,
      isFuture: day.date > today,
    }));
}

/** One row of the day-type comparison. */
export interface DayTypeRollup {
  /** The preset's real name. Two presets sharing a name are one row. */
  dayTypeName: string;
  dayTypeColor: string | null;
  /** Days in the range that resolved to this preset *and* had tracked blocks. */
  daysRated: number;
  /** Mean of those days' completion rates, 0–100, rounded. */
  averageCompletionRate: number;
  /** Tracked blocks completed across those days. */
  completed: number;
  total: number;
}

/**
 * Group the range by resolved day type, best rate first.
 *
 * Grouping is on `dayTypeName`, not on the `dayType` enum: the enum has six
 * values and every user-defined preset collapses to `CUSTOM`, so grouping on it
 * would merge "College", "Placement" and "Exam Day" into one row and report a
 * single meaningless average across three different schedules.
 *
 * Days with no tracked blocks are excluded (see the module docblock). When
 * nothing in the range is rated the result is empty, so the caller renders a
 * genuine "not enough data yet" instead of a row of zeros.
 */
export function rollupByDayType(
  response: RoutineProgressResponse | null
): DayTypeRollup[] {
  if (!response) return [];

  const groups = new Map<string, DayTypeRollup>();

  for (const day of response.days) {
    if (day.total === 0) continue;

    const key = day.dayTypeName;
    const existing = groups.get(key);
    const rate = day.completionRate;

    if (existing) {
      existing.daysRated += 1;
      existing.averageCompletionRate += rate;
      existing.completed += day.completed;
      existing.total += day.total;
    } else {
      groups.set(key, {
        dayTypeName: key,
        dayTypeColor: day.dayTypeColor,
        daysRated: 1,
        averageCompletionRate: rate,
        completed: day.completed,
        total: day.total,
      });
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      averageCompletionRate: Math.round(group.averageCompletionRate / group.daysRated),
    }))
    .sort((a, b) => b.averageCompletionRate - a.averageCompletionRate);
}

/**
 * The headline: the week's mean across every rated day.
 *
 * Null when the week has nothing rated, which is different from 0 and is what
 * lets the strip say "nothing tracked this week" rather than "0%".
 */
export function weekAverage(response: RoutineProgressResponse | null): number | null {
  if (!response) return null;
  const rated = response.days.filter((day) => day.total > 0);
  if (rated.length === 0) return null;
  return Math.round(
    rated.reduce((sum, day) => sum + day.completionRate, 0) / rated.length
  );
}
