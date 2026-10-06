import type { JournalSortField, JournalSortOrder } from '@/lib/journal/query';

/**
 * Journal sort order — pure.
 *
 * Two rules, both of which were wrong at once in the repository.
 *
 * **The requested direction has to reach the sort column.** The old
 * `buildOrderBy` applied `sortOrder` only to the `date` tiebreaker and took the
 * sort column's direction from a hard-coded per-field default. So "Mood: low to
 * high" — `mood` with `sortOrder: 'asc'` — ordered by `mood desc` and returned
 * exactly the list the neighbouring option returns. Ascending title worked only
 * because that column's default happened to be `'asc'`.
 *
 * **Nullable columns need their null placement pinned.** Postgres puts nulls
 * last for `asc` and *first* for `desc`, so untitled and unrated entries sorted
 * above the titled and rated ones in descending order. `nulls: 'last'` puts them
 * at the bottom in both directions, where an unnamed entry belongs.
 *
 * `date` and `createdAt` are non-nullable and take a bare direction; only
 * `title` and `mood` take the object form.
 *
 * Kept out of the repository — and out of Prisma — so it can be tested. The
 * repository casts the result to Prisma's own input type at the single call site.
 */

export type JournalSortColumn = 'date' | 'createdAt' | 'title' | 'mood';

/** Columns a journal entry can be sorted by that are nullable. */
const NULLABLE_COLUMNS: ReadonlySet<JournalSortColumn> = new Set(['title', 'mood']);

export interface JournalOrderByEntry {
  /** Non-nullable column: direction only. */
  direction?: JournalSortOrder;
  /** Nullable column: direction plus null placement. */
  nullable?: { sort: JournalSortOrder; nulls: 'last' };
}

export function isNullableSortColumn(column: JournalSortColumn): boolean {
  return NULLABLE_COLUMNS.has(column);
}

/**
 * The full ordering for a sort request: the sort column, then `date` as the
 * tiebreaker.
 *
 * `date` is unique per user, so it makes a total order. Without it, two entries
 * written in the same millisecond could swap places between requests and one of
 * them would be unreachable at any page size — which is exactly the class of
 * "missing entry" bug this list already had once.
 *
 * @example
 * journalOrderBy('mood', 'asc') // => [{ mood: { sort: 'asc', nulls: 'last' } }, { direction: 'desc' }]
 */
export function journalOrderBy(
  sortBy: JournalSortField | undefined,
  sortOrder: JournalSortOrder | undefined
): JournalOrderByEntry[] {
  const column = (sortBy ?? 'date') as JournalSortColumn;
  const order = sortOrder ?? 'desc';

  // `date` is already unique, so it needs no tiebreaker after it.
  if (column === 'date') return [{ direction: order }];

  return [
    isNullableSortColumn(column)
      ? { nullable: { sort: order, nulls: 'last' } }
      : { direction: order },
    { direction: order },
  ];
}
