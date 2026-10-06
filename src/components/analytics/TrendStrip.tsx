'use client';

import { Activity, ArrowDownRight, ArrowUpRight, Loader2, Minus, TrendingUp } from 'lucide-react';
import type { AnalyticsDashboard } from '@/types/analytics';
import type { Period } from '@/lib/period-range';
import { useTrendStrip, type TrendState } from '@/hooks/useTrendStrip';
import type { TrendMetric, TrendPoint } from '@/lib/analytics/trend';
import { trendSentence } from '@/lib/analytics/trend';
import { cn } from '@/lib/utils';

/**
 * Recent direction, in one strip.
 *
 * ## What it is for
 *
 * An executive summary, not a second dashboard. One metric, a row of points, one sentence
 * saying what changed and over what. The temptation with a trend is to add a second
 * metric, an axis, a tooltip and a legend; all four would make it a chart competing with
 * the two already on the page.
 *
 * ## On colour
 *
 * Direction gets a hue, but **never on its own**: every arrow is paired with a word —
 * "up", "down", "level" — in the sentence beneath, and the arrow glyph itself differs per
 * direction. A falling score is amber, never red: the project's standing rule is that down
 * is not failure, and a red bar would say otherwise. The year tab's twelve months use the
 * tier palette rather than a single hue, because a series that goes up and down should not
 * be painted as though every rise were a win and every fall a loss.
 *
 * ## Gaps stay gaps
 *
 * A point with no measurement renders as a gap in the rail with no marker, not as a zero
 * and not as an interpolated value. An unmeasured month is information; a fabricated one is
 * not.
 */
export function TrendStrip({
  payload,
  period,
  anchorDate,
  metric,
  onMetricChange,
}: {
  payload: AnalyticsDashboard;
  period: Period;
  anchorDate: string;
  metric: TrendMetric;
  onMetricChange: (metric: TrendMetric) => void;
}) {
  const { trend, isLoading, partial, load }: TrendState = useTrendStrip(
    payload,
    period,
    anchorDate,
    metric
  );

  return (
    <section aria-labelledby="trend-strip" className="glass-panel rounded-2xl p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="trend-strip" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
          Recent direction
        </h2>

        <div className="flex items-center gap-2">
          <MetricToggle metric={metric} period={period} onChange={onMetricChange} />
          {/*
            Only offered where it would actually fetch. On the year tab the twelve points
            are already in the payload, so a button here would issue three requests to
            learn nothing new.
          */}
          {period !== 'year' && (
            <button
              type="button"
              onClick={load}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Activity className="h-3 w-3" aria-hidden="true" />
              )}
              {isLoading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </div>

      <TrendRail points={trend.points} metric={metric} />

      <p className="mt-3 text-xs text-muted-foreground">{trendSentence(trend)}</p>

      {partial && (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
          Some earlier periods could not be loaded, so this trend is shorter than it should be.
        </p>
      )}

      {/*
        The cost note is not decoration. Three extra requests against the most expensive
        endpoint in the app is a real price, and the user is the one paying it.
      */}
      {period !== 'year' && (
        <p className="mt-1 text-[11px] text-muted-foreground/80">
          &ldquo;Load more&rdquo; fetches three earlier periods, two at a time.
        </p>
      )}
    </section>
  );
}

/**
 * The rail.
 *
 * A row of fixed-width cells rather than a plotted line. With at most twelve points and
 * gaps to preserve, cells communicate "this has no measurement" far more honestly than a
 * line — a line has to either bridge a gap or stop, and both readings are wrong.
 */
function TrendRail({ points, metric }: { points: TrendPoint[]; metric: TrendMetric }) {
  const measured = points.filter((point) => point.value !== null);
  const values = measured.map((point) => point.value ?? 0);
  const max = values.length > 0 ? Math.max(...values) : 0;
  const min = values.length > 0 ? Math.min(...values) : 0;
  const span = Math.max(1, max - min);

  const description =
    measured.length === 0
      ? 'No measurements in these periods.'
      : `${measured.length} of ${points.length} periods have a measurement. ` +
        `Highest ${Math.round(max)}${metric === 'habitRate' ? '%' : ''}, ` +
        `lowest ${Math.round(min)}${metric === 'habitRate' ? '%' : ''}.`;

  return (
    <>
      <p className="sr-only">{description}</p>
      <div
        aria-hidden="true"
        className="mt-4 flex h-16 items-end gap-1.5"
      >
        {points.map((point, index) => {
          if (point.value === null) {
            // A gap. Deliberately a bare track with no marker, so "no measurement"
            // cannot be mistaken for "measured at zero".
            return (
              <div
                key={`${point.label}-${index}`}
                className="flex-1 rounded-t border-t border-dashed border-border/50"
                style={{ height: '100%' }}
              />
            );
          }

          const height = 20 + ((point.value - min) / span) * 80;
          const isLatest = index === points.length - 1;

          return (
            <div
              key={`${point.label}-${index}`}
              className="group relative flex-1"
              style={{ height: `${height}%` }}
            >
              <div
                className={cn(
                  'h-full w-full rounded-t transition-[height] duration-300 ease-out motion-reduce:transition-none',
                  isLatest ? RAIL_LATEST : RAIL
                )}
              />
              <span className="sr-only">
                {point.label}: {Math.round(point.value)}
                {metric === 'habitRate' ? ' percent' : ''}
                {point.coverage ? `, ${point.coverage} scored days` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/**
 * Restrained, warm-to-cool ramp.
 *
 * Deliberately not a single hue: a series that rises and falls painted in one colour says
 * every rise is good and every fall is bad, which is not a claim this data supports. The
 * ramp reads as "position within the range" instead, and the latest period is picked out in
 * the accent so the eye lands where the sentence is pointing.
 */
const RAIL =
  'bg-gradient-to-t from-sky-500/35 to-violet-500/45 border-t border-sky-400/40';
const RAIL_LATEST =
  'bg-gradient-to-t from-primary/45 to-amber-400/55 border-t border-primary/60';

/**
 * Score or habits.
 *
 * On the year tab the Habits button is disabled rather than hidden. Hiding it would make the
 * control change shape between tabs with nothing to explain why; disabling it keeps the
 * affordance visible and lets `title`/`aria-disabled` say what is missing — that the year view
 * carries monthly score averages only. Offering it and then rendering score numbers under a
 * habits caption would be worse than either.
 */
function MetricToggle({
  metric,
  period,
  onChange,
}: {
  metric: TrendMetric;
  period: Period;
  onChange: (next: TrendMetric) => void;
}) {
  const options: Array<{ id: TrendMetric; label: string }> = [
    { id: 'score', label: 'Score' },
    { id: 'habitRate', label: 'Habits' },
  ];
  const habitUnavailable = period === 'year';

  return (
    <div role="group" aria-label="Trend metric" className="flex rounded-lg bg-muted p-0.5">
      {options.map((option) => {
        const active = option.id === metric;
        const unavailable = option.id === 'habitRate' && habitUnavailable;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            disabled={unavailable}
            title={
              unavailable
                ? 'The year view measures monthly score averages only, so there is no monthly habit trend to show.'
                : undefined
            }
            onClick={() => onChange(option.id)}
            className={cn(
              'rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              unavailable && 'cursor-not-allowed opacity-50 hover:text-muted-foreground'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Direction glyph.
 *
 * Exported so the direction vocabulary is defined once. Amber for "down" rather than red:
 * a lower score is worth noticing, not a failure state, and red would say something the
 * page does not mean.
 */
export function DirectionMark({ direction }: { direction: 'up' | 'down' | 'flat' | 'unknown' }) {
  if (direction === 'up') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        up
      </span>
    );
  }
  if (direction === 'down') {
    return (
      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
        down
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
      level
    </span>
  );
}
