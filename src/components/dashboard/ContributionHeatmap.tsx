'use client';

/**
 * Consistency — the same trailing year, presented two ways.
 *
 * A **GitHub-style contribution graph** (weeks as columns, weekdays as rows) and
 * a **LeetCode-style streak calendar** (one month block per month, cells numbered
 * by day), behind one view toggle and one dataset. Neither is a second widget:
 * both read the same `days` map, the same heat gradient, the same tooltip copy
 * and the same stats row, so the two views cannot disagree about the user's
 * history.
 *
 * ## Why the stats are computed from the grid, not from `/api/streak`
 *
 * A header reading "current streak 9" above a calendar with a visible gap in it
 * is exactly the small contradiction that makes a dashboard untrustworthy. Both
 * numbers come from `computeStats` over the same rows the grid paints, so the
 * header is always about the window on screen.
 *
 * ## B2 restraint
 *
 * Cells are micro-gradient tiles, not flat swatches, and the hover is the page's
 * smallest and cheapest: a 1px lift and a brightness bump at 150ms. There are 90+
 * of them, so restraint here is what keeps the page performant as well as tasteful.
 *
 * The auto-caption resolves *after* the grid finishes its stagger, never
 * alongside it — a caption arriving with the thing it summarises is just more
 * text, while one arriving after reads as a finding.
 */

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, LayoutGrid, Maximize2, Minimize2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/dashboard-ui';
import { HEAT_FILL } from '@/components/dashboard-ui/tokens';
import { ContributionMonths } from './contributions/ContributionMonths';
import { ContributionYearGrid } from './contributions/ContributionYearGrid';
import { useContributionData } from './contributions/useContributionData';
import { computeStats } from '@/lib/dashboard/contributions';
import { cn } from '@/lib/utils';

type View = 'year' | 'months';

/**
 * Longest entrance delay any single cell gets, so the caption can be scheduled
 * strictly after the grid has finished rather than alongside it.
 */
const GRID_STAGGER_CAP = 1.4;

/** Below this many scored days, Months is the readable default. */
const MONTHS_PREFERRED_AFTER = 14;

const VIEWS: { key: View; label: string; icon: typeof LayoutGrid }[] = [
  { key: 'year', label: 'Year', icon: LayoutGrid },
  { key: 'months', label: 'Months', icon: CalendarDays },
];

export function ContributionHeatmap() {
  const reduce = useReducedMotion();
  const { days, byDate, years, today, loading, error, retry } = useContributionData();

  const [view, setView] = useState<View | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  /**
   * Default to the calendar year the user is living in.
   *
   * `null` until the data lands, because the available years are only knowable
   * from the response — and defaulting to `new Date().getFullYear()` on the
   * server would pick the host's year, which is the same off-by-one class of bug
   * that shifted the whole grid before.
   */
  const selectedYear = year ?? years[0] ?? null;

  const stats = useMemo(
    () => (selectedYear === null ? null : computeStats(byDate, selectedYear, today)),
    [byDate, selectedYear, today]
  );

  // Escape closes the modal. An effect, not a memo: this registers and removes a
  // listener, which is a side effect, and a `useMemo` with this body would
  // re-register on every render and never clean up on the one it mattered.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const hasAnyScore = days.length > 0;

  /*
    The default view follows the data, not the screen.

    `null` means "not chosen yet", so it can resolve once the stats exist. Below
    `MONTHS_PREFERRED_AFTER` scored days the card opens on **Months**: a 53-column
    year strip is a wall, and a user with three days of history sees one lit cell
    in it. Year stays one click away and is never disabled - this is a default,
    not a gate.

    A manual choice is sticky, so switching years does not yank the user back to
    a default they already overrode.
  */
  const resolvedView: View =
    view ?? ((stats?.activeDays ?? 0) < MONTHS_PREFERRED_AFTER ? 'months' : 'year');

  // ── states ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Panel
        title="Consistency"
        subtitle="Your activity, two ways"
        domain="habits"
        loading
        loadingRows={4}
        minHeightClass="min-h-[19rem]"
      />
    );
  }

  if (error && !hasAnyScore) {
    return (
      <Panel
        title="Consistency"
        domain="habits"
        error={error}
        onRetry={retry}
        minHeightClass="min-h-[19rem]"
      />
    );
  }

  if (!hasAnyScore) {
    /*
      Still render the full calendar. The previous version swapped the whole grid
      for an icon and a sentence, which is the opposite of the brief: the calendar
      IS the affordance, and an empty grid is exactly what a brand-new user's year
      looks like. It also produced a short card that jumped to full height the
      moment one habit was ticked.

      Every cell here is a *skeleton* — filled and edged, never a scored zero —
      so the shape of the year reads immediately and the note below is a caption
      on a real grid rather than a placeholder for one.
    */
    return (
      <Panel title="Consistency" domain="habits" minHeightClass="min-h-[19rem]">
        <div className="flex min-w-0 flex-1 flex-col gap-3 px-5 pb-5">
          <ContributionYearGrid byDate={byDate} today={today} year={selectedYear ?? 0} />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <p>Nothing logged yet this year — each cell is a day, waiting.</p>
          </div>
        </div>
      </Panel>
    );
  }

  // ── header controls ───────────────────────────────────────────────────────

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Year selector. Only shown when the window actually crosses two years. */}
      {years.length > 1 && selectedYear !== null && (
        <div
          role="group"
          aria-label="Year"
          className="flex items-center gap-0.5 rounded-full bg-muted p-0.5"
        >
          {years.map((y) => (
            <button
              key={y}
              type="button"
              aria-pressed={selectedYear === y}
              onClick={() => setYear(y)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium tabular-nums transition-colors motion-reduce:transition-none',
                selectedYear === y
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      <div
        role="tablist"
        aria-label="Consistency view"
        className="flex items-center gap-0.5 rounded-full bg-muted p-0.5"
      >
        {VIEWS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={resolvedView === key}
            onClick={() => setView(key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors motion-reduce:transition-none',
              resolvedView === key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="px-2"
        onClick={() => setExpanded(true)}
        aria-label="Expand consistency to full screen"
        title="Full screen"
      >
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );

  // ── the grid, in whichever view ───────────────────────────────────────────

  const grid =
    resolvedView === 'year' ? (
      <ContributionYearGrid byDate={byDate} today={today} year={selectedYear ?? 0} />
    ) : (
      <ContributionMonths byDate={byDate} year={selectedYear ?? 0} today={today} />
    );

  const legend = (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Less</span>
      <div className="flex gap-1">
        {HEAT_FILL.map((background, level) => (
          <span
            key={level}
            style={{ background }}
            className="h-3 w-3 rounded-sm"
            aria-hidden="true"
          />
        ))}
      </div>
      <span>More</span>
    </div>
  );

  return (
    <>
      <Panel
        title="Consistency"
        // No `subtitle`. The three numbers used to be split across the subtitle
        // and a row underneath, so "best run" appeared twice in one card.
        domain="habits"
        action={controls}
        minHeightClass="min-h-[19rem]"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-3 px-5 pb-5">
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error} — showing the last successful load.
            </p>
          )}

          {/*
            The stats row. Present in both views and derived from the same rows the
            grid paints, so it can never contradict what is on screen.
          */}
          {stats && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['Active days', `${stats.activeDays}${stats.totalDays > 0 ? ` / ${stats.totalDays}` : ''}`],
                  ['Current streak', `${stats.currentStreak}d`],
                  ['Best run', `${stats.longestStreak}d`],
                ] as const
              ).map(([label, value]) => (
                <span
                  key={label}
                  className="inline-flex items-baseline gap-1.5 rounded-full bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-border/40"
                >
                  {label}
                  <span className="font-display text-sm font-bold tabular-nums text-foreground">
                    {value}
                  </span>
                </span>
              ))}
              {resolvedView === 'months' && selectedYear !== null && (
                <span className="tabular-nums text-xs text-muted-foreground/70">
                  {selectedYear}
                </span>
              )}
            </div>
          )}

          {/*
            Left-aligned and full-width. It was `mx-auto max-w-fit`, which read
            as correct in a screenshot of a busy year and as broken in a sparse
            one: a 53-column strip centred inside a wider panel leaves symmetric
            black gutters, and the stat badges above stay pinned left while the
            thing they describe floats in the middle. The badges are the grid's
            caption, so they and the grid share an edge.
          */}
          <div className="w-full min-w-0">{grid}</div>

          {/*
            B2: the caption resolves AFTER the grid. It is a finding about what
            was just drawn, so it is timed past the last cell's entrance rather
            than rendered from the start. `computeStats` still returns null below
            3 scored days for that weekday — "most consistent on Tuesdays" from
            two data points is worse than no caption at all.
          */}
          {stats?.bestWeekday && (
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: GRID_STAGGER_CAP * 0.5 + 0.35,
                duration: 0.5,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="text-xs text-muted-foreground"
            >
              You&rsquo;re most consistent on {stats.bestWeekday}.
            </motion.p>
          )}

          {legend}
        </div>
      </Panel>

      {/* A7 depth level 2: a modal, not a bigger card. */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="overlay-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Consistency, full screen"
          >
            <motion.div
              className="glass-overlay flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[20px] p-6"
              initial={reduce ? false : { scale: 0.96, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 12 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Consistency</h3>
                  <p className="text-sm text-muted-foreground">
                    {stats
                      ? `${stats.activeDays} active days · best run ${stats.longestStreak} days`
                      : 'Your activity, two ways'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    role="tablist"
                    aria-label="Consistency view"
                    className="flex items-center gap-0.5 rounded-full bg-muted p-0.5"
                  >
                    {VIEWS.map(({ key, label, icon: Icon }) => (
                      <button
                        key={key}
                        role="tab"
                        type="button"
                        aria-selected={resolvedView === key}
                        onClick={() => setView(key)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors motion-reduce:transition-none',
                        resolvedView === key
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Icon className="h-3 w-3" aria-hidden="true" />
                        {label}
                      </button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="px-2"
                    onClick={() => setExpanded(false)}
                    aria-label="Close full-screen view"
                    title="Close"
                  >
                    <Minimize2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-2"
                    onClick={() => setExpanded(false)}
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto pb-2">
                {resolvedView === 'year' ? (
                  <ContributionYearGrid
                    byDate={byDate}
                    today={today}
                    year={selectedYear ?? 0}
                    size="lg"
                  />
                ) : (
                  <ContributionMonths
                    byDate={byDate}
                    year={selectedYear ?? 0}
                    today={today}
                    size="lg"
                  />
                )}
              </div>

              <div className="mt-4 shrink-0">{legend}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default ContributionHeatmap;
