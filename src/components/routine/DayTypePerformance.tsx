'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { DayTypeRollup } from '@/lib/routine/week-pattern';

/**
 * "Am I actually worse on weekends?"
 *
 * The question the week strip cannot answer: the strip shows seven days, and a
 * run of three flat ones is ambiguous — a bad week, or a habit of saving
 * weekends for sleep. Grouping the same seven days by resolved preset turns
 * that ambiguity into an answer, with no second query.
 *
 * ## Labelled inline, no legend
 *
 * Each row names its own preset and prints its own percentage at the end of the
 * bar, following the approach `DayShapeBar` already takes. A separate key would
 * mean the reader has to hold a mapping in their head to read the chart, which
 * is the thing a rail this size cannot afford.
 *
 * ## A day with nothing tracked is excluded, not zeroed
 *
 * Rows are averages over days that *had* tracked blocks. Including the empty
 * ones as zeros is how a preset ends up looking terrible for the two weekends a
 * month you simply did not schedule anything, which is the opposite of the truth
 * and the fastest way to make someone distrust the whole rail.
 *
 * ## Ordering is by rate, and that is worth knowing
 *
 * Best first. This is a comparison, not a ranking to aspire to, so the rows are
 * not interactive and there is nothing to click — unlike the week strip, whose
 * capsules navigate.
 */

/** Rows shown before the list is truncated. Five covers every real week. */
const MAX_ROWS = 5;

export function DayTypePerformance({
  rollups,
  isLoading,
  bare,
}: {
  rollups: DayTypeRollup[];
  isLoading: boolean;
  /**
   * Render the body only — no `<section>`, no heading. Used when this card is the
   * body of a `CollapsibleRailCard`, which supplies both, so a folded card does
   * not show two headings saying the same thing.
   */
  bare?: boolean;
}) {
  const reduce = useReducedMotion();

  if (!isLoading && rollups.length === 0) {
    return (
      <section
        aria-label="By day type"
        className="glass-panel rounded-xl border border-border/60 p-5"
      >
        <h2 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          By day type
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          No tracked blocks in this week yet — a few ticks and this fills in.
        </p>
      </section>
    );
  }

  const rows = rollups.slice(0, MAX_ROWS);

  const body = (
    <>
      {isLoading ? (
        <div className="mt-3 space-y-2" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-4 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row, index) => (
            <li key={row.dayTypeName}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground">
                  {row.dayTypeColor && (
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: row.dayTypeColor }}
                    />
                  )}
                  <span className="truncate">{row.dayTypeName}</span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {row.averageCompletionRate}%
                </span>
              </div>

              {/*
                The track is `.glass-capsule` and the fill is inset inside it, so
                a half-full row reads as glass holding colour — the same material
                as the timeline's blocks and the week strip's capsules, rather
                than a fourth visual language on one rail.
              */}
              <div
                className="glass-capsule mt-1 flex h-2.5 w-full items-end overflow-hidden rounded-full"
                style={
                  row.dayTypeColor
                    ? ({ '--glass-hue': row.dayTypeColor } as React.CSSProperties)
                    : undefined
                }
              >
                <motion.span
                  aria-hidden="true"
                  className="w-full rounded-full"
                  style={{
                    backgroundColor: row.dayTypeColor ?? 'var(--primary)',
                    height: '100%',
                    opacity: 0.85,
                    transformOrigin: 'left',
                  }}
                  initial={reduce ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{
                    duration: reduce ? 0 : 0.45,
                    delay: reduce ? 0 : index * 0.05,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              </div>

              {/*
                The denominator, in words. A bare 78% invites the question "78%
                of what?", and the answer — tracked blocks, on the days that had
                any — is exactly the distinction the rest of this page is careful
                about.
              */}
              <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                {row.completed}/{row.total} tracked · {row.daysRated}{' '}
                {row.daysRated === 1 ? 'day' : 'days'}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className={cn('mt-2 text-[11px] text-muted-foreground')}>
        Average of tracked blocks, over days that had any.
      </p>
    </>
  );

  if (bare) return <>{body}</>;

  return (
    <section aria-label="By day type" className="glass-panel rounded-xl border border-border/60 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          By day type
        </h2>
        {rollups.length > MAX_ROWS && (
          <span className="text-[11px] text-muted-foreground/70">
            top {MAX_ROWS} of {rollups.length}
          </span>
        )}
      </div>
      {body}
    </section>
  );
}

export default DayTypePerformance;
