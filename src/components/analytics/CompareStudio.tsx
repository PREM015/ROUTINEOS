'use client';

import { useId } from 'react';
import { ArrowRight, GitCompareArrows, Loader2, RotateCcw } from 'lucide-react';
import type { AnalyticsDashboard } from '@/types/analytics';
import type { Period } from '@/lib/period-range';
import {
  comparableOnly,
  comparisonBasis,
  classifyComparableMetrics,
  suppressed,
  type MetricVerdict,
} from '@/lib/analytics/comparable-metrics';
import { deltaText } from '@/lib/analytics/format';

/**
 * Two periods of the same type, side by side, with the limits stated.
 *
 * ## What this panel is mostly made of
 *
 * Almost all of it is things it *refuses* to show. Comparing a part-lived week against a
 * whole one is fine for a rate and guaranteed-wrong for a total, so every metric is
 * classified and the cumulative ones are listed with the reason rather than quietly
 * dropped. That list is a feature: a user who wonders why focus minutes are absent gets
 * an answer instead of a gap.
 *
 * ## Why the classification is not computed here
 *
 * Deciding which figures survive unequal spans is a judgement about the data, not about
 * presentation. Computing it in this component would mean the client re-deriving it from
 * its own reading of the payload, and the page would eventually disagree with the rule.
 * It lives in `lib/analytics/comparable-metrics.ts`, unit-tested without a DOM.
 *
 * ## Why this cannot take the main view down
 *
 * The comparison request is separate, opt-in, abortable, and its failure renders here as
 * a retry. The primary period is loaded by a different hook and is untouched by anything
 * that happens in this panel.
 */
export function CompareStudio({
  primary,
  comparison,
  period,
  isLoading,
  error,
  isStale,
  onRetry,
  onClose,
}: {
  primary: AnalyticsDashboard;
  comparison: AnalyticsDashboard | null;
  period: Period;
  isLoading: boolean;
  error: string | null;
  isStale: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  const headingId = useId();

  const primaryDays = elapsedDays(primary);
  const otherDays = comparison ? elapsedDays(comparison) : 0;

  const verdicts = classifyComparableMetrics(
    { primaryDays, otherDays },
    periodWord(period)
  );
  const shown = comparableOnly(verdicts);
  const withheld = suppressed(verdicts);

  const basis = comparisonBasis(
    primary.range.label,
    primaryDays,
    comparison?.range.label ?? 'the other period',
    otherDays,
    withheld.length
  );

  return (
    <section
      aria-labelledby={headingId}
      className="glass-panel rounded-2xl p-5 shadow-soft"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <GitCompareArrows className="h-4 w-4 text-primary" aria-hidden="true" />
          Comparing {primary.range.label}
          {comparison && (
            <>
              {' with '}
              <span className="text-muted-foreground">{comparison.range.label}</span>
            </>
          )}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Stop comparing
        </button>
      </div>

      {isLoading && !comparison && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Loading the other period…
        </p>
      )}

      {error && (
        <div role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This period is still shown above — only the comparison failed.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {!comparison && !isLoading && !error && (
        <p className="mt-3 text-sm text-muted-foreground">
          Choose a period to compare with.
        </p>
      )}

      {comparison && (
        <div className={isStale ? 'opacity-60 transition-opacity motion-reduce:transition-none' : 'transition-opacity motion-reduce:transition-none'}>
          <p className="mt-3 text-xs text-muted-foreground">{basis}</p>

          {shown.length > 0 ? (
            <ul className="mt-3 divide-y divide-border/40">
              {shown.map((verdict) => (
                <MetricRow
                  key={verdict.metric.id}
                  verdict={verdict}
                  primary={readMetric(primary, verdict.metric.path)}
                  other={readMetric(comparison, verdict.metric.path)}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing in this period can be compared honestly with a period of a different
              length.
            </p>
          )}

          {withheld.length > 0 && (
            <details className="mt-4 rounded-lg border border-border/50 bg-card/40 p-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {withheld.length} figure{withheld.length === 1 ? '' : 's'} not compared, and why
              </summary>
              <ul className="mt-2 space-y-1.5">
                {withheld.map((verdict) => (
                  <li key={verdict.metric.id} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{verdict.metric.label}</span>
                    {' — '}
                    {verdict.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function MetricRow({
  verdict,
  primary,
  other,
}: {
  verdict: MetricVerdict;
  primary: number | null;
  other: number | null;
}) {
  const { metric } = verdict;
  const hasBoth = primary != null && other != null;
  const delta = hasBoth ? Math.round(((primary as number) - (other as number)) * 10) / 10 : null;

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{metric.label}</span>
        {/*
          Both figures always shown, not just the delta. A difference without the two
          numbers behind it is the thing the whole comparison is meant to replace.
        */}
        <span className="block text-[11px] tabular-nums text-muted-foreground">
          {formatValue(primary, metric.unit)} vs {formatValue(other, metric.unit)}
        </span>
      </span>
      <span
        className={`shrink-0 text-sm font-semibold tabular-nums ${
          delta == null
            ? 'text-muted-foreground'
            : delta > 0
              ? 'text-emerald-500'
              : delta < 0
                ? 'text-destructive'
                : 'text-foreground'
        }`}
      >
        {delta == null ? (
          '—'
        ) : (
          <>
            {/* Sign stated in text as well as colour, so direction never depends on hue. */}
            <ArrowRight className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            {delta === 0 ? 'No change' : deltaText(delta)}
          </>
        )}
      </span>
    </li>
  );
}

/**
 * Read a metric out of a payload by its dotted path.
 *
 * Returns `null` for a missing or non-numeric leaf. That is a real possibility rather
 * than a defensive flourish: a day period has no monthly score trend, and a week whose
 * comparison has no scored day has no average — neither is an error, and neither should
 * render as `0`.
 */
export function readMetric(
  payload: AnalyticsDashboard,
  path: string
): number | null {
  const value = path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined,
      payload
    );

  if (typeof value === 'number' && Number.isFinite(value)) return value;

  // `nutrition` and `streaks.current`-style paths may resolve to a count rather than a
  // scalar; a length is a legitimate number for a "how many" metric.
  if (Array.isArray(value)) return value.length;

  return null;
}

function formatValue(value: number | null, unit: MetricVerdict['metric']['unit']): string {
  if (value == null) return '—';
  if (unit === 'percent') return `${Math.round(value)}%`;
  if (unit === 'score') return String(Math.round(value));
  if (unit === 'per5') return `${value}/5`;
  if (unit === 'minutes') {
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }
  return String(Math.round(value));
}

/** Elapsed days in a period, from the freshness block the server already computed. */
function elapsedDays(payload: AnalyticsDashboard): number {
  return payload.freshness.elapsedDays;
}

function periodWord(period: Period): string {
  return period === 'day' ? 'day' : period;
}
