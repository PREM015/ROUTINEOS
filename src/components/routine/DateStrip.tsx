'use client';

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui';
import { getWeekDays, calendarDaysBetween } from '@/lib/dates';
import { cn } from '@/lib/utils';

/**
 * Date navigation: prev / next / Today, plus a compact week row.
 *
 * The selected date lives in the URL (`?date=`), so the page is deep-linkable
 * and survives a reload. That is not a nicety: the routine page is the one place
 * a user sends someone a link to a specific schedule, and an in-memory
 * `useState` date meant every such link silently opened on today.
 *
 * Week starts on Monday to match `getWeekRange`'s default elsewhere in the app.
 */
export function DateStrip({
  date,
  today,
  onSelect,
  isLoading,
}: {
  date: string;
  today: string | null;
  onSelect: (date: string) => void;
  isLoading: boolean;
}) {
  const week = useMemo(() => getWeekDays(date, 1), [date]);
  const isToday = date === today;

  const shift = (days: number) => {
    const base = new Date(`${date}T00:00:00.000Z`);
    base.setUTCDate(base.getUTCDate() + days);
    onSelect(base.toISOString().slice(0, 10));
  };

  const dayOffset = today ? calendarDaysBetween(date, today) : 0;
  const relative =
    dayOffset === 0
      ? 'Today'
      : dayOffset === -1
        ? 'Yesterday'
        : dayOffset === 1
          ? 'Tomorrow'
          : dayOffset < 0
            ? `${Math.abs(dayOffset)} days ago`
            : `in ${dayOffset} days`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => shift(-1)}
          aria-label="Previous day"
          className="h-9 w-9 p-0"
        >
          <ChevronLeft size={16} />
        </Button>

        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-medium text-foreground">
            {formatLong(date)}
          </p>
          <p className="text-xs text-muted-foreground">{relative}</p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => shift(1)}
          aria-label="Next day"
          className="h-9 w-9 p-0"
        >
          <ChevronRight size={16} />
        </Button>

        {!isToday && today && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelect(today)}
            className="shrink-0"
          >
            <CalendarDays size={13} />
            Today
          </Button>
        )}
      </div>

      <div
        role="group"
        aria-label="Days in this week"
        className="grid grid-cols-7 gap-1"
      >
        {week.map((day) => {
          const active = day === date;
          const isCurrentDay = today !== null && day === today;
          const weekday = weekdayLabel(day);
          const dayNumber = Number(day.slice(8, 10));

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              aria-current={active ? 'date' : undefined}
              aria-label={`${weekday} ${dayNumber}`}
              className={cn(
                'flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <span className="text-[10px] uppercase tracking-wide">{weekday}</span>
              <span
                className={cn(
                  'font-mono text-sm tabular-nums',
                  isCurrentDay && !active && 'font-semibold text-foreground',
                  isCurrentDay && active && 'font-semibold'
                )}
              >
                {dayNumber}
              </span>
              {/* A dot, not a colour change: a filled pill for every day in the
                  week made the week look like seven selections. */}
              {isCurrentDay && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-1 w-1 rounded-full',
                    active ? 'bg-primary' : 'bg-muted-foreground'
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {isLoading && <span className="sr-only">Loading this day…</span>}
    </div>
  );
}

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function weekdayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  // `getUTCDay()`: 0 is Sunday. The label list starts on Monday, so index from
  // there rather than assuming the array is Sunday-first.
  return WEEKDAY_SHORT[(parsed.getUTCDay() + 6) % 7] ?? 'Mon';
}

function formatLong(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}