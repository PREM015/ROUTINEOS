"use client";

/**
 * TimePicker — controlled time field accepting 24-hour `HH:mm` strings.
 * Backed by a native `<input type="time">` by default, or — when
 * `useSelects` is set — by independent hour/minute dropdowns.
 *
 * Usage:
 *   <TimePicker value="07:30" onChange={setTime} />
 *   <TimePicker value={time} onChange={setTime} useSelects hourRange={[6, 22]} />
 */
import * as React from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const HOURS: readonly string[] = Array.from({ length: 24 }, (_, h) =>
  String(h).padStart(2, '0'),
);
const MINUTES: readonly string[] = Array.from({ length: 60 }, (_, m) =>
  String(m).padStart(2, '0'),
);

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface TimePickerProps {
  /** Current time as a 24-hour `HH:mm` string. */
  value: string;
  onChange: (time: string) => void;
  label?: string;
  disabled?: boolean;
  /** Render hour/minute `<select>` dropdowns instead of the native input. */
  useSelects?: boolean;
  /** Restrict selectable hours (inclusive, 0–23); ignored for the native input. */
  hourRange?: [number, number];
  className?: string;
}

export function TimePicker({
  value,
  onChange,
  label,
  disabled = false,
  useSelects = false,
  hourRange,
  className,
}: TimePickerProps) {
  const isValid = TIME_PATTERN.test(value);
  const [hour = '00', minute = '00'] = value.split(':');

  const setTime = (nextHour: string, nextMinute: string) => {
    onChange(`${nextHour}:${nextMinute}`);
  };

  const hours = React.useMemo(() => {
    const [min = 0, max = 23] = hourRange ?? [0, 23];
    const clampedMin = Math.max(0, Math.min(min, 23));
    const clampedMax = Math.min(23, Math.max(max, clampedMin));
    return HOURS.slice(clampedMin, clampedMax + 1);
  }, [hourRange]);

  const selectClass = cn(
    'rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50',
  );

  return (
    <div className={cn('w-full space-y-1.5', className)}>
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
      {useSelects ? (
        <div className="flex items-center gap-2">
          <select
            value={isValid ? hour : ''}
            disabled={disabled}
            onChange={(e) => setTime(e.target.value, isValid ? minute : '00')}
            aria-label="Hour"
            className={selectClass}
          >
            {!isValid && <option value="" disabled>—</option>}
            {hours.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-500">:</span>
          <select
            value={isValid ? minute : ''}
            disabled={disabled}
            onChange={(e) => setTime(isValid ? hour : '00', e.target.value)}
            aria-label="Minute"
            className={selectClass}
          >
            {!isValid && <option value="" disabled>—</option>}
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="relative">
          <Clock className="pointer-events-none absolute inset-y-0 left-3 flex h-full w-4 items-center text-gray-400" />
          <input
            type="time"
            value={isValid ? value : ''}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label || 'Time'}
            className="block w-full rounded-md border border-gray-300 px-9 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      )}
    </div>
  );
}