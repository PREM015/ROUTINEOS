'use client';

/**
 * Header Strip - the 7-Day Mini Strip, plus the read-only day-type pill.
 *
 * Dashboard-only by decision: both are tied to "what day am I looking at" and
 * "what kind of day is it", which are concepts that only mean something on pages
 * showing day-scoped data. A day-type pill on `/profile` has nothing to resolve.
 *
 * ## B7: dots get colour only
 *
 * "Small enough that heavy effects would be noise — they get colour only, no
 * glow, no gradient." So each day is a flat 7px dot in its score's heat level.
 * The one exception is today, which gets the thin breathing ring marking it as
 * "now" — opacity only, because a scaling or glowing marker on a row of 7px dots
 * would be shouting, which is the opposite of the brief's intent.
 *
 * ## Read-only
 *
 * Tapping a day opens a popover with that day's score. It cannot edit anything:
 * logging lives on `/today`, and a header affordance that writes would be a
 * second surface for the same action.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { useDashboardOverview } from '@/components/dashboard/useDashboardOverview';
import { HEAT_RAMP, heatLevel } from '@/components/dashboard-ui/tokens';
import { WEEKDAY_LABELS } from '@/constants/dashboard';
import { cn } from '@/lib/utils';

function weekdayShort(date: string): string {
  const dow = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return (WEEKDAY_LABELS[dow] ?? '').slice(0, 1);
}

export function HeaderStrip({ dayTypeName }: { dayTypeName?: string | null }) {
  const { data, loading } = useDashboardOverview();
  const [open, setOpen] = useState<string | null>(null);

  const week = useMemo(() => (data ? data.days.slice(-7) : []), [data]);
  const selected = useMemo(
    () => week.find((d) => d.date === open) ?? null,
    [week, open]
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {/*
          The mini strip. Seven 7px dots, Monday-first, each coloured by its score
          level. `relative` because the breathing ring on today is a pseudo-element
          around a dot that has no room of its own.
        */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Last 7 days">
          {loading
            ? Array.from({ length: 7 }).map((_, i) => (
                <span
                  key={i}
                  className="h-[7px] w-[7px] animate-pulse rounded-full bg-muted motion-reduce:animate-none"
                />
              ))
            : week.map((day) => {
                const level = heatLevel(day.totalScore);
                const isToday = day.date === data?.today;
                const isOpen = day.date === open;
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setOpen(isOpen ? null : day.date)}
                    aria-label={`${day.date}: ${
                      day.totalScore === null ? 'no score' : `${Math.round(day.totalScore)} out of 100`
                    }`}
                    aria-expanded={isOpen}
                    className={cn(
                      'relative flex h-4 w-4 items-center justify-center rounded-full transition-transform motion-reduce:transition-none',
                      isOpen && 'scale-110'
                    )}
                  >
                    {/* The breathing ring on today. Opacity only, 3s. */}
                    {isToday && (
                      <span
                        aria-hidden="true"
                        className="breathe-ring absolute inset-0 rounded-full border border-primary/70"
                      />
                    )}
                    <span
                      className={cn(
                        'h-[7px] w-[7px] rounded-full',
                        level === 0 ? 'bg-border' : HEAT_RAMP[level]
                      )}
                    />
                    <span className="sr-only">{weekdayShort(day.date)}</span>
                  </button>
                );
              })}
        </div>

        {/* The popover. Read-only by design: it shows the day's score and links
            to /today, and cannot log anything. */}
        {selected && (
          <span className="flex items-center gap-2 rounded-full bg-muted/70 px-2.5 py-1 text-[11px]">
            <span className="font-medium text-foreground">{selected.date.slice(5)}</span>
            <span className="tabular-nums text-muted-foreground">
              {selected.totalScore === null ? 'no score' : Math.round(selected.totalScore)}
            </span>
            <Link
              href="/today"
              className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
            >
              Today
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </span>
        )}
      </div>

      {/* The read-only day-type pill. One editable surface for day type in the
          whole app, and it is /today. Clicking navigates rather than opening a
          picker. */}
      <Link
        href="/today"
        className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/50 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm transition-colors hover:border-primary/40"
      >
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        {dayTypeName ?? 'Day type'}
        <span className="text-muted-foreground">&middot; change on Today</span>
      </Link>
    </div>
  );
}
