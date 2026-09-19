"use client";
/**
 * HeatMap — a CSS-grid heatmap of colored cells driven by numeric values.
 *
 * Each datum contributes one cell. Cell intensity is normalized against the
 * min/max value across the dataset and interpolated between `minColor` and
 * `maxColor`. Use `columns` to control how many cells appear per row.
 *
 * Props:
 * - data: dataset of row objects (one cell per row)
 * - valueKey: property holding the numeric intensity
 * - labelKey: property used for the hover tooltip (optional)
 * - columns: cells per row (default: one row up to 12, then 12)
 * - minColor: color at the minimum value (default zinc-900)
 * - maxColor: color at the maximum value (default blue-500)
 * - showValues: overlay the raw value inside each cell
 */

import { cn } from '@/lib/utils';

export interface HeatMapProps {
  data: Array<Record<string, unknown>>;
  valueKey: string;
  labelKey?: string;
  columns?: number;
  className?: string;
  minColor?: string;
  maxColor?: string;
  showValues?: boolean;
  ariaLabel?: string;
}

/** Parse a hex color string into RGB channels. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((char) => char + char)
      .join('');
  }
  const parsed = Number.parseInt(clean, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

/** Linearly interpolate between two hex colors at t ∈ [0, 1]. */
function mixHex(colorA: string, colorB: string, t: number): string {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

export function HeatMap({
  data,
  valueKey,
  labelKey,
  columns,
  className,
  minColor = '#18181b',
  maxColor = '#3b82f6',
  showValues = false,
  ariaLabel = 'Heat map',
}: HeatMapProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex h-40 items-center justify-center text-sm text-gray-500"
        role="img"
        aria-label={`${ariaLabel} — no data`}
      >
        No data to display
      </div>
    );
  }

  const values = data.map((row) => {
    const raw = Number(row[valueKey]);
    return Number.isFinite(raw) ? raw : 0;
  });

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const cols = columns ?? Math.min(data.length, 12);

  return (
    <div
      className={cn('w-full', className)}
      role="img"
      aria-label={ariaLabel}
    >
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {data.map((row, index) => {
          const value = values[index] ?? 0;
          const intensity = range === 0 ? (max > 0 ? 1 : 0) : (value - min) / range;
          const background = mixHex(minColor, maxColor, intensity);
          const label =
            labelKey !== undefined && row[labelKey] !== undefined ? String(row[labelKey]) : String(value);
          return (
            <div
              key={index}
              title={label}
              className="flex aspect-square items-center justify-center rounded text-[10px] text-white/90 transition-transform hover:scale-105"
              style={{ backgroundColor: background }}
            >
              {showValues && String(value)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default HeatMap;