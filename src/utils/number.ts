/**
 * Number helpers: clamping, rounding, ratios and validation.
 * `randomInt` is shared with `./random`.
 */

import { randomInt } from './random';

export { randomInt };

/**
 * Clamp a value into [min, max]. Swaps bounds if min > max.
 * @example clamp(15, 0, 10) // 10
 */
export function clamp(value: number, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Check whether a value lies within [min, max]. Bounds are inclusive by default.
 * @example isBetween(5, 0, 10) // true
 */
export function isBetween(value: number, min: number, max: number, inclusive = true): boolean {
  return inclusive ? value >= min && value <= max : value > min && value < max;
}

/**
 * Round to a number of decimal places.
 * @example roundTo(3.14159, 2) // 3.14
 */
export function roundTo(value: number, precision = 0): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

/**
 * Floor to a number of decimal places.
 * @example floorTo(3.999, 2) // 3.99
 */
export function floorTo(value: number, precision = 0): number {
  const factor = Math.pow(10, precision);
  return Math.floor(value * factor) / factor;
}

/**
 * Average of a set of numbers. Empty input averages to 0.
 * @example avg([2, 4, 6]) // 4
 */
export function avg(numbers: readonly number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((acc, n) => acc + n, 0) / numbers.length;
}

/**
 * Compute `part / total` as a percentage. Returns 0 when total is 0.
 * @example toPercentage(30, 100) // 30
 */
export function toPercentage(part: number, total: number, precision = 0): number {
  if (total === 0) return 0;
  return roundTo((part / total) * 100, precision);
}

/**
 * Check whether a value is a finite number or a numeric string.
 * @example isNumeric('42.5') // true
 */
export function isNumeric(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed !== '' && Number.isFinite(Number(trimmed));
}

/**
 * Format a number with a fixed number of decimal places.
 * @example formatDecimal(3.14159, 2) // '3.14'
 */
export function formatDecimal(value: number, digits = 2, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}