/**
 * Day-type override list derivations for `/routine`.
 *
 * Pure functions over `DayOverride[]`, so "which five overrides matter" is a
 * testable question rather than a `filter` buried in a component.
 *
 * ## Why the list is split
 *
 * `GET /api/routine/exceptions` returns every override the user has ever made,
 * most recent first, unbounded. Showing all of them is how a rail ends up
 * taller than the timeline it is meant to annotate. What a user actually wants
 * from this card is two things, and they want them in opposite directions:
 *
 *  - the **upcoming** ones, because an override five weeks out is a promise they
 *    are still keeping, and
 *  - the **most recent** ones, because "the day I marked as a rest day last
 *    Tuesday" is the question that prompted the card.
 *
 * Today's row is treated as upcoming rather than recent — it is the date the
 * user is looking at, and the list highlights it as selected.
 *
 * ## Ordering
 *
 * `upcoming` is soonest-first and `recent` is latest-first. Both fall out of one
 * backwards walk over an ascending sort: the walk visits the largest date first,
 * so everything it meets from `today` onwards is collected newest-first and
 * needs reversing, while everything before `today` is already latest-first and
 * must *not* be reversed.
 *
 * ## String comparison is correct here
 *
 * `YYYY-MM-DD` sorts lexicographically, which is why the split can use `<` and
 * `>=` directly with no `Date` construction. That is the same property
 * `weekdayLabel` relies on, and the reason neither function can be shifted by
 * the host timezone.
 */

import type { DayOverride } from '@/types/routine';

/** How many in each direction. Five upcoming and five recent fills a rail. */
export const DEFAULT_WINDOW = 5;

export interface OverrideList {
  /** Today and later, soonest first. */
  upcoming: DayOverride[];
  /** Before today, latest first. */
  recent: DayOverride[];
  /** Total across the whole history, which is usually more than is shown. */
  totalCount: number;
}

/**
 * Split overrides into the near future and the recent past around `today`.
 *
 * `limit` is applied per side, and `limit <= 0` returns both sides empty rather
 * than everything, so a caller cannot accidentally render an unbounded list by
 * passing zero.
 */
export function partitionOverrides(
  overrides: readonly DayOverride[] | null,
  today: string,
  limit: number = DEFAULT_WINDOW
): OverrideList {
  if (!overrides || overrides.length === 0 || limit <= 0) {
    return { upcoming: [], recent: [], totalCount: overrides?.length ?? 0 };
  }

  // Sorted defensively rather than relying on the repository's `date: 'desc'`.
  // The split needs ascending order for the upcoming side and descending for
  // the recent side, and one ascending sort serves both.
  const ascending = [...overrides].sort((a, b) => a.date.localeCompare(b.date));

  const upcoming: DayOverride[] = [];
  const recent: DayOverride[] = [];

  // Walk backwards from the most recent override. Everything from `today`
  // onwards is upcoming; once a date goes before `today` the rest of the
  // backwards walk is strictly recent, so it can be taken and then reversed.
  for (let i = ascending.length - 1; i >= 0; i -= 1) {
    const row = ascending[i];
    if (!row) continue;

    if (row.date >= today) {
      if (upcoming.length < limit) upcoming.push(row);
    } else if (recent.length < limit) {
      recent.push(row);
    }
  }

  return {
    // Ascending walk collected upcoming in reverse, so put it back in order.
    upcoming: upcoming.reverse(),
    // The backwards walk already collected `recent` latest-first, because it
    // visits the largest date first. Reversing it here was a bug: it turned
    // `02 Oct, 01 Oct` into `01 Oct, 02 Oct`, burying the nearest date.
    recent,
    totalCount: overrides.length,
  };
}

/**
 * A short relative label for a date, e.g. `today`, `tomorrow`, `in 5 days`,
 * `3 days ago`.
 *
 * Computed from the two date strings rather than from a timestamp difference,
 * so "yesterday" means the previous calendar day in the user's timezone rather
 * than "24 hours ago" measured from now — which would make a date read as
 * "2 days ago" at 11pm the day after.
 */
export function relativeDayLabel(date: string, today: string): string {
  if (date === today) return 'today';

  const days = calendarDaysBetweenStrings(date, today);
  if (days === null) return date;

  if (days > 0) {
    if (days === 1) return 'tomorrow';
    if (days < 7) return `in ${days} days`;
    const weeks = Math.round(days / 7);
    return weeks === 1 ? 'in a week' : `in ${weeks} weeks`;
  }

  const ago = Math.abs(days);
  if (ago === 1) return 'yesterday';
  if (ago < 7) return `${ago} days ago`;
  const weeks = Math.round(ago / 7);
  return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
}

/**
 * Whole calendar days from `from` to `to` (`to - from`), or `null` if either
 * string is not a readable date.
 *
 * Computed through `Date.UTC` so the answer depends only on the two calendar
 * dates, never on the host's clock or its timezone.
 */
function calendarDaysBetweenStrings(to: string, from: string): number | null {
  const toDays = epochDay(to);
  const fromDays = epochDay(from);
  if (toDays === null || fromDays === null) return null;
  return toDays - fromDays;
}

function epochDay(date: string): number | null {
  const parts = date.split('-');
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}
