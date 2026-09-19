/**
 * Generic sorting helpers. All functions are pure and support asc/desc with
 * configurable null/undefined placement (nulls last by default).
 */

import { getPath } from './object';

export type SortDirection = 'asc' | 'desc';

export interface SortOptions {
  nulls?: 'first' | 'last';
}

export interface SortCriterion<T> {
  get: (item: T) => unknown;
  direction?: SortDirection;
  nulls?: 'first' | 'last';
}

/**
 * Sort by a top-level key.
 * @example sortByKey(tasks, 'dueDate', 'desc')
 */
export function sortByKey<T, K extends keyof T>(
  items: readonly T[],
  key: K,
  direction: SortDirection = 'asc',
  options: SortOptions = {}
): T[] {
  return items.slice().sort((a, b) =>
    comparePrimitive(a[key], b[key], direction, options.nulls)
  );
}

/**
 * Sort by the numeric value derived from each item.
 * @example sortByNumber(scores, (s) => s.points, 'desc')
 */
export function sortByNumber<T>(
  items: readonly T[],
  getValue: (item: T) => number | null | undefined,
  direction: SortDirection = 'asc',
  options: SortOptions = {}
): T[] {
  return items.slice().sort((a, b) =>
    comparePrimitive(getValue(a), getValue(b), direction, options.nulls)
  );
}

/**
 * Sort by a date (Date, ISO string, or timestamp) derived from each item.
 * @example sortByDate(entries, (e) => e.createdAt, 'desc')
 */
export function sortByDate<T>(
  items: readonly T[],
  getDate: (item: T) => Date | string | number | null | undefined,
  direction: SortDirection = 'asc',
  options: SortOptions = {}
): T[] {
  return items.slice().sort((a, b) => {
    const at = toTimestamp(getDate(a));
    const bt = toTimestamp(getDate(b));
    return comparePrimitive(at, bt, direction, options.nulls);
  });
}

/**
 * Sort by a dot path (supports array indices). Uses `getPath` from `./object`.
 * @example sortByNested(items, 'profile.age', 'desc')
 */
export function sortByNested<T extends object>(
  items: readonly T[],
  path: string,
  direction: SortDirection = 'asc',
  options: SortOptions = {}
): T[] {
  return items.slice().sort((a, b) =>
    comparePrimitive(getPath(a, path), getPath(b, path), direction, options.nulls)
  );
}

/**
 * Sort by multiple criteria in order; entries equal on one criterion fall
 * through to the next. Returns a new array.
 * @example multiSort(users, [{ get: (u) => u.team }, { get: (u) => u.score, direction: 'desc' }])
 */
export function multiSort<T>(items: readonly T[], criteria: Array<SortCriterion<T>>): T[] {
  return items.slice().sort((a, b) => {
    for (const criterion of criteria) {
      const result = comparePrimitive(
        criterion.get(a),
        criterion.get(b),
        criterion.direction ?? 'asc',
        criterion.nulls
      );
      if (result !== 0) return result;
    }
    return 0;
  });
}

/**
 * Insert a value into a sorted array at the correct position (stable), returning a new array.
 * @example insertSorted([1, 3, 5], 4, (a, b) => a - b) // [1, 3, 4, 5]
 */
export function insertSorted<T>(
  arr: readonly T[],
  value: T,
  compare: (a: T, b: T) => number
): T[] {
  const result = arr.slice();
  let index = result.length;
  for (let i = 0; i < result.length; i++) {
    const current = result[i];
    if (current === undefined) break;
    if (compare(value, current) <= 0) {
      index = i;
      break;
    }
  }
  result.splice(index, 0, value);
  return result;
}

function comparePrimitive(
  a: unknown,
  b: unknown,
  direction: SortDirection,
  nulls: 'first' | 'last' = 'last'
): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull || bNull) {
    const nullScore = nulls === 'first' ? -1 : 1;
    if (aNull) return nullScore;
    return -nullScore;
  }

  const at = a instanceof Date ? a.getTime() : undefined;
  const bt = b instanceof Date ? b.getTime() : undefined;
  let result: number;
  if (at !== undefined && bt !== undefined) {
    result = at - bt;
  } else if (typeof a === 'number' && typeof b === 'number') {
    result = a - b;
  } else if (typeof a === 'boolean' && typeof b === 'boolean') {
    result = Number(a) - Number(b);
  } else {
    result = String(a).localeCompare(String(b));
  }
  return direction === 'asc' ? result : -result;
}

function toTimestamp(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}