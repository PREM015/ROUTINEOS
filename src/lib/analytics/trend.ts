/**
 * The Trend Strip's data, derived from what the dashboard already carries.
 *
 * ## The performance decision
 *
 * The original spec proposed "up to five previous periods" through the dashboard endpoint,
 * fetched on demand — and hid the whole feature on the year tab. Measured against the
 * payload, both halves of that were wrong.
 *
 * **The year tab already has a twelve-point trend.** `chart2` on that tab is
 * `yearlySummary.monthlyScoreTrend`: twelve monthly averages, each with its own count of
 * scored days, computed server-side from a single range read. It is in the payload. So a
 * full trend there costs **zero extra requests**, and hiding the feature discarded data
 * that was already in hand.
 *
 * **Every tab already has two points.** The current period is the page itself and the
 * previous one is `comparison`. So the floor is two measured points everywhere, free.
 *
 * What genuinely needs fetching is a *longer* trend on the shorter tabs, and only on
 * request. The design therefore is:
 *
 * | Tab | Points available | Extra requests |
 * |---|---|---|
 * | year | 12, from `chart2` | **0** |
 * | month | 2 free, up to 5 | 3, opt-in |
 * | week | 2 free, up to 5 | 3, opt-in |
 * | day | 2 free, up to 5 | 3, opt-in |
 *
 * Default page load issues **no** extra request on any tab. That is the whole answer to
 * "did this make page load heavier": no.
 *
 * ## What a trend is allowed to say
 *
 *  - **`null` is never `0`.** An unmeasured point is a gap, and a gap in a trend line is
 *    information — interpolating over it would invent a value nobody measured.
 *  - **Direction needs two measured points.** One point has no direction, and a strip that
 *    draws an arrow from a single number is decoration.
 *  - **"Meaningful" has a threshold**, stated, because a 1-point wobble between two
 *    periods is noise and calling it a trend teaches the reader to distrust the feature.
 *  - **Down is not failure.** A falling score gets an attention colour, never a red one.
 *    This is the same rule the pace projection and the insight engine already follow.
 *
 * Pure and dependency-free: no repository, no Prisma, no environment.
 */

import type { AnalyticsChartData, AnalyticsDashboard } from '@/types/analytics';

/** Below this, a change between periods is noise rather than a direction. */
export const MEANINGFUL_CHANGE_POINTS = 3;

/** How many points an opt-in fetch will add. Two are already free on every tab. */
export const MAX_TREND_POINTS = 5;

/** How many of those fetches may be in flight at once. */
export const TREND_FETCH_CONCURRENCY = 2;

export type TrendMetric = 'score' | 'habitRate';

export interface TrendPoint {
  /** Stable label: a month key, or a range label. */
  label: string;
  /** `null` when nothing was measured. Never `0`. */
  value: number | null;
  /** Days or periods behind this point, for the basis sentence. */
  coverage: number | null;
}

export interface TrendStripData {
  metric: TrendMetric;
  points: TrendPoint[];
  /** Where the points came from, in words. */
  basis: string;
  /**
   * The change between the first and last *measured* points, or `null` when there are
   * fewer than two.
   */
  change: number | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
  /** Whether `change` clears the threshold. */
  meaningful: boolean;
  /** True when there is not enough measured data to say anything. */
  insufficient: boolean;
  /** Why it is insufficient, when it is. */
  insufficientReason: string | null;
}

function metricLabel(metric: TrendMetric): string {
  return metric === 'score' ? 'Average score' : 'Habit completion rate';
}

/**
 * The trend available with **no additional request**.
 *
 * Year: the twelve monthly averages already in `chart2`. Every other tab: the current
 * period and the one `comparison` measured against.
 */
export function freeTrend(payload: AnalyticsDashboard, metric: TrendMetric): TrendStripData {
  const current = metric === 'score' ? payload.hero.total : payload.hero.habitReliability;
  const previous =
    metric === 'score' ? payload.comparison.average : payload.comparison.habitRateAverage;

  /*
    The year tab's `chart2` is the monthly **score** trend, server-computed from one range
    read. So it can answer "is my score rising across the year?" for free and nothing else.

    Returning those score points under a habit-rate label would be the worst kind of wrong on
    this page: the number would be real, the caption would not be, and the rail would be
    measuring something other than what it says it measures. So the year tab says it has no
    monthly habit trend rather than substituting one. Filling it in would mean twelve extra
    dashboard requests, which is the cost the free path exists to avoid.
  */
  if (payload.period === 'year') {
    if (metric === 'habitRate') {
      return {
        metric: 'habitRate',
        points: [],
        change: null,
        direction: 'unknown',
        meaningful: false,
        insufficient: true,
        insufficientReason:
          'The year view measures monthly score averages only. There is no monthly habit ' +
          'completion trend to read, and showing the score trend under this label would be ' +
          'a different measurement wearing the right name.',
        basis:
          'A monthly habit-completion trend is not precomputed for this range. Switch to the ' +
          'average score, or to a week or month tab where both periods were measured.',
      };
    }
    return fromMonthlyTrend(payload.chart2, payload.range.label);
  }

  const points: TrendPoint[] = [
    {
      label: payload.comparison.start,
      value: previous,
      coverage: null,
    },
    { label: payload.range.start, value: current, coverage: payload.hero.daysScored || null },
  ];

  return summarise(
    metric,
    points,
    `The earlier point is ${payload.comparison.start} – ${payload.comparison.end}, which ` +
      'the page already measured for its comparison. ' +
      `${payload.comparison.basis}`
  );
}

/**
 * Twelve monthly averages, read straight out of `chart2`.
 *
 * `days` per point is the count of scored days behind that month's average, which is what
 * lets the basis sentence say "October averages 4 scored days" rather than implying a
 * month of data the user may not have.
 */
function fromMonthlyTrend(
  chart2: AnalyticsChartData[],
  yearLabel: string
): TrendStripData {
  const points: TrendPoint[] = chart2.map((point) => ({
    label: point.name,
    value: point.value,
    coverage: null,
  }));

  return summarise(
    'score',
    points,
    `Monthly averages already computed for ${yearLabel} — no extra request. Months with no ` +
      'scored day are gaps, not zeroes.'
  );
}

/**
 * Add opt-in points to the free ones and re-summarise.
 *
 * `extra` arrives from `useTrendStrip` and may be partial — a fetch that failed for two of
 * three periods yields one point, and the strip shows what it has with an honest basis
 * rather than pretending to be complete.
 */
export function withExtraTrendPoints(
  base: TrendStripData,
  extra: TrendPoint[],
  failed: number
): TrendStripData {
  if (extra.length === 0) return base;

  const points = [...extra, ...base.points];
  const basis =
    failed > 0
      ? `${base.basis} ${failed} earlier ${failed === 1 ? 'period' : 'periods'} could not be loaded.`
      : `${base.basis} Including ${extra.length} earlier ${extra.length === 1 ? 'period' : 'periods'}.`;

  return summarise(base.metric, points, basis);
}

function summarise(metric: TrendMetric, points: TrendPoint[], basis: string): TrendStripData {
  const measured = points.filter((point) => point.value !== null);

  if (measured.length < 2) {
    return {
      metric,
      points,
      basis,
      change: null,
      direction: 'unknown',
      meaningful: false,
      insufficient: true,
      insufficientReason:
        measured.length === 0
          ? `No ${metric === 'score' ? 'scored days' : 'due days'} in these periods yet, so there is nothing to compare.`
          : 'One measured period is not a trend. Load more, or move back through history.',
    };
  }

  const first = measured[0] as TrendPoint;
  const last = measured[measured.length - 1] as TrendPoint;
  const change = Math.round(((last.value ?? 0) - (first.value ?? 0)) * 10) / 10;

  const direction =
    change > 0 ? 'up' : change < 0 ? 'down' : 'flat';

  return {
    metric,
    points,
    basis,
    change,
    direction,
    meaningful: Math.abs(change) >= MEANINGFUL_CHANGE_POINTS,
    insufficient: false,
    insufficientReason: null,
  };
}

/**
 * The sentence under the strip.
 *
 * States the metric, the direction, whether the change is meaningful, and over what — a
 * reader should be able to check the claim without asking.
 */
export function trendSentence(trend: TrendStripData): string {
  const label = metricLabel(trend.metric);
  if (trend.insufficient) return trend.insufficientReason ?? 'Not enough data yet.';

  const measured = trend.points.filter((point) => point.value !== null);
  const from = measured[0]?.label ?? '';
  const to = measured[measured.length - 1]?.label ?? '';

  const magnitude =
    trend.metric === 'habitRate'
      ? `${Math.abs(trend.change ?? 0)} points`
      : `${Math.abs(trend.change ?? 0)} points`;

  const direction =
    trend.direction === 'flat'
      ? 'level with'
      : trend.direction === 'up'
        ? 'up'
        : 'down';

  const strength = trend.meaningful
    ? ''
    : ` A change under ${MEANINGFUL_CHANGE_POINTS} points is within normal variation.`;

  return (
    `${label} is ${direction} ${magnitude} from ${from} to ${to}.${strength} ${trend.basis}`
  );
}
