/**
 * Array utilities for RoutineOS.
 * Pure functions operating on readonly inputs; none mutate the source array.
 */

import { shuffle } from './random';

export { shuffle };

/**
 * Split an array into chunks of the given size.
 * @example chunk([1, 2, 3, 4, 5], 2) // [[1, 2], [3, 4], [5]]
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isFinite(size) || size <= 0) return [];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

/**
 * Group items into a Record keyed by the result of `getKey`.
 * @example groupBy([1, 2, 3, 4], (n) => (n % 2 === 0 ? 'even' : 'odd'))
 */
export function groupBy<T, K extends PropertyKey>(
  items: readonly T[],
  getKey: (item: T) => K
): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of items) {
    const key = getKey(item);
    const bucket = result[key];
    if (bucket) {
      bucket.push(item);
    } else {
      result[key] = [item];
    }
  }
  return result;
}

/**
 * Remove duplicate values (reference equality) preserving order.
 * @example unique([1, 2, 2, 3]) // [1, 2, 3]
 */
export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/**
 * Values present in both arrays (first array order preserved).
 * @example intersection([1, 2, 3], [2, 3, 4]) // [2, 3]
 */
export function intersection<T>(a: readonly T[], b: readonly T[]): T[] {
  const setB = new Set(b);
  return a.filter((item) => setB.has(item));
}

/**
 * Values in `a` that are not in `b` (first array order preserved).
 * @example difference([1, 2, 3], [2]) // [1, 3]
 */
export function difference<T>(a: readonly T[], b: readonly T[]): T[] {
  const setB = new Set(b);
  return a.filter((item) => !setB.has(item));
}

/**
 * Sum of numeric values. Empty arrays sum to 0.
 * @example sum([1, 2, 3]) // 6
 */
export function sum(numbers: readonly number[]): number {
  return numbers.reduce((acc, n) => acc + n, 0);
}

/**
 * Flatten arbitrarily nested arrays into a single flat array.
 * @example flatten([1, [2, [3, [4]]]]) // [1, 2, 3, 4]
 */
export function flatten<T>(items: readonly unknown[]): T[] {
  const result: T[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else {
      result.push(value as T);
    }
  };
  for (const item of items) walk(item);
  return result;
}

/**
 * Combine multiple arrays element-wise into tuples. Length equals the shortest input.
 * @example zip([1, 2], ['a', 'b', 'c']) // [[1, 'a'], [2, 'b']]
 */
export function zip<T extends readonly unknown[][]>(
  ...arrays: T
): Array<{
  [K in keyof T]: T[K] extends readonly (infer U)[] ? U : never;
}> {
  const length = Math.min(0, ...arrays.map((a) => a.length));
  const result: Array<{
    [K in keyof T]: T[K] extends readonly (infer U)[] ? U : never;
  }> = [];
  for (let i = 0; i < length; i++) {
    const row = arrays.map((a) => a[i]) as unknown as {
      [K in keyof T]: T[K] extends readonly (infer U)[] ? U : never;
    };
    result.push(row);
  }
  return result;
}

/**
 * Return the last `n` items, or the whole array if `n` exceeds its length.
 * @example takeRight([1, 2, 3, 4], 2) // [3, 4]
 */
export function takeRight<T>(items: readonly T[], n: number): T[] {
  const count = Math.max(0, n);
  if (count === 0) return [];
  return items.slice(Math.max(0, items.length - count));
}

/**
 * Split items into a tuple of [matching, non-matching] arrays.
 * @example partition([1, 2, 3, 4], (n) => n % 2 === 0) // [[2, 4], [1, 3]]
 */
export function partition<T>(
  items: readonly T[],
  predicate: (item: T) => boolean
): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];
  for (const item of items) {
    (predicate(item) ? pass : fail).push(item);
  }
  return [pass, fail];
}

/**
 * Remove falsy values (`false`, `0`, `''`, `null`, `undefined`, `NaN`).
 * @example compact([0, 1, null, 2, false, '']) // [1, 2]
 */
export function compact<T>(items: readonly (T | null | undefined | false | 0 | '')[]): T[] {
  return items.filter((item): item is T => Boolean(item));
}

/**
 * Count occurrences grouped by key.
 * @example countBy(['a', 'b', 'a'], (s) => s) // { a: 2, b: 1 }
 */
export function countBy<T, K extends PropertyKey>(
  items: readonly T[],
  getKey: (item: T) => K
): Record<K, number> {
  const counts = {} as Record<K, number>;
  for (const item of items) {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}