/**
 * String helpers: casing, slugging, truncation, validation and masking.
 * Core text helpers are shared with `./format`.
 */

const TITLE_CASE_MINORS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'in',
  'nor',
  'of',
  'on',
  'or',
  'per',
  'the',
  'to',
  'up',
  'via',
  'vs',
]);

/**
 * Capitalize the first letter, lowercasing the rest.
 * @example capitalize('hello') // 'Hello'
 */
export function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Title-case a string, keeping short connecting words (and, of, the, …) lowercase.
 * @example titleCase('the quick brown fox') // 'The Quick Brown Fox'
 */
export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/(\s+)/)
    .map((word, index) => {
      if (index > 0 && TITLE_CASE_MINORS.has(word.toLowerCase())) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');
}

/**
 * Convert text into a URL-friendly slug.
 * @example slugify('Habit + Tracker!') // 'habit-tracker'
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Truncate text to a maximum length, appending a suffix.
 * @example truncate('Robin Hood', 7) // 'Robin H…'
 */
export function truncate(text: string, maxLength: number, suffix = '…'): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= 0) return suffix;
  return `${text.slice(0, maxLength - suffix.length)}${suffix}`;
}

/**
 * Pad a string on the left to a minimum length.
 * @example padStart('5', 3, '0') // '005'
 */
export function padStart(text: string, length: number, fill = ' '): string {
  return text.padStart(Math.max(0, length), fill);
}

/**
 * Pad a string on the right to a minimum length.
 * @example padEnd('1.5', 5, '0') // '1.500'
 */
export function padEnd(text: string, length: number, fill = ' '): string {
  return text.padEnd(Math.max(0, length), fill);
}

/**
 * Escape a string for safe use inside a RegExp.
 * @example escapeRegExp('a+b') // 'a\\+b'
 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip diacritics/accents from a string.
 * @example removeAccents('café') // 'cafe'
 */
export function removeAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Convert camelCase to snake_case.
 * @example camelToSnake('myHabitScore') // 'my_habit_score'
 */
export function camelToSnake(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Convert snake_case to camelCase.
 * @example snakeToCamel('my_habit_score') // 'myHabitScore'
 */
export function snakeToCamel(text: string): string {
  return text.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

/**
 * Convert kebab-case to camelCase.
 * @example kebabToCamel('my-habit-score') // 'myHabitScore'
 */
export function kebabToCamel(text: string): string {
  return text.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

/**
 * Simple email format check.
 * @example isEmail('user@example.com') // true
 */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Check whether a string is a valid http(s) URL.
 * @example isUrl('https://example.com') // true
 */
export function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check whether a string is a valid UUID (any version).
 * @example isValidUuid('1deb3f2c-...-...') // true
 */
export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

/**
 * Mask the middle of a string, keeping the first/last visible characters.
 * @example maskString('abcdefgh', 2, 2) // 'ab****gh'
 */
export function maskString(
  value: string,
  visibleStart = 4,
  visibleEnd = 4,
  maskChar = '*'
): string {
  if (value.length <= visibleStart + visibleEnd) return value;
  const start = value.slice(0, visibleStart);
  const end = value.slice(-visibleEnd);
  const masked = Math.max(0, value.length - visibleStart - visibleEnd);
  return `${start}${maskChar.repeat(masked)}${end}`;
}

/**
 * Extract all numbers (including decimals and negatives) from a string.
 * @example extractNumbers('score 42 and -3.5') // [42, -3.5]
 */
export function extractNumbers(value: string): number[] {
  const matches = value.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map(Number).filter((n) => !Number.isNaN(n));
}

/**
 * Case-insensitive substring check.
 * @example containsIgnoreCase('Quick Brown Fox', 'brown') // true
 */
export function containsIgnoreCase(text: string, search: string): boolean {
  return text.toLowerCase().includes(search.toLowerCase());
}