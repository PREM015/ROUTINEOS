'use client';

/**
 * The Habit Consistency card.
 *
 * The centrepiece of `/habits`, and the page's single hero surface.
 *
 * ## Why a full year, not a window
 *
 * A contribution graph's value is comparison: 7 days has no trend, 90 days has
 * almost no shape. A calendar year is the unit at which "am I consistent" becomes
 * answerable, and it is the unit the user thinks in when they say "how was 2025".
 *
 * ## Why the day count is never hardcoded
 *
 * `daysInYear` applies the Gregorian rule, so 2028 renders 366 cells and 1900
 * renders 365. A hardcoded 365 silently drops December 29th of a leap year and
 * shifts every weekday row after February - invisible until someone notices their
 * worst day is always the wrong day.
 *
 * ## Why the default view depends on how much history exists
 *
 * 53 columns of 14px cells is a wall, and a new user's single logged day is one
 * dot in it. So below `MONTHS_PREFERRED_AFTER` scheduled days the card opens on
 * **Months**, which is readable at three weeks of history. The Year view stays
 * one click away and is never disabled - this is a default, not a gate.
 *
 * ## The state model
 *
 * A cell is not "green or not". The absence of green carries three distinct
 * meanings (nothing due / nothing recorded / logged as missed) and they are drawn
 * differently, because a single empty cell collapses three different facts into
 * one square and 300 of those is a year of quietly wrong information.
 */

import { useEffect, useMemo, useState } from 'react';
import { Flame, Info, LayoutGrid, RefreshCw, Rows3 } from 'lucide-react';
import { Panel } from '@/components/dashboard-ui';
import { apiRequest } from '@/lib/api-client';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { LEGEND_HINT, LEGEND_LEVELS } from '@/lib/habits/contribution-visual';
import type { ContributionYear } from '@/lib/habits/contributions';
import { ContributionGrid } from './ContributionGrid';
import { ContributionMonths } from './ContributionMonths';
import { ContributionInsights } from './ContributionInsights';
import { cn } from '@/lib/utils';

/**
 * Below this many scheduled days, Months is the readable default.
 *
 * Fourteen is roughly two weeks - enough that a month grid shows a real pattern
 * rather than three isolated dots.
 */
const MONTHS_PREFERRED_AFTER = 14;

type View = 'year' | 'months';

export function HabitContributionHeatmap() {
  const { today } = useUserTimezone();
  const currentYear = Number(today.slice(0, 4));

  const [data, setData] = useState<ContributionYear | null>(null);
  const [year, setYear] = useState<number>(currentYear);
  const [view, setView] = useState<View | null>(null);
  /** True only for an explicit refresh; a year switch derives its own state. */
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  /*
    Loading is DERIVED, not stored.

    Storing it meant a `setLoading(true)` in the effect body, which is a
    synchronous state write and therefore a second render pass on every year
    change. Reading the year back off the payload is both cheaper and more
    correct: the moment the selector changes, the stored payload is for the wrong
    year, so the card is genuinely stale and says so - with no intermediate frame
    where it claims to be showing 2024 while loading 2025.
  */
  const loading = data === null || data.stats.year !== year || refreshing;

  useEffect(() => {
    let cancelled = false;

    /*
      State is written inside the promise callbacks, never synchronously in the
      effect body, and every write is guarded by `cancelled` so a slow response
      arriving after unmount cannot update a component that is gone.
    */
    apiRequest<ContributionYear>(`/api/habits/contributions?year=${year}`)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load your contributions');
        setData(null);
      })
      .finally(() => {
        if (cancelled) return;
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [year, nonce]);

  /**
   * `null` means "not chosen yet", so the resolved view can follow the data.
   *
   * A manual choice is sticky: once the user picks a view, switching years does
   * not yank them back to the default they had already overridden.
   */
  const resolvedView: View = useMemo(() => {
    if (view !== null) return view;
    const scheduled = data?.stats.scheduledDays ?? 0;
    return scheduled < MONTHS_PREFERRED_AFTER ? 'months' : 'year';
  }, [view, data]);

  const years = useMemo(() => {
    const set = new Set<number>([currentYear, ...(data?.availableYears ?? [])]);
    return Array.from(set).sort((a, b) => b - a);
  }, [data, currentYear]);

  const stats = data?.stats ?? null;
  const isEmpty = data !== null && data.cells.length === 0;

  if (error) {
    return (
      <Panel
        title="Consistency"
        domain="habits"
        error={error}
        onRetry={() => {
          setRefreshing(true);
          setNonce((n) => n + 1);
        }}
        minHeightClass="min-h-[18rem]"
      />
    );
  }

  return (
    <section
      aria-label="Habit consistency"
      className="glass-panel [--glass-hue:var(--accent-habits)] [--glass-tint:8%] rounded-[20px]"
    >
      {/* ── header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pb-4 pt-5 sm:px-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Flame
              className="h-4 w-4"
              style={{ color: 'var(--accent-habits)' }}
              aria-hidden="true"
            />
            Consistency
            {stats?.isLeap && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Leap year
              </span>
            )}
          </h2>

          {/*
            No stats row here. `Active days`, `Current streak` and `Best streak`
            were printed in the header AND again in the card grid below, so the
            same three numbers appeared twice within 200px of each other. The
            grid is the better home for them - it has room to give each one a
            label and a number at the same weight. The header keeps only the
            qualifiers, which the grid does not carry.
          */}
          {stats && (
            /*
              `tabular-nums` on the qualifiers as well as the tiles: the year, the
              day count and the rate sit in one string, and proportional figures
              make that string shift sideways as the numbers change - which reads
              as the header twitching when the data refreshes.
            */
            <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
              {stats.year} &middot; {stats.daysInYear} days
              {stats.rate !== null && <> &middot; {stats.rate}% of scheduled habits completed</>}
              {stats.windowStart.slice(5) !== '01-01' && (
                <> &middot; since {stats.windowStart}</>
              )}
            </p>
          )}
        </div>

        {/* ── controls, integrated into the header rather than floating ── */}
        <div className="flex shrink-0 items-center gap-1.5">
          <div
            role="tablist"
            aria-label="Consistency view"
            className="flex items-center gap-0.5 rounded-full bg-muted/70 p-0.5"
          >
            <ViewTab
              active={resolvedView === 'year'}
              onClick={() => setView('year')}
              icon={<LayoutGrid className="h-3 w-3" aria-hidden="true" />}
              label="Year"
            />
            <ViewTab
              active={resolvedView === 'months'}
              onClick={() => setView('months')}
              icon={<Rows3 className="h-3 w-3" aria-hidden="true" />}
              label="Months"
            />
          </div>

          {years.length > 1 && (
            <div
              role="group"
              aria-label="Year"
              className="flex items-center gap-0.5 rounded-full bg-muted/70 p-0.5"
            >
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  aria-pressed={year === y}
                  onClick={() => setYear(y)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium tabular-nums transition-colors motion-reduce:transition-none',
                    year === y
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              setNonce((n) => n + 1);
            }}
            aria-label="Refresh consistency"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', loading && 'animate-spin')}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 pb-10 pt-4 text-center">
          <Info className="h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">No habit history for {year}</p>
          <p className="max-w-[42ch] text-xs text-muted-foreground">
            {year === currentYear
              ? 'Complete a habit and this fills in from the first day you do.'
              : 'Nothing was logged in this year. Pick another year above.'}
          </p>
        </div>
      ) : (
        <div className={cn('px-5 pb-5 sm:px-6', loading && 'opacity-70 transition-opacity')}>
          {/* ── the grid ─────────────────────────────────────────────────── */}
          {/*
            `glass` rather than a flat `bg-background/25`. Two stacked flat fills
            - the card, then this rectangle - is what made the matrix read as a
            dark void with a border around it; a frosted layer over the card reads
            as a surface instead.
          */}
          <div
            className="glass rounded-[14px] border border-border/50 p-3.5"
            aria-busy={loading}
          >
            {/*
              Full width, and deliberately NOT `mx-auto` / `max-w-fit`.

              Centring and hugging were both wrong here. `max-w-fit` measures the
              scrollable year grid and collapses the months view to one narrow
              centred column; `mx-auto` then floats that column in the middle of
              the panel. The grid is left-aligned, full-bleed, and scrolls
              horizontally when it is genuinely wider than the card.
            */}
            <div className="w-full min-w-0">
              {data && (
                <>
                  {resolvedView === 'year' ? (
                    <ContributionGrid
                      year={data}
                      today={today}
                      size="sm"
                      showAxis
                    />
                  ) : (
                    <ContributionMonths year={data} today={today} />
                  )}
                </>
              )}

              {loading && !data && <GridSkeleton months={resolvedView === 'months'} />}
            </div>
          </div>

          {/* ── legend: a key, not a caption ────────────────────────────── */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Less
              </span>
              <div className="flex items-center gap-1">
                {LEGEND_LEVELS.map((level) => (
                  <span
                    key={level.key}
                    title={level.label}
                    style={{
                      background: level.fill,
                      boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--border) 60%, transparent)`,
                    }}
                    className="h-3 w-3 rounded-[3px]"
                  />
                ))}
              </div>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                More
              </span>
            </div>

            {/*
              The caption is a tooltip, not a line of text. At 1200px it was a
              full-width paragraph sitting beside a 5-square legend, which
              inverted the hierarchy: the explanation outweighed the key it was
              explaining. `title` on a focusable button gives keyboard and
              pointer users the same string, and no hover-only content.
            */}
            {resolvedView === 'year' && (
              <button
                type="button"
                className="rounded-full p-1 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
                aria-label="How to read this grid"
                title={LEGEND_HINT}
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* ── insights ─────────────────────────────────────────────────── */}
          {stats && !loading && data && (
            <div className="mt-5 border-t border-border/60 pt-5">
              <ContributionInsights year={data} />
            </div>
          )}

          {loading && !stats && (
            <div className="mt-5 space-y-3 border-t border-border/60 pt-5" aria-hidden="true">
              <div className="grid grid-cols-2 items-stretch gap-2.5 md:grid-cols-3 lg:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-[14px] bg-muted motion-reduce:animate-none"
                  />
                ))}
              </div>
              <div className="h-36 animate-pulse rounded-[20px] bg-muted motion-reduce:animate-none" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      role="tab"
      type="button"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors motion-reduce:transition-none',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** Mirrors the loaded shape so the card does not resize when the data lands. */
function GridSkeleton({ months }: { months: boolean }) {
  if (months) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <div className="mb-2 h-3 w-10 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-[118px] animate-pulse rounded-[10px] bg-muted motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex gap-1" aria-hidden="true">
      <div className="grid w-4 shrink-0 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-[14px] w-[14px] animate-pulse rounded-[3px] bg-muted motion-reduce:animate-none" />
        ))}
      </div>
      <div className="flex gap-[3px]">
        {Array.from({ length: 26 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }).map((__, j) => (
              <div
                key={j}
                className="h-[14px] w-[14px] animate-pulse rounded-[3px] bg-muted motion-reduce:animate-none"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
