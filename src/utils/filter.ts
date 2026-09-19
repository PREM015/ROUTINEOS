/**
 * Generic filter helpers for arrays of objects. All filters are pure:
 * they never mutate the input and return new arrays.
 */

/**
 * Keep items whose searched field(s) contain the term (case-insensitive).
 * With no `keys` every own property is searched.
 * @example bySearchTerm(tasks, 'gro', ['title'])
 */
export function bySearchTerm<T extends object>(
  items: readonly T[],
  term: string,
  keys?: Array<keyof T>
): T[] {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return items.slice();
  const searchKeys = keys ?? (Object.keys(items[0] ?? {}) as Array<keyof T>);
  return items.filter((item) =>
    searchKeys.some((key) => String(item[key] ?? '').toLowerCase().includes(normalized))
  );
}

/**
 * Keep items whose numeric value is within [min, max] (inclusive). Bounds are optional.
 * @example byRange(habits, (h) => h.streak, 3, 10)
 */
export function byRange<T>(
  items: readonly T[],
  getValue: (item: T) => number | null | undefined,
  min?: number,
  max?: number
): T[] {
  return items.filter((item) => {
    const value = getValue(item);
    if (value === null || value === undefined) return false;
    if (min !== undefined && value < min) return false;
    if (max !== undefined && value > max) return false;
    return true;
  });
}

/**
 * Keep items whose date value falls within [start, end] (inclusive). Bounds are optional.
 * Accepts Date, date string, or timestamp.
 * @example byDateRange(logs, (l) => l.date, '2025-01-01', '2025-01-31')
 */
export function byDateRange<T>(
  items: readonly T[],
  getDate: (item: T) => Date | string | number | null | undefined,
  start?: Date | string | number,
  end?: Date | string | number
): T[] {
  const startTime = start === undefined ? null : toTime(start);
  const endTime = end === undefined ? null : toTime(end);
  return items.filter((item) => {
    const value = toTime(getDate(item));
    if (value === null) return false;
    if (startTime !== null && value < startTime) return false;
    if (endTime !== null && value > endTime) return false;
    return true;
  });
}

/**
 * Keep items whose status (or statuses) match the given value(s).
 * @example byStatus(tasks, (t) => t.status, ['todo', 'in_progress'])
 */
export function byStatus<T, S>(
  items: readonly T[],
  getStatus: (item: T) => S | null | undefined,
  status: S | readonly S[]
): T[] {
  const accepted = Array.isArray(status) ? status : ([status] as readonly S[]);
  return items.filter((item) => {
    const value = getStatus(item);
    return value !== null && value !== undefined && accepted.includes(value);
  });
}

/**
 * Keep items whose tags intersect the given tag list. Matching is case-insensitive.
 * `match: 'any'` requires at least one tag, `'all'` (default) requires every tag.
 * @example byTags(notes, (n) => n.tags, ['work', 'urgent'], { match: 'any' })
 */
export function byTags<T>(
  items: readonly T[],
  getTags: (item: T) => readonly string[] | undefined,
  tags: readonly string[],
  options: { match?: 'any' | 'all' } = {}
): T[] {
  const { match = 'all' } = options;
  const desired = tags.map((tag) => tag.toLowerCase());
  if (desired.length === 0) return items.slice();
  return items.filter((item) => {
    const itemTags = getTags(item) ?? [];
    const has = (tag: string): boolean =>
      itemTags.some((t) => t.toLowerCase() === tag);
    return match === 'any' ? desired.some(has) : desired.every(has);
  });
}

/**
 * Compose multiple filters and apply them in order.
 * @example applyFilters(items, [byStatus(...), byRange(...)])
 */
export function applyFilters<T>(
  items: readonly T[],
  filters: Array<(items: readonly T[]) => T[]>
): T[] {
  return filters.reduce<T[]>(
    (acc, filter) => filter(acc),
    items.slice()
  );
}

function toTime(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}