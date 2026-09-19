/**
 * Object helpers: deep cloning/merging, path access and transforms.
 * Functions never mutate their inputs; they return new objects.
 */

/**
 * Check whether a value is a plain object (object or null prototype, not an array).
 * @example isPlainObject({ a: 1 }) // true
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-clone a value using `structuredClone` (JSON fallback when unavailable).
 * Note: structuredClone only supports cloneable values (no functions/DOM nodes).
 * @example const copy = deepClone(original)
 */
export function deepClone<T>(value: T): T {
  const cloneFn = (
    globalThis as {
      structuredClone?: (input: unknown) => unknown;
    }
  ).structuredClone;
  if (typeof cloneFn === 'function') return cloneFn(value) as T;
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Deep-merge plain objects (later objects win; arrays and non-plain values replace).
 * @example deepMerge({ a: { b: 1 } }, { a: { c: 2 } }) // { a: { b: 1, c: 2 } }
 */
export function deepMerge<T extends Record<string, unknown>>(
  ...objects: Partial<T>[]
): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const source of objects) {
    if (!isPlainObject(source)) continue;
    for (const key of Object.keys(source)) {
      const value = (source as Record<string, unknown>)[key];
      if (isPlainObject(value)) {
        const existing = result[key];
        result[key] = isPlainObject(existing)
          ? deepMerge(existing, value)
          : { ...value };
      } else {
        result[key] = value;
      }
    }
  }
  return result as Partial<T>;
}

/**
 * Pick a subset of keys from an object.
 * @example pick({ a: 1, b: 2, c: 3 }, ['a', 'c']) // { a: 1, c: 3 }
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: readonly K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

/**
 * Omit a set of keys from an object.
 * @example omit({ a: 1, b: 2, c: 3 }, ['b']) // { a: 1, c: 3 }
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: readonly K[]
): Omit<T, K> {
  const excluded = new Set(keys);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (!excluded.has(key as K)) result[key] = obj[key];
  }
  return result as Omit<T, K>;
}

/**
 * Read a value by dot path. Supports array indices as `a[0]` or `a.0`.
 * Returns undefined when the path does not exist.
 * @example getPath({ a: { b: [1, 2] } }, 'a.b.1') // 2
 */
export function getPath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const part of parsePath(path)) {
    if (isPlainObject(current) || Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Set a value at a dot path immutably, cloning each level along the way.
 * @example setPath({ a: { b: 1 } }, 'a.b', 2) // { a: { b: 2 } }
 */
export function setPath<T extends Record<string, unknown>>(
  obj: T,
  path: string,
  value: unknown
): T {
  const parts = parsePath(path);
  const root: Record<string, unknown> = { ...obj };
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    if (key === undefined) continue;
    const isLast = i === parts.length - 1;
    if (isLast) {
      current[key] = value;
      break;
    }
    const next = current[key];
    const nextKey = parts[i + 1];
    const nextIsArray = nextKey !== undefined && /^\d+$/.test(nextKey);
    if (nextIsArray) {
      current[key] = Array.isArray(next) ? [...next] : [];
    } else {
      current[key] = isPlainObject(next) ? { ...next } : {};
    }
    current = current[key] as Record<string, unknown>;
  }
  return root as T;
}

/**
 * Remap keys of an object with an identity function.
 * @example mapKeys({ id: 1 }, (_, k) => k.toUpperCase()) // { ID: 1 }
 */
export function mapKeys<T>(
  obj: Record<string, T>,
  fn: (value: T, key: string) => string
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const key of Object.keys(obj)) {
    const mapped = fn(obj[key], key);
    result[mapped] = obj[key];
  }
  return result;
}

/**
 * Transform the values of an object with an identity function.
 * @example mapValues({ a: 1, b: 2 }, (n) => n * 2) // { a: 2, b: 4 }
 */
export function mapValues<T, U>(
  obj: Record<string, T>,
  fn: (value: T, key: string) => U
): Record<string, U> {
  const result: Record<string, U> = {};
  for (const key of Object.keys(obj)) {
    result[key] = fn(obj[key], key);
  }
  return result;
}

/**
 * Check whether a value is a plain object with no own enumerable keys.
 * @example isEmptyObject({}) // true
 */
export function isEmptyObject(value: unknown): boolean {
  return isPlainObject(value) && Object.keys(value).length === 0;
}

function parsePath(path: string): string[] {
  const parts: string[] = [];
  const normalized = path.replace(/\[(.*?)\]/g, '.$1');
  for (const segment of normalized.split('.')) {
    const key = segment.replace(/^['"]|['"]$/g, '').trim();
    if (key) parts.push(key);
  }
  return parts;
}