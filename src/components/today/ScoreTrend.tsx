'use client';

import { useEffect, useId, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { onTodayDataChanged } from '@/lib/today-sync';

/**
 * A seven-day score trend, rendered inside the Score card.
 *
 * ## Why this exists
 *
 * The card already answers "how good is today" and the Streak card answers "how
 * long unbroken". Neither answers **"am I improving?"**, which is the question
 * that actually motivates someone to open a habit tracker. A single number and a
 * streak count are both flat over time, so a person who improved for a month saw
 * no difference on the page.
 *
 * ## Why it is a sparkline and not another card
 *
 * `/today` already carries eight cards and every additional one competes for
 * attention and re-introduces the ragged-row layout problems this page has
 * repeatedly had. This lives *inside* the Score card, adds no new surface, and
 * renders nothing at all when there is not enough history â€” so a new user sees
 * exactly the card they saw before.
 *
 * Data comes from `GET /api/scores/daily`, which already exists and takes a date
 * range, so this adds no route and no server work.
 */

const WINDOW_DAYS = 7;
const MIN_POINTS = 3;

/** Shift a `YYYY-MM-DD` string by whole days, in UTC to avoid DST drift. */
function shiftDate(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

interface TrendPoint {
  date: string;
  totalScore: number | null;
}

export function ScoreTrend({ date }: { date: string }) {
  const [points, setPoints] = useState<TrendPoint[] | null>(null);

  // Stable, instance-unique id for the area gradient (see the <defs> below).
  const fillId = `scoreTrendFill-${useId()}`;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const start = shiftDate(date, -(WINDOW_DAYS - 1));
        const res = await fetch(
          `/api/scores/daily?startDate=${start}&endDate=${date}`,
          { credentials: 'include' }
        );
        if (!res.ok) return;
        const json: unknown = await res.json().catch(() => null);
        if (cancelled || !json || typeof json !== 'object') return;

        const rows = (json as { data?: unknown }).data;
        if (!Array.isArray(rows)) return;

        const mapped: TrendPoint[] = rows
          .map((row) => {
            const r = row as { date?: unknown; totalScore?: unknown };
            return {
              date: typeof r.date === 'string' ? r.date : '',
              totalScore: typeof r.totalScore === 'number' ? r.totalScore : null,
            };
          })
          .filter((p) => p.date !== '');

        if (!cancelled) setPoints(mapped);
      } catch {
        // Offline or unauthenticated â€” the strip simply stays absent.
      }
    };

    void load();

    // A habit tick recomputes the score server-side, so today's point is stale
    // until it re-reads. Refreshing on the shared event keeps the trend honest
    // without adding polling.
    const unsubscribe = onTodayDataChanged(() => void load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [date]);

  // Fewer than three scored days is not a trend, it is noise. Rendering nothing
  // is deliberate: a flat line across two points would imply progress that is
  // not measurable.
  if (!points || points.length < MIN_POINTS) return null;

  const scored = points.filter(
    (p): p is TrendPoint & { totalScore: number } => p.totalScore !== null
  );
  if (scored.length < MIN_POINTS) return null;

  const values = scored.map((p) => p.totalScore);
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const delta = last - first;

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat week must not divide by zero; give it a nominal 1-point range so the
  // line renders along the centre instead of collapsing to the top edge.
  const span = max - min || 1;

  /**
   * Geometry.
   *
   * The viewBox is deliberately taller than the rendered box and the drawing is
   * inset from its edges. `preserveAspectRatio="none"` stretches x and y
   * independently so the chart can fill any card width, which also means a
   * stroke drawn at x=0 or y=H is half-clipped by the viewport. The inset keeps
   * the line and the end-dot fully visible at every card width.
   */
  const W = 100;
  const H = 44;
  const PAD_X = 2;
  const PAD_TOP = 5;
  const PAD_BOTTOM = 4;
  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const step = values.length > 1 ? plotW / (values.length - 1) : plotW;

  const coords = values.map((v, i) => ({
    x: PAD_X + i * step,
    // Invert: score 0 at the bottom of the plot, 100 at the top.
    y: PAD_TOP + plotH - ((v - min) / span) * plotH,
  }));

  const linePoints = coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
  const baselineY = PAD_TOP + plotH;

  // Close the line down to the baseline so the area fill has a shape.
  const areaPoints = `${linePoints} ${coords[coords.length - 1]?.x.toFixed(2)},${baselineY} ${coords[0]?.x.toFixed(2)},${baselineY}`;
  const lastPoint = coords[coords.length - 1];

  const trend = delta > 2 ? 'up' : delta < -2 ? 'down' : 'flat';

  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  const trendTone =
    trend === 'up'
      ? 'text-emerald-600 dark:text-emerald-400'
      : trend === 'down'
        ? 'text-destructive'
        : 'text-muted-foreground';

  const summary = `Seven day trend: ${trend === 'up' ? 'up' : trend === 'down' ? 'down' : 'steady'} ${Math.abs(delta)} points, from ${first} to ${last}.`;

  return (
    <div className="mt-4 border-t border-border/60 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Last {values.length} days
        </span>
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${trendTone}`}>
          <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {delta === 0 ? 'Steady' : `${delta > 0 ? '+' : ''}${delta}`}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-2 h-14 w-full text-accent-score"
        role="img"
        aria-label={summary}
      >
        <defs>
          {/*
            `useId` rather than a fixed id: `/today` renders one instance today,
            but a fixed id would silently break the second one (duplicate defs,
            gradient resolves to the first).
          */}
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Area under the line â€” the main reason it reads as a chart now rather
            than a stray hairline. */}
        <polygon points={areaPoints} fill={`url(#${fillId})`} />

        {/* Baseline, faint, so the plot has a floor to read against. */}
        <line
          x1={PAD_X}
          y1={baselineY}
          x2={W - PAD_X}
          y2={baselineY}
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        <polyline
          points={linePoints}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Today's point, emphasised. */}
        {lastPoint && (
          <>
            <circle
              cx={lastPoint.x}
              cy={lastPoint.y}
              r="3.5"
              fill="currentColor"
              fillOpacity="0.25"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={lastPoint.x}
              cy={lastPoint.y}
              r="1.9"
              fill="currentColor"
              stroke="hsl(var(--card))"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      {/* Text equivalent of the sparkline â€” a screen reader gets the summary,
          and sighted users get the endpoints without decoding the shape. */}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {first} â†’ {last}
      </p>
    </div>
  );
}
