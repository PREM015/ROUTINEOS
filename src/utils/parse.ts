/**
 * Lenient parsing helpers. None of these throw on malformed input.
 */

/**
 * Parse JSON safely. Returns null instead of throwing on invalid input.
 * @example safeJsonParse<{ a: number }>('{"a":1}') // { a: 1 }
 */
export function safeJsonParse<T>(str: string): T | null {
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

/**
 * Run a function and capture errors, returning a fallback instead of throwing.
 * @example tryCatch(() => riskyThing(), null)
 */
export function tryCatch<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Async version of `tryCatch`.
 * @example await tryCatchAsync(() => fetchData(), [])
 */
export async function tryCatchAsync<T>(fn: () => Promise<T> | T, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Parse a value as a number, tolerating commas and surrounding currency symbols.
 * Returns null when it cannot be parsed.
 * @example parseNumber('$1,234.50') // 1234.5
 */
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const stripped = value.replace(/[^0-9+\-.,eE]/g, '').replace(/,/g, '');
  if (!stripped) return null;
  const parsed = Number(stripped);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse a value as a boolean, accepting common truthy/falsy representations.
 * Returns null when unrecognized.
 * @example parseBoolean('yes') // true
 */
export function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  switch (value.trim().toLowerCase()) {
    case 'true':
    case '1':
    case 'yes':
    case 'y':
    case 'on':
      return true;
    case 'false':
    case '0':
    case 'no':
    case 'n':
    case 'off':
      return false;
    default:
      return null;
  }
}

/**
 * Parse numbers from an array, a number, a comma/space separated string,
 * or a JSON array string, dropping any unparsable entries.
 * @example parseIntArray('1,2,3') // [1, 2, 3]
 */
export function parseIntArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => parseNumber(item))
      .filter((item): item is number => item !== null);
  }
  if (typeof value === 'number') return [value];
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  let parsed: unknown = null;
  if (trimmed.startsWith('[')) {
    parsed = safeJsonParse(trimmed);
    if (parsed !== null) {
      if (Array.isArray(parsed)) {
        return parseIntArray(parsed);
      }
      return [];
    }
  }
  return trimmed
    .split(/[,\s]+/)
    .map((part) => parseNumber(part))
    .filter((part): part is number => part !== null);
}