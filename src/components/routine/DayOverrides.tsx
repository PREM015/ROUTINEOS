'use client';

import { Repeat2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { partitionOverrides, relativeDayLabel } from '@/lib/routine/day-overrides';
import type { DayOverride } from '@/types/routine';

/**
 * The dates you deliberately made different, nearest first in both directions.
 *
 * ## The problem it solves
 *
 * Setting a date's day type is easy to do and hard to find again. There is no
 * list of it anywhere: the date strip shows 14 days, so an override three weeks
 * out is invisible, and the only way to reach one is to arrow through the strip
 * a day at a time. This is the "the day I marked as a rest day last Tuesday"
 * affordance.
 *
 * ## Titled for what it holds
 *
 * "Day-type overrides", not "Overridden days": `DayModeDialog` writes an
 * exception for `DAY_TYPE` mode only. `REST` and `MINIMUM` set flags on the
 * score row and leave no exception behind, so a rest day is correctly absent
 * here and lives on the day view instead. A looser title would imply otherwise.
 *
 * ## A glance list, not a second timeline
 *
 * Rows are deliberately thin and the type indicator is a 6px dot rather than a
 * pill. The dot carries the preset's own colour, which is the same signal
 * `DayTypeTabs` and the week strip use, so a preset is recognisable by colour
 * across every surface without being re-labelled on each.
 *
 * `tabular-nums` on the date is not decoration here: the rows stack dates, and
 * proportional digits would make a column of them visibly ragged.
 */
export function DayOverrides({
  overrides,
  selectedDate,
  today,
  isLoading,
  onSelectDate,
  bare,
}: {
  overrides: DayOverride[] | null;
  selectedDate: string;
  today: string;
  isLoading: boolean;
  onSelectDate: (date: string) => void;
  /**
   * Render the body only — no `<section>`, no heading. Used when this card is the
   * body of a `CollapsibleRailCard`, which supplies both, so a folded card does
   * not show two headings saying the same thing.
   */
  bare?: boolean;
}) {
  const { upcoming, recent, totalCount } = partitionOverrides(overrides, today);

  const body = (
    <>
      {isLoading ? (
        <div className="mt-3 space-y-1.5" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-7 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : upcoming.length === 0 && recent.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {totalCount === 0
            ? 'None yet — change a date’s type and it will show up here.'
            : 'Nothing near today.'}
        </p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <Group label="Upcoming" rows={upcoming} selectedDate={selectedDate} today={today} onSelectDate={onSelectDate} />
          )}
          {recent.length > 0 && (
            <Group label="Recent" rows={recent} selectedDate={selectedDate} today={today} onSelectDate={onSelectDate} />
          )}
        </>
      )}
    </>
  );

  if (bare) return <>{body}</>;

  return (
    <section
      aria-label="Day-type overrides"
      className="glass-panel rounded-xl border border-border/60 p-5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Day-type overrides
        </h2>
        {totalCount > 0 && (
          <span className="text-[11px] tabular-nums text-muted-foreground/70">
            {totalCount} total
          </span>
        )}
      </div>
      {body}
    </section>
  );
}

function Group({
  label,
  rows,
  selectedDate,
  today,
  onSelectDate,
}: {
  label: string;
  rows: DayOverride[];
  selectedDate: string;
  today: string;
  onSelectDate: (date: string) => void;
}) {
  return (
    <div className="mt-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </p>
      <ul className="mt-1 space-y-1">
        {rows.map((row) => {
          const isSelected = row.date === selectedDate;
          return (
            <li key={row.date}>
              <button
                type="button"
                onClick={() => onSelectDate(row.date)}
                aria-current={isSelected ? 'date' : undefined}
                className={cn(
                  'glass-capsule flex w-full items-center gap-2 rounded-md px-2 py-1 text-left',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected ? 'bg-primary/10' : 'hover:bg-muted/60'
                )}
                style={
                  row.dayTypeColor
                    ? ({ '--glass-hue': row.dayTypeColor } as React.CSSProperties)
                    : undefined
                }
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: row.dayTypeColor ?? 'var(--muted-foreground)' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-foreground">
                    {row.dayTypeName}
                  </span>
                  {row.note && (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {row.note}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
                    {row.date}
                  </span>
                  <span className="block text-[10px] text-muted-foreground/70">
                    {relativeDayLabel(row.date, today)}
                  </span>
                </span>
                <Repeat2
                  size={11}
                  aria-hidden="true"
                  className="shrink-0 text-muted-foreground/50"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default DayOverrides;
