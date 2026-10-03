'use client';

/**
 * Momentum Panel - the dashboard's one hero card, and its gravitational centre.
 *
 * ## What it replaces
 *
 * Three cards that all answered the same question three different ways:
 *
 *   - `DayPulseHero` showed today's score, recalculated on every read, against
 *     `/today`'s `TodayScore` which recalculates on write. Same number, two
 *     strategies, so they could disagree. F2.
 *   - `StreakMetric` was its own competing card for "how am I doing".
 *   - `TrendChart` was a fourth card showing the same score series as bars.
 *
 * The split that fixes all of it is section 0 of the brief: `/today` owns *this
 * day*, `/dashboard` owns *the trend*. So this panel never renders today's score
 * as its headline. The hero number is the **weekly average**, and the day-level
 * series is the supporting cast. There is no arrangement of this card that can
 * show a same-day number `/today` also shows.
 *
 * ## Three zones (B1)
 *
 *   LEFT    7d/30d trend line, glowing stroke over a gradient area that fades
 *           to transparent, drawn on over 900ms.
 *   CENTRE  Streak arc + flame + "next milestone in N days". Gold at the top
 *           tier only (A2's scarcity rule).
 *   RIGHT   The week's composition: Habits / Routine / Sleep as three linked
 *           bars. The zoomed-out cousin of the sub-bars `/today` draws for a
 *           single day.
 *
 * ## Why there is exactly one tilt
 *
 * `.magnetic-tilt` is applied here and nowhere else on the page. A5 says the
 * restraint is part of the feel, and this is the card the eye lands on.
 */

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Flame, Minus, TrendingUp } from 'lucide-react';
import {
  DASHBOARD_RANGES,
  DELTA_BADGE_THRESHOLD_PCT,
  type DashboardRange,
} from '@/constants/dashboard';
import { DOMAIN_ACCENT, accentRing, accentTint, type Domain } from '@/components/dashboard-ui/accent';
import { Panel, PanelEmpty, RadialGauge } from '@/components/dashboard-ui';
import { useDashboardOverview } from '@/components/dashboard/useDashboardOverview';
import { StreakFlame, nextMilestone } from '@/components/streak/StreakFlame';
import { useMagneticTilt } from '@/hooks/useMagneticTilt';
import { useCountUp } from '@/components/motion/useCountUp';
import { cn } from '@/lib/utils';
import type { DashboardDay } from '@/types/dashboard';

const HUE = DOMAIN_ACCENT.score.hue;

/** Composition bars: the weekly version of `/today`'s score sub-bars. */
const COMPOSITION: {
  key: 'habitCompletionRate' | 'routineCompletionRate' | 'sleepScore';
  label: string;
  domain: Domain;
}[] = [
  { key: 'habitCompletionRate', label: 'Habits', domain: 'habits' },
  { key: 'routineCompletionRate', label: 'Routine', domain: 'routine' },
  { key: 'sleepScore', label: 'Sleep', domain: 'sleep' },
];

function mean(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

/**
 * Compare the trailing 7 days against the 7 before them.
 *
 * The brief asks for a "vs last week" delta. For a 30-day view that means the
 * recent 7 against the 7 before it, NOT the whole 30 against the whole 30 before
 * that - which would average away exactly the recent change the badge exists to
 * report.
 */
function weekDelta(days: DashboardDay[]): {
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
} {
  const span = days.slice(-14);
  const thisWeek = mean(span.slice(-7).map((d) => d.totalScore));
  const lastWeek = mean(span.slice(0, 7).map((d) => d.totalScore));
  if (thisWeek === null || lastWeek === null) return { pct: null, direction: 'flat' };
  // Last week genuinely at zero: a percentage change off a zero base is not a
  // percentage, it is a division that happens to be small. Report nothing.
  if (lastWeek === 0) return { pct: null, direction: 'flat' };
  const pct = ((thisWeek - lastWeek) / lastWeek) * 100;
  return { pct, direction: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat' };
}

/**
 * The glowing trend line with its fading area fill.
 *
 * `viewBox="0 0 n 1"` with `preserveAspectRatio="none"` so x maps to a day index
 * and y to a 0-1 fraction regardless of pixel size. Gaps break the path into
 * separate segments rather than interpolating across them, because
 * interpolating over an unscored day would draw a score the user never had.
 */
function TrendLine({ days }: { days: DashboardDay[] }) {
  /*
   * Memoised on `days`, and that is load-bearing rather than tidier.
   *
   * `values` used to be `days.map(...)` inline, which allocates a fresh array on
   * every render. That made `segments` (memoised on `[values, max]`) recompute
   * every render, which made the measurement effect below refire every render,
   * which called `setLengths` and re-rendered — the loop closed on itself and
   * React tore the panel down with "Maximum update depth exceeded".
   *
   * The chain only breaks if the thing the memo depends on is referentially
   * stable, so this must stay memoised. Deriving it inline reintroduces the bug.
   */
  const values = useMemo(() => days.map((d) => d.totalScore), [days]);
  const hasAny = values.some((v) => v !== null);
  const max = Math.max(...values.map((v) => v ?? 0), 100);
  const n = days.length;

  const segments = useMemo(() => {
    const out: string[] = [];
    let current: string[] = [];
    values.forEach((v, i) => {
      if (v === null) {
        if (current.length > 1) out.push(current.join(' '));
        current = [];
        return;
      }
      current.push(`${current.length === 0 ? 'M' : 'L'}${i + 0.5},${(1 - v / max).toFixed(4)}`);
    });
    if (current.length > 1) out.push(current.join(' '));
    return out;
  }, [values, max]);

  // The area fill only makes sense under an unbroken run; a fill spanning a gap
  // would shade a region the chart above it deliberately leaves empty.
  const fillPath = useMemo(() => {
    if (segments.length !== 1) return null;
    return `${segments[0]} L${n - 0.5},1 L0.5,1 Z`;
  }, [segments, n]);

  /*
    A5's SVG draw-on, applied to a line rather than a ring.

    The dash maths needs the path's real length, which is only knowable once the
    path is in the DOM - and it cannot be guessed from the viewBox, because the
    `preserveAspectRatio="none"` above means one user unit is a very different
    number of pixels horizontally than it is vertically. So the length is measured
    with `getTotalLength()` and the dash applied from state.

    This runs once per `segments` change: a layout read on a handful of paths, not
    per frame. Without it the "draws itself on over 900ms" requirement is simply
    not achievable.
  */
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const [lengths, setLengths] = useState<number[]>([]);

  useEffect(() => {
    /*
     * Measured defensively, one path at a time.
     *
     * `getTotalLength()` throws `InvalidStateError` on an element that is no
     * longer a live geometry node. `pathRefs.current` is a *persistent array*
     * across renders, so after `segments` shrinks it still holds paths that were
     * unmounted with the previous render — and asking one of those for its
     * length takes down the whole panel.
     *
     * So each read is checked three ways: the ref is non-null, the node is still
     * connected to the document, and the measurement is a finite number. A path
     * that fails any of them reports 0, which draws as "not yet animated" rather
     * than as a crash, and the next `segments` change measures it again.
     */
    setLengths(
      pathRefs.current.map((el) => {
        if (!el || !el.isConnected) return 0;
        try {
          const measured = el.getTotalLength();
          return Number.isFinite(measured) ? measured : 0;
        } catch {
          return 0;
        }
      })
    );
  }, [segments]);

  if (!hasAny) {
    return (
      <div className="flex h-full min-h-[120px] items-center">
        <svg
          viewBox="0 0 20 1"
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden="true"
        >
          <line
            x1="0"
            y1="0.5"
            x2="20"
            y2="0.5"
            stroke="var(--border)"
            strokeWidth="1.5"
            strokeDasharray="6 8"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[120px]">
      <svg
        viewBox={`0 0 ${n} 1`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          {/* The gradient fill under the line, fading to fully transparent at
              the baseline so the chart has no hard bottom edge. */}
          <linearGradient id="momentum-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={HUE} stopOpacity="0.28" />
            <stop offset="100%" stopColor={HUE} stopOpacity="0" />
          </linearGradient>
        </defs>

        {fillPath && <path d={fillPath} fill="url(#momentum-area)" />}

        {segments.map((d, i) => {
          const length = lengths[i] ?? 0;
          return (
            <path
              key={i}
              ref={(el) => {
                pathRefs.current[i] = el;
              }}
              d={d}
              fill="none"
              stroke={HUE}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              // B1: a glowing stroke that draws itself on. The glow is a
              // `drop-shadow` filter rather than a duplicated blurred path: one
              // filter instead of two elements per segment.
              style={{
                strokeDasharray: length > 0 ? length : undefined,
                strokeDashoffset: length > 0 ? length : undefined,
                filter: `drop-shadow(0 0 6px ${accentRing(HUE, 50)})`,
              }}
              className={length > 0 ? 'line-draw' : undefined}
            />
          );
        })}
      </svg>

      {/* Dots on the scored days, so a 30-day view reads as 30 observations
          rather than one continuous assertion. */}
      <div className="absolute inset-0">
        {values.map((v, i) =>
          v === null ? null : (
            <span
              key={days[i]?.date ?? i}
              className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${((i + 0.5) / n) * 100}%`,
                top: `${(1 - v / max) * 100}%`,
                background: HUE,
                opacity: 0.75,
              }}
              aria-hidden="true"
            />
          )
        )}
      </div>
    </div>
  );
}

function DeltaBadge({ pct, direction }: { pct: number | null; direction: 'up' | 'down' | 'flat' }) {
  // Below the threshold the badge is suppressed entirely. A permanent
  // "+0.4% vs last week" chip teaches the eye to ignore the chip.
  if (pct === null || Math.abs(pct) < DELTA_BADGE_THRESHOLD_PCT) return null;

  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;

  return (
    <span
      className={cn(
        'glow-pulse-once relative inline-flex items-center gap-1 rounded-full px-2.5 py-1',
        'text-xs font-semibold tabular-nums',
        direction === 'up'
          ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
          : 'bg-amber-500/12 text-amber-600 dark:text-amber-400'
      )}
    >
      {/*
        Amber, never red, for a decline. The brief is explicit: "never red or
        alarming". A dashboard that punishes a bad week is a dashboard you stop
        opening.
      */}
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {direction === 'up' ? '+' : ''}
      {Math.round(pct)}% vs last week
    </span>
  );
}

function StreakZone({ current, longest }: { current: number; longest: number }) {
  const animated = useCountUp(current, 0.85, { spring: true });
  const milestone = nextMilestone(current);
  const progress = milestone ? Math.min(100, (current / milestone.target) * 100) : 100;

  return (
    <div className="flex flex-col items-center gap-2">
      <RadialGauge
        value={progress}
        size={124}
        stroke={9}
        hue="var(--accent-streak)"
        label={`${current} day streak. ${
          milestone ? `${milestone.toGo} days to your next milestone` : 'All milestones reached'
        }`}
      >
        <StreakFlame days={current} size={22} />
        <span className="mt-0.5 font-display text-[2rem] font-bold leading-none tabular-nums text-foreground">
          {Math.round(animated)}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {current === 1 ? 'day' : 'days'}
        </span>
      </RadialGauge>

      <p className="text-center text-[11px] leading-tight text-muted-foreground">
        {milestone ? (
          <>
            <span className="font-semibold text-foreground">{milestone.toGo} days</span> to your
            next milestone
          </>
        ) : (
          <>
            All milestones reached
            {longest > 0 && <span className="text-foreground"> · best {longest}</span>}
          </>
        )}
      </p>
    </div>
  );
}

export function MomentumPanel() {
  const { data, loading, error, reload } = useDashboardOverview();
  const [range, setRange] = useState<DashboardRange>(7);
  const tiltRef = useMagneticTilt<HTMLDivElement>(true);

  // Named `visibleDays`, not `window`: a local `window` shadows the global inside
  // this component, and the first thing that breaks is `matchMedia`.
  const visibleDays = useMemo(() => (data ? data.days.slice(-range) : []), [data, range]);

  const stats = useMemo(() => {
    if (data === null) return null;
    const scored = visibleDays.filter((d) => d.totalScore !== null);
    return {
      average: mean(scored.map((d) => d.totalScore)),
      scoredDays: scored.length,
      delta: weekDelta(data.days),
      composition: COMPOSITION.map((c) => ({
        ...c,
        value: mean(visibleDays.map((d) => d[c.key])),
      })),
    };
  }, [data, visibleDays]);

  // The hero number is the WEEKLY AVERAGE, never today's score. That is the
  // whole reason this card cannot collide with `/today`.
  const animatedAverage = useCountUp(stats?.average ?? 0, 0.9, { spring: true });

  const verdict = useMemo(() => {
    const average = stats?.average;
    if (average === null || average === undefined) return null;
    const pct = Math.round(average);
    if (pct >= 85) return 'A strong week — this is what it looks like when it works';
    if (pct >= 65) return 'A steady week, with room to lift the weaker domains';
    if (pct >= 40) return 'A mixed week — the radar below shows what dragged';
    return 'A light week — one good day would move the average more than you think';
  }, [stats?.average]);

  const shell = cn(
    'glass-panel glass-panel-lift magnetic-tilt relative overflow-hidden rounded-[20px]',
    // B1: a slightly stronger tint than the standard 6-7%, so it reads as the
    // important card the instant the eye lands on it.
    '[--glass-tint:9%]'
  );

  if (loading) {
    return (
      <div className={shell} aria-busy="true" aria-label="Loading your momentum">
        <div className="grid gap-6 p-6 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <div className="h-3 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="mt-3 h-11 w-64 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            <div className="mt-5 h-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
          <div className="flex justify-center lg:col-span-3">
            <div className="h-[124px] w-[124px] animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
          </div>
          <div className="space-y-3 lg:col-span-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-8 animate-pulse rounded bg-muted motion-reduce:animate-none"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Panel
        title="Momentum"
        error={error}
        onRetry={() => void reload()}
        domain="score"
        minHeightClass="min-h-[16rem]"
      />
    );
  }

  // F2's real fix. The old Day Pulse coerced a missing score to 0 and drew a
  // confident empty gauge next to the words "nothing logged yet", so the number
  // and the message contradicted each other. Fewer than two scored days means we
  // genuinely have no trend, so we say so and draw a dashed baseline rather than
  // an axis that implies a measurement.
  if (stats === null || stats.scoredDays < 2) {
    return (
      <Panel
        title="Momentum"
        subtitle="Last 30 days"
        domain="score"
        minHeightClass="min-h-[16rem]"
      >
        <div className="flex flex-1 flex-col justify-center gap-3 px-5 pb-5">
          <svg viewBox="0 0 20 1" preserveAspectRatio="none" className="h-px w-full" aria-hidden="true">
            <line
              x1="0"
              y1="0.5"
              x2="20"
              y2="0.5"
              stroke="var(--border)"
              strokeWidth="1.5"
              strokeDasharray="5 7"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <PanelEmpty
            title="Not enough days yet"
            description="Keep logging on Today — your trend shows up here once there are a couple of scored days to compare."
          />
          <Link
            href="/today"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Go to Today
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </Panel>
    );
  }

  return (
    <div
      ref={tiltRef}
      className={shell}
      style={{ ['--glass-hue' as string]: HUE }}
    >
      {/*
        The violet bloom sitting closest to this card. B1 wants the mesh's
        brightest point drifting behind the hero over the session; this is the
        fixed half of that, and the mesh animation is the other half.
      */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-32 h-72 w-72 rounded-full blur-3xl"
        style={{ background: accentTint(HUE, 14) }}
      />

      <div className="relative grid gap-6 p-6 lg:grid-cols-12">
        {/* LEFT: the trend. */}
        <div className="min-w-0 lg:col-span-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Momentum &middot; last {range} days
              </p>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-3">
                {/* A4: the 64px slot. This card's most important number, and
                    the only one on the page at that size. */}
                <span className="font-display text-5xl font-bold leading-none tabular-nums text-foreground sm:text-[4rem]">
                  {Math.round(animatedAverage)}
                </span>
                <DeltaBadge pct={stats.delta.pct} direction={stats.delta.direction} />
              </div>
            </div>

            <div
              role="tablist"
              aria-label="Momentum range"
              className="flex shrink-0 items-center gap-1 rounded-full bg-muted p-0.5"
            >
              {DASHBOARD_RANGES.map((r) => (
                <button
                  key={r}
                  role="tab"
                  type="button"
                  aria-selected={range === r}
                  onClick={() => setRange(r)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors motion-reduce:transition-none',
                    range === r
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {r}d
                </button>
              ))}
            </div>
          </div>

          {verdict && (
            <p className="mt-2 max-w-md text-sm leading-relaxed text-foreground">{verdict}</p>
          )}

          <div className="mt-4 h-[132px]">
            <TrendLine days={visibleDays} />
          </div>

          <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-foreground/80">
            <span>{visibleDays[0]?.date.slice(5)}</span>
            <span>{visibleDays[Math.floor(range / 2)]?.date.slice(5)}</span>
            <span>Today</span>
          </div>
        </div>

        {/* CENTRE: the streak arc. */}
        <div className="flex items-center justify-center lg:col-span-3">
          <div className="border-border/60 lg:border-x lg:px-6">
            <StreakZone current={data?.streak.current ?? 0} longest={data?.streak.longest ?? 0} />
          </div>
        </div>

        {/* RIGHT: the week's composition. */}
        <div className="min-w-0 lg:col-span-3">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            This week
          </p>
          <ul className="space-y-3">
            {stats.composition.map((item) => {
              const hue = DOMAIN_ACCENT[item.domain].hue;
              const value = item.value;
              return (
                <li key={item.label} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">
                    {item.label}
                  </span>
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={value === null ? undefined : Math.round(value)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${item.label} weekly average`}
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-700 ease-out-expo motion-reduce:transition-none"
                      style={{
                        // No bar at all for a domain with no data, rather than a
                        // zero-width one that reads as "you scored 0".
                        width: value === null ? '0%' : `${Math.max(2, value)}%`,
                        background: accentRing(hue, 70),
                      }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">
                    {value === null ? '—' : `${Math.round(value)}%`}
                  </span>
                </li>
              );
            })}
          </ul>

          <Link
            href="/today"
            className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            Log today
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
