/**
 * Random value generators. `randomInt` is the shared single source of truth
 * for integer randomness; other utils defer to it.
 */

const DEFAULT_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Random integer in [min, max] (both inclusive). Bounds may be given in any order.
 * @example randomInt(1, 6) // a dice roll
 */
export function randomInt(min = 0, max = 100): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/**
 * Random float in [min, max) — includes min, excludes max.
 * @example randomFloat(0, 1) // 0..0.999...
 */
export function randomFloat(min = 0, max = 1): number {
  return Math.random() * (max - min) + min;
}

/**
 * Pick a random element. Returns undefined for an empty array.
 * @example randomElement(['a', 'b', 'c']) // 'b' (or another)
 */
export function randomElement<T>(items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[randomInt(0, items.length - 1)];
}

/**
 * Pick `n` random elements without replacement (at most the array length).
 * @example randomElements([1, 2, 3, 4], 2) // e.g. [3, 1]
 */
export function randomElements<T>(items: readonly T[], n: number): T[] {
  const count = Math.max(0, Math.min(Math.floor(n), items.length));
  return shuffle(items).slice(0, count);
}

/**
 * Generate a random string of the given length from a charset (alphanumeric by default).
 * @example randomString(8) // 'a7Kp2Qx' (e.g.)
 */
export function randomString(length = 16, charset = DEFAULT_CHARSET): string {
  const count = Math.max(0, Math.floor(length));
  if (count === 0 || charset.length === 0) return '';
  let result = '';
  for (let i = 0; i < count; i++) {
    result += charset.charAt(randomInt(0, charset.length - 1));
  }
  return result;
}

/**
 * Generate a random UUID v4, preferring `crypto.randomUUID`.
 * @example uuid() // '1deb3f2c-...'
 */
export function uuid(): string {
  const webcrypto = globalThis.crypto;
  if (webcrypto && typeof webcrypto.randomUUID === 'function') {
    return webcrypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (webcrypto && typeof webcrypto.getRandomValues === 'function') {
    webcrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = randomInt(0, 255);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

/**
 * Random date (timestamp) between two dates, inclusive.
 * @example randomDate('2025-01-01', '2025-12-31')
 */
export function randomDate(
  from: Date | number | string,
  to: Date | number | string
): Date {
  const start = from instanceof Date ? from.getTime() : new Date(from).getTime();
  const end = to instanceof Date ? to.getTime() : new Date(to).getTime();
  return new Date(randomInt(Math.min(start, end), Math.max(start, end)));
}

/**
 * Randomly shuffle a copy of an array (Fisher–Yates).
 * @example shuffle([1, 2, 3, 4, 5]) // a shuffled copy
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    const a = result[i];
    const b = result[j];
    if (a === undefined || b === undefined) continue;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/**
 * Generate a random hex color.
 * @example randomColor() // '#c4a9ff' (e.g.)
 */
export function randomColor(): string {
  return `#${Array.from({ length: 3 }, () =>
    randomInt(0, 255).toString(16).padStart(2, '0')
  ).join('')}`;
}