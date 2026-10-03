'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { WeekDay } from '@/lib/routine/week-pattern';
import { weekAverage } from '@/lib/routine/week-pattern';
import type { RoutineProgressResponse } from '@/types/routine';

/**
 * The week at a glance: one capsule per day, fill height = that day's rate.
 *
 * ## Same material, same grammar as the timeline
 *
 * The main timeline already teaches "height means something" — a block is as
 * tall as it is long. This strip reuses that grammar for a different quantity
 * rather than introducing a bar chart: a taller capsule is a better day. The
 * capsules are `.glass-capsule` for the same reason the blocks are, and the
 * fill is inset within the glass so a half-full day still reads as a *vessel*
 * holding something, not a bar wearing a costume.
 *
 * ## Three distinct states per day, never two
 *
 * A day with nothing tracked is `completionRate === null`, and it renders as an
 * empty capsule — not a zero-height one, and not an empty one at 0%. Folding
 * "nothing to tick" into "0%" is the mistake this page already made once with
 * three competing completion rates. Future days are dimmed, because their rate
 * does not exist yet and showing an empty capsule for them would be the same
 * lie in a different direction.
 *
 * ## Clicking navigates
 *
 * Each capsule is a button that sets `?date=`. The strip is a navigation
 * surface, not a display-only one, so the same week is reachable by clicking the
 * day you want instead of arrowing through the date strip.
 */

/** Minimum rendered height, so a 5% day is still visibly taller than a 0% one. */
const MIN_FILL_PERCENT = 6;

/**
 * Wording for a day whose rate is measured against a different schedule.
 *
 * Defined once because three things say it — the `aria-label`, the tooltip and the
 * marker glyph — and three independently worded copies of an explanation this
 * subtle is three chances to describe the same situation inconsistently.
 *
 * The point it has to make: the number is *right*, not broken. A user who changed
 * a day's type after logging some work would otherwise see a rate that disagrees
 * with its neighbours and conclude their completions were lost.
 */
const SCHEDULE_SWITCHED_HINT =
  'Measured against a different schedule: the day type was changed after this work was logged, so the rate is counted against the schedule it was done under.';

export function WeekPattern({
  days,
  response,
  selectedDate,
  onSelectDate,
  bare,
}: {
  days: WeekDay[];
  response: RoutineProgressResponse | null;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  /**
   * Render the body only — no `<section>`, no heading, no padding.
   *
   * Used when the card is the body of a `CollapsibleRailCard`, which supplies all
   * three. Without it a folded card would show two headings saying the same
   * thing, and the disclosure's own summary line would be buried under an
   * identical duplicate.
   */
  bare?: boolean;
}) {
  const reduce = useReducedMotion();
  const average = weekAverage(response);

  const body =
    days.length === 0 ? (
      <p className="text-xs text-muted-foreground">No week loaded yet.</p>
    ) : (
      <>
        <ul className="flex items-end gap-1.5">
        {days.map((day, index) => {
          const isSelected = day.date === selectedDate;
          const fill =
            day.completionRate === null
              ? null
              : Math.max(MIN_FILL_PERCENT, day.completionRate);

          return (
            <li key={day.date} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onSelectDate(day.date)}
                aria-current={isSelected ? 'date' : undefined}
                aria-label={
                  day.completionRate === null
                    ? `${day.weekday} ${day.date}: ${day.dayTypeName}, nothing tracked`
                    : day.scheduleSwitched
                      ? // The rate is real, but measured against the schedule the
                        // work was done under rather than this date's current one.
                        // Saying so beats letting the number look wrong.
                        `${day.weekday} ${day.date}: ${day.dayTypeName}, ${day.completed} of ${day.total} tracked blocks done, measured against a different schedule because the day type was changed`
                      : `${day.weekday} ${day.date}: ${day.dayTypeName}, ${day.completed} of ${day.total} tracked blocks done`
                }
                title={day.scheduleSwitched ? SCHEDULE_SWITCHED_HINT : undefined}
                className={cn(
                  'group flex w-full flex-col items-center gap-1 rounded-lg p-1 text-center',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected ? 'bg-primary/10' : 'hover:bg-muted/60'
                )}
              >
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {day.weekday}
                </span>

                {/*
                  The capsule. A fixed 56px vessel so the strip's height never
                  depends on how well the week went, and the fill is a percentage
                  of *that*, so a bad week looks sparse rather than collapsed.
                */}
                <span
                  className={cn(
                    'glass-capsule relative flex h-14 w-full items-end overflow-hidden rounded-lg',
                    day.isFuture && 'opacity-40'
                  )}
                  style={
                    day.dayTypeColor
                      ? ({ '--glass-hue': day.dayTypeColor } as React.CSSProperties)
                      : undefined
                  }
                >
                  {fill === null ? (
                    // Nothing tracked. A hairline, not an empty vessel — it says
                    // "no data" without implying "zero".
                    <span className="absolute inset-x-0 bottom-0 h-px bg-border" />
                  ) : (
                    <motion.span
                      aria-hidden="true"
                      className="w-full rounded-b-lg"
                      style={{
                        backgroundColor: day.dayTypeColor ?? 'var(--primary)',
                        height: `${fill}%`,
                        opacity: 0.85,
                        // Framer animates `transform` itself, so the origin has to
                        // ride on the style prop — as a class it would be
                        // overwritten. Bottom, so the fill grows out of the floor
                        // of the capsule instead of dropping in from the top.
                        transformOrigin: 'bottom',
                      }}
                      initial={reduce ? false : { scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{
                        duration: reduce ? 0 : 0.5,
                        // Left to right, matching the date strip's reading order.
                        delay: reduce ? 0 : index * 0.04,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    />
                  )}
                </span>

                <span
                  className={cn(
                    'font-mono text-[10px] tabular-nums',
                    day.completionRate === null
                      ? 'text-muted-foreground/60'
                      : 'text-muted-foreground'
                  )}
                >
                  {day.completionRate === null ? '–' : `${day.completionRate}`}
                </span>
              </button>

              {/*
                A day whose schedule was switched after the work was logged.

                The rate on the tile is correct — it is measured against the
                schedule the user was actually following — but it is measured
                against a *different* schedule from its neighbours, so it will not
                line up with them. A small caret is enough to explain that without
                turning the strip into a table of footnotes; the full sentence is
                on the accessible label and the tooltip.
              */}
              {day.scheduleSwitched && (
                <span
                  aria-hidden="true"
                  title={SCHEDULE_SWITCHED_HINT}
                  className="mt-0.5 text-[9px] leading-none text-amber-500/90"
                >
                  ↳
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/*
        The rate is only legible with a unit somewhere. A bare `72` under a
        capsule reads as "72 minutes" or "72 blocks" to most people.
      */}
      {average !== null && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Weekly average{' '}
          <span className="font-mono tabular-nums font-medium text-foreground">{average}%</span>{' '}
          of tracked blocks, across days you tracked something.
        </p>
      )}
      </>
    );

  if (bare) return <>{body}</>;

  return (
    <section
      aria-label="This week"
      className="glass-panel rounded-xl border border-border/60 p-5"
    >
      <Header average={average} />
      {body}
    </section>
  );
}

function Header({ average }: { average: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        This week
      </h2>
      {average === null && (
        <span className="text-[11px] text-muted-foreground/70">nothing tracked</span>
      )}
    </div>
  );
}

export default WeekPattern;
