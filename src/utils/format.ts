/**
 * Formatting helpers for durations, numbers, currency and text.
 * Text helpers (truncate, slugify, titleCase) are shared with `./string`.
 */

import { capitalize, slugify, titleCase, truncate } from './string';

export { slugify, titleCase, truncate };

/**
 * Format a duration in seconds as a compact string like "2h 15m".
 * @example formatDuration(8100) // '2h 15m'
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0 && secs > 0) parts.push(`${secs}s`);
  return parts.length > 0 ? parts.join(' ') : '0s';
}

/**
 * Format a count with thousands separators.
 * @example formatCount(3214) // '3,214'
 */
export function formatCount(value: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Format an amount as localized currency.
 * @example formatMoney(19.99) // '$19.99'
 */
export function formatMoney(
  amount: number,
  currency = 'USD',
  locale = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Capitalize the first letter of every word.
 * @example capitalizeWords('hello world') // 'Hello World'
 */
export function capitalizeWords(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => capitalize(word))
    .join(' ');
}

/**
 * Format a number in compact notation.
 * @example formatCompactNumber(1234) // '1.2K'
 */
export function formatCompactNumber(value: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}