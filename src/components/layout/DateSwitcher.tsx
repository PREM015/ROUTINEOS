'use client';

/**
 * Date Switcher — the spec's "one control that replaces needing a separate
 * calendar navigation section".
 *
 * "A pill showing 'Today, Mon 28' with ‹ › arrows and a calendar-icon button
 * that opens a mini month-picker popover. This single control replaces needing a
 * separate 'calendar navigation' section — it's always in view, always one tap
 * from any day."
 *
 * Two behaviours worth stating:
 *
 *  - **The next arrow is bounded by today.** Arrowing into the future is what
 *    the dashboard's `PeriodControl` was letting you do, producing empty cards
 *    for days that have not happened. The future is not reviewable, so the
 *    control does not offer it.
 *  - **"Today" is a reset, not a label.** Once you have stepped away from today
 *    the pill changes to the real date, so it never claims to be showing today
 *    when it is not.
 */

import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { getTodayString, shiftCalendarDay } from '@/lib/dates';
import { cn } from '@/lib/utils';

function formatPill(date: string, isToday: boolean): string {
  if (isToday) return 'Today';
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  const month = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${weekday}, ${day} ${month}`;
}

export function DateSwitcher() {
  const { selectedDate, setSelectedDate } = useApp();
  const { timezone } = useUserTimezone();
  const [open, setOpen] = useState(false);

  const today = getTodayString(timezone);
  const active = selectedDate || today;
  const isToday = active === today;

  /** The last selectable day is today — the future is not reviewable. */
  const canGoNext = !isToday;

  const month = useMemo(() => {
    const d = new Date(`${active}T00:00:00Z`);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      firstWeekday: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).getUTCDay(),
      daysInMonth: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(),
    };
  }, [active]);

  return (
    <div className="relative">
      <div className="flex items-center gap-0.5 rounded-full border border-border bg-card/60 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setSelectedDate(shiftCalendarDay(active, -1))}
          aria-label="Previous day"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-foreground"
        >
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="tabular-nums">
            {formatPill(active, isToday)}
            {!isToday && <span className="ml-1 text-muted-foreground">· {active}</span>}
          </span>
        </button>

        <button
          type="button"
          onClick={() => canGoNext && setSelectedDate(shiftCalendarDay(active, 1))}
          disabled={!canGoNext}
          aria-label="Next day"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent motion-reduce:transition-none"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close date picker"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40"
          />
          <div
            role="dialog"
            aria-label="Pick a date"
            className="absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-2xl border border-border bg-background p-3 shadow-floating"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                {new Date(`${active}T00:00:00Z`).toLocaleDateString('en-GB', {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedDate(today);
                  setOpen(false);
                }}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Today
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: month.firstWeekday }, (_, i) => (
                <span key={`pad-${i}`} />
              ))}
              {Array.from({ length: month.daysInMonth }, (_, i) => {
                const day = i + 1;
                const iso = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isFuture = iso > today;
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={isFuture}
                    onClick={() => {
                      setSelectedDate(iso);
                      setOpen(false);
                    }}
                    className={cn(
                      'rounded-md py-1.5 text-[11px] tabular-nums transition-colors motion-reduce:transition-none',
                      iso === active
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : isFuture
                          ? 'text-muted-foreground/40'
                          : 'text-foreground hover:bg-muted'
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
