"use client";

/**
 * DateRangePicker — popover calendar (react-day-picker, `range` mode) with
 * two read-only from/to inputs summarizing the current selection.
 *
 * Usage:
 *   <DateRangePicker value={range} onChange={setRange} />
 */
import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { Calendar } from './Calendar';

export interface DateRangeValue {
  from: Date | undefined;
  to?: Date | undefined;
}

export interface DateRangePickerProps {
  /** Currently selected range (or null for no selection). */
  value: DateRangeValue | null;
  onChange: (range: DateRangeValue | null) => void;
  /** Placeholder shown when no range is selected. */
  placeholder?: string;
  /** Disable individual days inside the calendar. */
  disabled?: (date: Date) => boolean;
  className?: string;
}

function formatDay(date: Date | undefined): string {
  return date ? format(date, 'MMM d, yyyy') : '';
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Select a date range',
  disabled,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const hasRange = Boolean(value?.from);
  const display = hasRange
    ? `${formatDay(value?.from) || '…'} → ${formatDay(value?.to) || '…'}`
    : placeholder;

  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
              !hasRange && 'text-gray-500',
            )}
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <CalendarIcon className="h-4 w-4" />
            <span>{display}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">From</span>
              <input
                type="text"
                readOnly
                value={formatDay(value?.from)}
                placeholder="Start date"
                className="block w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">To</span>
              <input
                type="text"
                readOnly
                value={formatDay(value?.to)}
                placeholder="End date"
                className="block w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700"
              />
            </label>
          </div>
          <Calendar
            mode="range"
            selected={value ?? undefined}
            onSelect={(range) => onChange(range ?? null)}
            numberOfMonths={2}
            disabled={disabled}
          />
        </PopoverContent>
      </Popover>
      {hasRange && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-sm text-blue-600 hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}