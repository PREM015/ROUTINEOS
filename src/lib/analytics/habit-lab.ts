/**
 * Sorting, filtering and searching for the Habit Lab.
 *
 * Pure and separate from the component for two reasons.
 *
 * The first is testability: "the pooled rate shown at the top equals the hero's habit
 * rate" is an invariant about arithmetic, and arithmetic is only checkable in a place
 * with no React in it.
 *
 * The second is that the filters must never change what a rate *is*. A search box that
 * recomputed the pooled rate over the rows it happened to be showing would produce a
 * different headline number from the hero for the same period — which is precisely the
 * four-denominators defect this feature set was built to end. So the pooled figures are
 * always computed from the **unfiltered** panel, and the filters only decide which rows
 * are visible.
 */

import type { AnalyticsHabitRow } from '@/types/analytics';
import {
  HABIT_TIER_DISPLAY_ORDER,
  type HabitTier,
} from '@/constants/prisma-enums';

export type HabitSort = 'rate-asc' | 'rate-desc' | 'name' | 'completed-desc';

/**
 * Re-exported so the component has one import for the whole vocabulary.
 *
 * `HabitTier` comes from the client-safe mirror rather than `@/generated/prisma`: this
 * module is imported by a `'use client'` component, and the generated entry point is the
 * Node client, so importing the enum as a value from there would pull it into the browser
 * bundle.
 */
export { HABIT_TIER_DISPLAY_ORDER };
export type { HabitTier };

export interface HabitFilters {
  sort: HabitSort;
  /** Empty means "every tier". */
  tiers: HabitTier[];
  /** Case-insensitive substring match against the habit name. */
  query: string;
}

export const DEFAULT_HABIT_FILTERS: HabitFilters = {
  sort: 'rate-asc',
  tiers: [],
  query: '',
};

export interface HabitLabRow extends AnalyticsHabitRow {
  /**
   * `true` when the habit was never due in this period.
   *
   * Distinct from a 0% rate: a habit that never applied is unmeasured, and sorting it
   * among the "worst" habits would rank absence as failure.
   */
  notDue: boolean;
}

/**
 * Decorate the panel's rows with the facts the component needs.
 *
 * Kept separate from filtering so the pooled rate has exactly one source: the panel's
 * own totals, never a recount of whatever rows survive the current filter.
 */
export function toHabitRows(rows: AnalyticsHabitRow[]): HabitLabRow[] {
  return rows.map((row) => ({ ...row, notDue: row.scheduled === 0 || row.rate === null }));
}

/**
 * Apply the current filters.
 *
 * Habitless habits sort last under every ordering. A name search that matched nothing
 * would otherwise leave a list sorted by a rate the user cannot see, which reads as a
 * bug rather than as a filter.
 */
export function filterAndSortHabits(
  rows: HabitLabRow[],
  filters: HabitFilters
): HabitLabRow[] {
  const query = filters.query.trim().toLowerCase();

  const visible = rows.filter((row) => {
    if (filters.tiers.length > 0 && !filters.tiers.includes(row.tier)) return false;
    if (query.length > 0 && !row.name.toLowerCase().includes(query)) return false;
    return true;
  });

  const sorted = [...visible].sort((a, b) => {
    // Not-due habits go last under every sort, before any comparison of values.
    if (a.notDue !== b.notDue) return a.notDue ? 1 : -1;

    switch (filters.sort) {
      case 'rate-desc':
        return (b.rate ?? 0) - (a.rate ?? 0) || a.name.localeCompare(b.name);
      case 'name':
        return a.name.localeCompare(b.name);
      case 'completed-desc':
        return b.completed - a.completed || a.name.localeCompare(b.name);
      case 'rate-asc':
      default:
        return (a.rate ?? 0) - (b.rate ?? 0) || a.name.localeCompare(b.name);
    }
  });

  return sorted;
}

/**
 * The one-line summary above the list.
 *
 * Computed from the *filtered* rows on purpose — "4 habits, 1 below half" is a
 * statement about what is on screen. The pooled rate itself is never recomputed here;
 * that comes from the panel, which is the same figure the hero shows.
 */
export function summariseHabits(visible: HabitLabRow[]): string {
  if (visible.length === 0) return 'No habits match.';

  const measured = visible.filter((row) => !row.notDue);
  const notDue = visible.length - measured.length;

  if (measured.length === 0) {
    return `${visible.length} ${plural(visible.length, 'habit')}, none due in this period.`;
  }

  const belowHalf = measured.filter((row) => (row.rate ?? 0) < 50).length;
  const parts = [`${visible.length} ${plural(visible.length, 'habit')}`];
  if (belowHalf > 0) parts.push(`${belowHalf} below half`);
  if (notDue > 0) parts.push(`${notDue} not due`);

  return `${parts.join(' · ')}.`;
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
