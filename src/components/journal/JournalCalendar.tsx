"use client";

/**
 * JournalCalendar — a month heatmap of journal activity. Each day is colored by
 * the mood recorded that day (1 = red … 5 = green) and clicking a day reports
 * its date (YYYY-MM-DD) via `onSelectDate`.
 *
 * Usage:
 *   <JournalCalendar entries={entries} onSelectDate={(date) => open(date)} />
 *   <JournalCalendar moodByDate={{ '2026-09-17': 4 }} onSelectDate={open} />
 */
import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOOD_COLORS } from './JournalEntry';

const WEEKDAYS: readonly string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface JournalCalendarEntry {
  date: string; // YYYY-MM-DD
  mood: number | null;
}

export interface JournalCalendarProps {
  entries?: JournalCalendarEntry[];
  /** Direct date → mood map; used when `entries` is not provided. */
  moodByDate?: Record<string, number | null>;
  onSelectDate: (date: string) => void;
  /** Initial month in YYYY-MM form; defaults to the current month. */
  initialMonth?: string;
  className?: string;
}

function parseMonth(value?: string): Date {
  if (value) {
    const [year, month] = value.split('-').map(Number);
    if (year !== undefined && month !== undefined && month >= 1 && month <= 12) {
      return new Date(year, month - 1, 1);
    }
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface CalendarCell {
  date: string | null;
  day: number;
  outOfMonth: boolean;
}

export default function JournalCalendar({
  entries,
  moodByDate,
  onSelectDate,
  initialMonth,
  className,
}: JournalCalendarProps) {
  const [month, setMonth] = React.useState(() => parseMonth(initialMonth));

  const moodMap = React.useMemo(() => {
    if (moodByDate) return moodByDate;
    const map: Record<string, number | null> = {};
    for (const entry of entries ?? []) {
      if (entry.date) map[entry.date] = entry.mood;
    }
    return map;
  }, [entries, moodByDate]);

  const cells = React.useMemo((): CalendarCell[] => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstWeekday = new Date(year, monthIndex, 1).getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cellsOfMonth: CalendarCell[] = [];

    for (let i = 0; i < firstWeekday; i += 1) {
      cellsOfMonth.push({ date: null, day: 0, outOfMonth: true });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cellsOfMonth.push({ date: toDateString(year, monthIndex, day), day, outOfMonth: false });
    }
    return cellsOfMonth;
  }, [month]);

  const todayString = new Date().toISOString().slice(0, 10);

  const goToMonth = (offset: number) => {
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const monthLabel = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            aria-label="Previous month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => goToMonth(1)}
            aria-label="Next month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Journal activity calendar">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="pb-1 text-center text-xs font-medium uppercase tracking-wide text-gray-500"
          >
            {weekday}
          </div>
        ))}
        {cells.map((cell, index) => {
          if (!cell.date) {
            return <div key={`blank-${index}`} aria-hidden="true" className="h-10" />;
          }
          const mood = moodMap[cell.date];
          const color = mood !== null && mood !== undefined ? MOOD_COLORS[mood] ?? '#6b7280' : null;
          const isToday = cell.date === todayString;
          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onSelectDate(cell.date ?? '')}
              title={
                mood !== null && mood !== undefined
                  ? `${cell.date} — mood ${mood}/5`
                  : `${cell.date} — no entry`
              }
              aria-label={`${cell.date}, ${mood !== null && mood !== undefined ? `mood ${mood} of 5` : 'no entry'}`}
              aria-pressed={isToday}
              className={cn(
                'flex h-10 items-center justify-center rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                color
                  ? 'text-white shadow-sm hover:brightness-95'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                isToday && 'ring-2 ring-blue-600 ring-offset-1',
              )}
              style={color ? { backgroundColor: color } : undefined}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span>Legend:</span>
        {Object.entries(MOOD_COLORS).map(([value, hex]) => (
          <span key={value} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: hex }}
              aria-hidden="true"
            />
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}