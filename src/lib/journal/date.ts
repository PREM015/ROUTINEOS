/**
 * Journal date keys.
 *
 * `JournalEntry.date` is a `String` holding `YYYY-MM-DD`, keyed by
 * `@@unique([userId, date])`. That makes the *string* the entry's identity for
 * a day, so every place that produces one has to agree about the user's
 * timezone. Three mistakes were live in this domain:
 *
 *   - `new Date().toISOString().slice(0, 10)` is the **UTC** date, so an entry
 *     written at 22:00 in `Asia/Kolkata` was filed under the previous day;
 *   - `new Date('2026-02-30')` is *not* invalid — it rolls over to March 2, so
 *     a naive regex check accepts a date that can never exist;
 *   - `new Date('YYYY-MM-DD')` is parsed as UTC midnight, then read back with
 *     local getters, which shifts the day for anyone west of Greenwich.
 *
 * These helpers are pure and calendar-agnostic on purpose: `tests/` can import
 * them, and so can a `'use client'` file, without pulling in Prisma.
 */

/** Matches the `date` column's shape. Shape only — see `isValidDateKey`. */
export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

/**
 * True when `value` is a `YYYY-MM-DD` string that names a real calendar day.
 *
 * Rejects both malformed shapes and impossible dates, which a regex alone does
 * not: `2026-02-30` matches `\d{4}-\d{2}-\d{2}` but is not a date.
 *
 * @example
 * isValidDateKey('2026-02-28') // => true
 * isValidDateKey('2026-02-30') // => false
 */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  if (month < 1 || month > 12 || day < 1) return false;

  // Day 0 of the next month is the last day of this one, so this comparison
  // rejects 02-30 without needing a table of month lengths.
  return day <= daysInMonth(year, month);
}

/** True when `value` is a `YYYY-MM` string naming a real month. */
export function isValidMonthKey(value: unknown): value is string {
  if (typeof value !== 'string' || !MONTH_KEY_PATTERN.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

/** Days in a month, leap years included. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * `YYYY-MM-DD` for a `Date`, read in `timezone`.
 *
 * Defaults to the host zone rather than committing to UTC or to the app's
 * historical `DEFAULT_TZ`, and returns `null` for an invalid date instead of
 * emitting `NaN-NaN-NaN` into a date column.
 */
export function dateKeyFor(date: Date, timezone?: string): string | null {
  if (Number.isNaN(date.getTime())) return null;

  try {
    // `en-CA` formats as YYYY-MM-DD, which is already the key format — no
    // manual pad/slice assembly to get wrong.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
}

/**
 * A `Date` at **local noon** on the day a date key names.
 *
 * Local noon is the whole trick. `new Date('2026-03-04')` is UTC midnight; in
 * `America/New_York` that is the previous evening, so calling `getDate()` on it
 * yields the 3rd. Noon has no such boundary to cross in any zone the app
 * supports.
 */
export function dateFromKey(value: string): Date | null {
  if (!isValidDateKey(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/** `'2026-03-04'` → `'2026-03'`. */
export function monthKeyFromDateKey(dateKey: string): string | null {
  if (!isValidDateKey(dateKey)) return null;
  return dateKey.slice(0, 7);
}

/** First and last day of a `YYYY-MM` month, as date keys. */
export function monthRange(monthKey: string): { startDate: string; endDate: string } | null {
  if (!isValidMonthKey(monthKey)) return null;
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const last = daysInMonth(year, month);
  return {
    startDate: `${monthKey}-01`,
    endDate: `${monthKey}-${String(last).padStart(2, '0')}`,
  };
}

/** Shift a month key by `offset` months, staying on a valid key. */
export function shiftMonth(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const total = (year ?? 1970) * 12 + ((month ?? 1) - 1) + offset;
  const shiftedYear = Math.floor(total / 12);
  const shiftedMonth = (total % 12) + 1;
  return `${String(shiftedYear).padStart(4, '0')}-${String(shiftedMonth).padStart(2, '0')}`;
}

/** Add (or subtract) days to a date key without a `Date` round trip. */
export function shiftDateKey(dateKey: string, days: number): string | null {
  const date = dateFromKey(dateKey);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Human label for a date key, e.g. `'Wednesday, March 4, 2026'`. */
export function formatDateKey(dateKey: string, locale = 'en-US'): string {
  const date = dateFromKey(dateKey);
  if (!date) return dateKey;
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Compact human label for a date key, e.g. `'Mar 4, 2026'`. */
export function formatDateKeyShort(dateKey: string, locale = 'en-US'): string {
  const date = dateFromKey(dateKey);
  if (!date) return dateKey;
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Human label for a month key, e.g. `'March 2026'`. */
export function formatMonthKey(monthKey: string, locale = 'en-US'): string {
  if (!isValidMonthKey(monthKey)) return monthKey;
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Which of two date keys is later, or `null` when either is invalid.
 *
 * String comparison is enough for `YYYY-MM-DD`, and it is what makes "is this
 * date in the future?" answerable without constructing a `Date` in the user's
 * zone.
 */
export function compareDateKeys(a: string, b: string): number | null {
  if (!isValidDateKey(a) || !isValidDateKey(b)) return null;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** True when `dateKey` is a real day the user has not written yet. */
export function isFutureDateKey(dateKey: string, todayKey: string): boolean {
  const comparison = compareDateKeys(dateKey, todayKey);
  return comparison !== null && comparison > 0;
}

/**
 * Ordered list of date keys for one month, padded to whole weeks so the
 * calendar grid starts on Sunday.
 *
 * Padding cells are `null`, which is what lets the grid render leading and
 * trailing blanks without the caller having to know how many there are.
 */
export function calendarGrid(monthKey: string): Array<string | null> {
  const range = monthRange(monthKey);
  if (!range) return [];

  const first = dateFromKey(range.startDate);
  const last = dateFromKey(range.endDate);
  if (!first || !last) return [];

  const cells: Array<string | null> = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
  for (let i = 1; i <= last.getDate(); i += 1) cells.push(`${monthKey}-${String(i).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Resolve the date a create request is filing against, and say whether that
 * date is already taken.
 *
 * `JournalEntry` is `@@unique([userId, date])`, so a second entry for the same
 * day is a database-level conflict rather than something the UI can quietly
 * ignore. The two callers want opposite behaviour from it — the editor should
 * open the existing entry instead of duplicating it, the API should answer 409
 * — so both need the same decision and neither should re-derive it.
 *
 * @example
 * resolveCreateDate({ date: '2026-03-04', today: '2026-03-06' })
 * // => { date: '2026-03-04', isPast: true }
 */
export function resolveCreateDate(
  requested: string | undefined,
  todayKey: string
): { date: string; isPast: boolean; isToday: boolean } | null {
  const fallback = isValidDateKey(todayKey) ? todayKey : null;
  if (requested === undefined || requested === '') {
    if (!fallback) return null;
    return { date: fallback, isPast: false, isToday: true };
  }

  if (!isValidDateKey(requested)) return null;
  if (!fallback) return { date: requested, isPast: false, isToday: false };

  const comparison = compareDateKeys(requested, fallback);
  return {
    date: requested,
    isPast: comparison === -1,
    isToday: comparison === 0,
  };
}
