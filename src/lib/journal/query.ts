import { DEFAULT_JOURNAL_PAGE_SIZE, MAX_JOURNAL_PAGE_SIZE } from '@/schemas/journal.schema';
import { formatDateKeyShort, formatMonthKey, isValidDateKey, isValidMonthKey } from './date';

/**
 * Journal browse state, and its round trip through the URL query string.
 *
 * The list used to hold search/filter/sort/page in component state and fetch
 * `limit=100` up front, so a reload lost the view and anything past the
 * hundredth entry was unreachable. Putting the state in the query string makes
 * it shareable, survives reload and back/forward, and lets the server do the
 * paging — which is also what makes a returned `total` mean something.
 *
 * Pure and string-only, so `tests/` can pin the mapping with no DOM and no DB.
 */

/** Which entries the list is showing. */
export type JournalView = 'active' | 'favorites' | 'archived';

export type JournalSortField = 'date' | 'createdAt' | 'title' | 'mood';

export type JournalSortOrder = 'asc' | 'desc';

export interface JournalBrowseState {
  /** Free-text search over title and content. */
  search: string;
  /** `YYYY-MM-DD`; restricts to that one day. */
  date: string;
  /** `YYYY-MM`; restricts to that month. */
  month: string;
  tagId: string;
  mood: number | null;
  view: JournalView;
  sortBy: JournalSortField;
  sortOrder: JournalSortOrder;
  /** One-based. */
  page: number;
  pageSize: number;
}

export const DEFAULT_JOURNAL_BROWSE: JournalBrowseState = {
  search: '',
  date: '',
  month: '',
  tagId: '',
  mood: null,
  view: 'active',
  sortBy: 'date',
  sortOrder: 'desc',
  page: 1,
  pageSize: DEFAULT_JOURNAL_PAGE_SIZE,
};

/**
 * Query-string keys, kept in one place so the writer and the reader cannot
 * drift and so the URL stays readable.
 */
export const JOURNAL_QUERY_KEYS = {
  search: 'q',
  date: 'date',
  month: 'month',
  tagId: 'tag',
  mood: 'mood',
  view: 'view',
  sortBy: 'sort',
  sortOrder: 'order',
  page: 'page',
  pageSize: 'size',
} as const;

const VIEWS: readonly JournalView[] = ['active', 'favorites', 'archived'];
const SORT_FIELDS: readonly JournalSortField[] = ['date', 'createdAt', 'title', 'mood'];

function oneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T
): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Read browse state out of a query string, discarding anything unrecognised.
 *
 * Invalid values are dropped rather than repaired. A hand-edited `?mood=9` or
 * `?page=-4` should render the unfiltered first page rather than fail — and,
 * more importantly, must never reach the API, where it would be a 400.
 */
export function journalBrowseStateFromQuery(
  query: string | URLSearchParams
): JournalBrowseState {
  const params = typeof query === 'string' ? new URLSearchParams(query) : query;

  const rawDate = params.get(JOURNAL_QUERY_KEYS.date);
  const rawMonth = params.get(JOURNAL_QUERY_KEYS.month);
  const rawMood = params.get(JOURNAL_QUERY_KEYS.mood);
  const rawPage = Number(params.get(JOURNAL_QUERY_KEYS.page));
  const rawPageSize = Number(params.get(JOURNAL_QUERY_KEYS.pageSize));

  return {
    search: (params.get(JOURNAL_QUERY_KEYS.search) ?? '').slice(0, 200),
    date: isValidDateKey(rawDate) ? rawDate : '',
    month: isValidMonthKey(rawMonth) ? rawMonth : '',
    tagId: (params.get(JOURNAL_QUERY_KEYS.tagId) ?? '').slice(0, 64),
    mood: rawMood !== null && /^[1-5]$/.test(rawMood) ? Number(rawMood) : null,
    view: oneOf(params.get(JOURNAL_QUERY_KEYS.view), VIEWS, 'active'),
    sortBy: oneOf(params.get(JOURNAL_QUERY_KEYS.sortBy), SORT_FIELDS, 'date'),
    sortOrder: oneOf<JournalSortOrder>(
      params.get(JOURNAL_QUERY_KEYS.sortOrder),
      ['asc', 'desc'],
      'desc'
    ),
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize:
      Number.isInteger(rawPageSize) && rawPageSize > 0
        ? Math.min(rawPageSize, MAX_JOURNAL_PAGE_SIZE)
        : DEFAULT_JOURNAL_PAGE_SIZE,
  };
}

/**
 * Serialise browse state, omitting defaults.
 *
 * Defaults are omitted so the common case — just opening the journal — has a
 * clean `/journal` URL instead of `?sort=date&order=desc&page=1`.
 */
export function journalBrowseStateToQuery(state: Partial<JournalBrowseState>): string {
  const merged = { ...DEFAULT_JOURNAL_BROWSE, ...state };
  const params = new URLSearchParams();

  if (merged.search.trim().length > 0) params.set(JOURNAL_QUERY_KEYS.search, merged.search.trim());
  if (merged.date) params.set(JOURNAL_QUERY_KEYS.date, merged.date);
  if (merged.month) params.set(JOURNAL_QUERY_KEYS.month, merged.month);
  if (merged.tagId) params.set(JOURNAL_QUERY_KEYS.tagId, merged.tagId);
  if (merged.mood !== null) params.set(JOURNAL_QUERY_KEYS.mood, String(merged.mood));
  if (merged.view !== 'active') params.set(JOURNAL_QUERY_KEYS.view, merged.view);
  if (merged.sortBy !== 'date') params.set(JOURNAL_QUERY_KEYS.sortBy, merged.sortBy);
  if (merged.sortOrder !== 'desc') params.set(JOURNAL_QUERY_KEYS.sortOrder, merged.sortOrder);
  // Page 1 and the default size are what an unfiltered first page is; writing
  // them adds noise without adding meaning.
  if (merged.page > 1) params.set(JOURNAL_QUERY_KEYS.page, String(merged.page));
  if (merged.pageSize !== DEFAULT_JOURNAL_PAGE_SIZE) {
    params.set(JOURNAL_QUERY_KEYS.pageSize, String(merged.pageSize));
  }

  const serialised = params.toString();
  return serialised.length > 0 ? `?${serialised}` : '';
}

/**
 * The boolean filters a view implies.
 *
 * Exists because two call sites need this and had each grown their own copy: the
 * list request and the export query string. They disagreed — the list excluded
 * archived entries from the default view and the export did not — so "download
 * the filtered entries" produced a file containing entries the list was hiding.
 *
 * `active` is a real filter rather than the absence of one: it has to send
 * `isArchived=false`, because omitting the parameter means "no opinion" and the
 * repository would then return archived entries too.
 */
export function journalViewFilter(
  state: Pick<JournalBrowseState, 'view'>
): { isFavorite?: boolean; isArchived?: boolean } {
  if (state.view === 'favorites') return { isFavorite: true };
  if (state.view === 'archived') return { isArchived: true };
  return { isArchived: false };
}

/**
 * API query parameters for the current browse state.
 *
 * Booleans stay booleans: `z.coerce.boolean()` is `Boolean(value)` and
 * `Boolean('false')` is `true`, so stringifying here would invert the archived
 * filter.
 */
export function journalBrowseStateToApiQuery(
  state: JournalBrowseState
): Record<string, string | number | boolean | undefined> {
  const offset = journalPageOffset(state);

  return {
    search: state.search.trim() || undefined,
    date: state.date || undefined,
    month: state.month || undefined,
    tagId: state.tagId || undefined,
    mood: state.mood ?? undefined,
    ...journalViewFilter(state),
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
    limit: state.pageSize,
    offset: offset > 0 ? offset : undefined,
  };
}

/** Offset for a page. */
export function journalPageOffset(state: JournalBrowseState): number {
  return Math.max(0, (state.page - 1) * state.pageSize);
}

/** Total pages for `total` results, never below one. */
export function journalPageCount(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * Clamp a requested page into range.
 *
 * Needed because a filter change leaves the old page number behind: on a
 * one-page result set, page 6 is empty. This is what stops the list rendering
 * "no entries" when it should render the only page there is.
 */
export function clampJournalPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, Math.floor(page) || 1), journalPageCount(total, pageSize));
}

/** True when anything other than sort order is narrowing the list. */
export function hasJournalFilters(state: JournalBrowseState): boolean {
  return (
    state.search.trim().length > 0 ||
    state.date.length > 0 ||
    state.month.length > 0 ||
    state.tagId.length > 0 ||
    state.mood !== null ||
    state.view !== 'active'
  );
}

/**
 * The state a control change should produce.
 *
 * Page resets to 1 for every change except a re-sort, because re-ordering the
 * page you are already on is a reasonable thing to want while a narrowed
 * result set is not.
 */
export function journalBrowseStateAfterChange(
  state: JournalBrowseState,
  change: Partial<JournalBrowseState>
): JournalBrowseState {
  const next = { ...state, ...change };
  const isSortChange = 'sortBy' in change || 'sortOrder' in change;
  return isSortChange ? next : { ...next, page: 1 };
}

/** Sort options offered in the UI, paired with their labels. */
export const JOURNAL_SORT_OPTIONS: ReadonlyArray<{
  value: JournalSortField;
  order: JournalSortOrder;
  label: string;
}> = [
  { value: 'date', order: 'desc', label: 'Newest first' },
  { value: 'date', order: 'asc', label: 'Oldest first' },
  { value: 'mood', order: 'desc', label: 'Mood: high to low' },
  { value: 'mood', order: 'asc', label: 'Mood: low to high' },
  { value: 'title', order: 'asc', label: 'Title: A–Z' },
  { value: 'createdAt', order: 'desc', label: 'Recently edited' },
];

/** View options offered in the UI. */
export const JOURNAL_VIEW_OPTIONS: ReadonlyArray<{ value: JournalView; label: string }> = [
  { value: 'active', label: 'All entries' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'archived', label: 'Archive' },
];

/**
 * Human description of each active filter, for the "showing …" summary line.
 *
 * Returned as separate parts rather than one joined string so the UI can render
 * them as chips and drop the container entirely when there are none.
 */
export function describeJournalFilters(state: JournalBrowseState): string[] {
  const parts: string[] = [];

  if (state.search.trim().length > 0) parts.push(`“${state.search.trim()}”`);
  if (state.date) parts.push(formatDateKeyShort(state.date));
  if (state.month) parts.push(formatMonthKey(state.month));
  if (state.mood !== null) parts.push(`mood ${state.mood}/5`);
  if (state.view === 'favorites') parts.push('favorites');
  if (state.view === 'archived') parts.push('archived');

  return parts;
}
