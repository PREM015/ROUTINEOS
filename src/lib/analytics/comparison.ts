/**
 * Comparison windows for the analytics hero.
 *
 * ## The problem this exists to solve
 *
 * A part-lived period compared against a whole one is not a measurement, it is a
 * flattering number. On the 3rd of a month, nine days of scores were being lined up
 * against thirty-one, and the page either showed nothing or — worse — showed the
 * difference as though the user had declined. The service used to solve this by
 * refusing: `buildComparison` returned `null` for month and year, so the two longest
 * views answered "is this better than before?" with silence.
 *
 * Refusing is honest but it is not useful, and there is a defensible alternative:
 * compare the part that has happened to the same part of the period before. Three
 * days of this month against three days of last month is a real comparison, provided
 * the page says that is what it did.
 *
 * ## Why the wording is generated rather than templated at the call site
 *
 * The `basis` string is the part that makes the number trustworthy, so it is derived
 * from the same values the arithmetic used. A caller that formatted its own label
 * could disagree with the window it was handed, and the failure mode is a confident
 * number attached to the wrong claim — worse than no number at all.
 *
 * Pure and dependency-free: no repository, no Prisma, no environment.
 */

import { calendarDaysBetween, shiftCalendarDay } from '@/lib/dates';
import type { Period } from '@/lib/period-range';

/** What the user is shown, so the number can be interpreted rather than trusted. */
export interface ComparisonWindow {
  /** The previous-period window actually queried. */
  start: string;
  end: string;
  /** Days of the *current* period that have already happened. */
  elapsedDays: number;
  /** Days the current period contains in total. */
  totalDays: number;
  /** True when the previous window was cut short to match elapsed days. */
  clipped: boolean;
  /**
   * Exactly what was compared, in words. Always populated — including when there is
   * nothing to compare, where it carries the reason instead of a claim.
   */
  basis: string;
}

const PERIOD_WORD: Record<Period, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
};

/**
 * Days of `range` that have already happened, in the user's timezone.
 *
 * A period entirely in the future has none: those days have not been missed, and
 * counting them would produce a "you are N days behind" chip on a week that has not
 * started.
 */
export function elapsedDaysIn(
  range: { start: string; end: string },
  userToday: string
): number {
  if (range.start > userToday) return 0;
  const elapsedEnd = range.end < userToday ? range.end : userToday;
  return calendarDaysBetween(range.start, elapsedEnd) + 1;
}

/**
 * The window to compare against, and the sentence describing it.
 *
 * Clipping is anchored at the *start* of the previous period, so "the first 3 days
 * of this month" is compared with "the first 3 days of last month" rather than its
 * last 3 — which is what someone comparing two months actually means by it.
 */
export function buildComparisonWindow(
  period: Period,
  current: { start: string; end: string },
  previous: { start: string; end: string },
  userToday: string
): ComparisonWindow {
  const word = PERIOD_WORD[period];
  const elapsedDays = elapsedDaysIn(current, userToday);
  const totalDays = calendarDaysBetween(current.start, current.end) + 1;

  if (elapsedDays === 0) {
    return {
      start: previous.start,
      end: previous.end,
      elapsedDays: 0,
      totalDays,
      clipped: false,
      basis: `This ${word} has not started yet, so there is nothing to compare it against yet.`,
    };
  }

  const clipped = elapsedDays < totalDays;

  if (!clipped) {
    return {
      start: previous.start,
      end: previous.end,
      elapsedDays,
      totalDays,
      clipped: false,
      basis: `The whole ${word} compared with the whole previous ${word}.`,
    };
  }

  /*
    Only clip when the previous period actually has that many days to give.

    The 3rd of this month against the 3rd-to-5th of a previous month that began on
    the 28th would compare three days against one. Clamping to the previous period's
    own length is the lesser distortion, and the basis says so rather than quietly
    comparing unequal spans.
  */
  const previousTotalDays = calendarDaysBetween(previous.start, previous.end) + 1;
  const comparedDays = Math.min(elapsedDays, previousTotalDays);
  const end = shiftCalendarDay(previous.start, comparedDays - 1);

  return {
    start: previous.start,
    end,
    elapsedDays,
    totalDays,
    clipped: true,
    basis:
      comparedDays < elapsedDays
        ? `The first ${elapsedDays} days of this ${word}, against the only ${comparedDays} ` +
          `${comparedDays === 1 ? 'day' : 'days'} the previous ${word} had by that point.`
        : `The first ${elapsedDays} of ${totalDays} days, against the first ${comparedDays} ` +
          `${comparedDays === 1 ? 'day' : 'days'} of the previous ${word}.`,
  };
}
