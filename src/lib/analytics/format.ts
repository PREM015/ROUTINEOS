/**
 * Formatting for metrics that can legitimately be **absent**.
 *
 * The analytics surfaces made `number` out of `number | null` for years, which
 * type-checked and then rendered `NaN%` whenever a period had nothing due in it.
 * These helpers make the two cases impossible to confuse again:
 *
 *   `percentText(null)` -> `'—'`      "we have no measurement"
 *   `percentText(0)`    -> `'0%'`     "we measured, and it was zero"
 *
 * The em dash is the app's existing "no value" glyph (see the `/today` score
 * fallback), so it reads consistently across surfaces.
 */

/** `'42%'` or `'—'` when there is no value. */
export function percentText(
  value: number | null | undefined,
  decimals = 0
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(decimals)}%`;
}

/** `42` or `null`, for a numeric prop that must not silently become `0`. */
export function orNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return value;
}

/**
 * `0` for a chart geometry, `null` kept as `null` for a data list.
 *
 * Chart libraries need a number to draw a bar; a table does not. Passing `0` to a
 * bar chart for a habit that was never due draws a "you did nothing" bar for a
 * habit that was never on the list, which is the whole error this module exists
 * to stop.
 */
export function chartValue(value: number | null | undefined): number | null {
  return orNull(value);
}

/** Clamp for ring and bar widths, with `null` meaning "do not draw". */
export function widthPercent(value: number | null | undefined): string | null {
  const resolved = orNull(value);
  if (resolved === null) return null;
  return `${Math.min(Math.max(resolved, 0), 100)}%`;
}

/** A signed delta with an explicit sign, or `null` when incomparable. */
export function deltaText(delta: number | null | undefined): string | null {
  const resolved = orNull(delta);
  if (resolved === null) return null;
  const rounded = Math.round(resolved * 10) / 10;
  if (rounded === 0) return 'no change';
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}