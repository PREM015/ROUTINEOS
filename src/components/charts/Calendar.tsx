"use client";
/**
 * CalendarHeatmap — a month-grid heatmap of values keyed by date.
 *
 * Renders one month as a plain CSS grid (no react-day-picker). Values are keyed
 * by `YYYY-MM-DD` strings in `data`; the month defaults to the current month.
 * Cell color intensity is normalized against the highest value in that month.
 * Prefers local-time date strings so keyed dates line up with the grid.
 *
 * Props:
 * - data: map of "YYYY-MM-DD" → number (optional)
 * - month: Date or "YYYY-MM-DD" of the month to render (default: now)
 * - color: color at the maximum value (default blue-500)
 * - emptyColor: color for days without a value (default zinc-900)
 * - onSelectDate: fires with the date key and its value on click (optional)
 * - showHeader: toggle the "month year" title
 */

import { cn } from '@/lib/utils';

export interface CalendarHeatmapProps {
  data?: Record<string, number>;
  month?: Date | string;
  color?: string;
  emptyColor?: string;
  className?: string;
  onSelectDate?: (date: string, value?: number) => void;
  showHeader?: boolean;
  ariaLabel?: string;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

export function CalendarHeatmap({
  data,
  month,
  color = '#3b82f6',
  emptyColor = '#18181b',
  className,
  onSelectDate,
  showHeader = true,
  ariaLabel = 'Calendar heatmap',
}: CalendarHeatmapProps) {
  const values = data ?? {};
  const base =
    typeof month === 'string'
      ? new Date(month.length <= 7 ? `${month}-01T00:00:00` : `${month}T00:00:00`)
      : month instanceof Date
        ? new Date(month)
        : new Date();
  const year = base.getFullYear();
  const monthIndex = base.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingOffset = new Date(year, monthIndex, 1).getDay();
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}-`;

  const monthValues = Object.entries(values)
    .filter(([key]) => key.startsWith(monthPrefix))
    .map(([, value]) => value);
  const maxValue = Math.max(0, ...monthValues);

  const title = base.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const renderDay = (dateKey: string, dayNumber: number) => {
    const value = values[dateKey];
    const intensity = maxValue <= 0 ? 0 : (value ?? 0) / maxValue;
    const background = value === undefined ? emptyColor : mixHex(emptyColor, color, intensity);

    const commonProps = {
      key: dateKey,
      className: cn(
        'flex aspect-square items-center justify-center rounded text-[10px] transition-colors',
        onSelectDate ? 'cursor-pointer hover:ring-1 hover:ring-blue-400' : '',
      ),
      style: { backgroundColor: background },
      title: `${dateKey}: ${value ?? 'no data'}`,
      'aria-label': `${dateKey}: ${value ?? 'no data'}`,
    };

    if (onSelectDate) {
      return (
        <button type="button" {...commonProps} onClick={() => onSelectDate(dateKey, value)}>
          {dayNumber}
        </button>
      );
    }
    return (
      <div {...commonProps}>
        {dayNumber}
      </div>
    );
  };

  return (
    <div className={cn('w-full', className)} role="img" aria-label={ariaLabel}>
      {showHeader && <div className="mb-2 text-sm font-medium text-gray-300">{title}</div>}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-center text-[10px] text-gray-500">
            {label}
          </div>
        ))}
        {Array.from({ length: leadingOffset }, (_, index) => (
          <div key={`empty-${index}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const dayNumber = index + 1;
          const dateKey = `${monthPrefix}${String(dayNumber).padStart(2, '0')}`;
          return renderDay(dateKey, dayNumber);
        })}
      </div>
    </div>
  );
}

export default CalendarHeatmap;