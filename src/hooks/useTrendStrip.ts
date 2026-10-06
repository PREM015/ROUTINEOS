'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { getPeriodRange, resolveWeekStartsOn, shiftAnchor, type Period } from '@/lib/period-range';
import type { AnalyticsDashboard } from '@/types/analytics';
import {
  MAX_TREND_POINTS,
  TREND_FETCH_CONCURRENCY,
  freeTrend,
  withExtraTrendPoints,
  type TrendMetric,
  type TrendPoint,
  type TrendStripData,
} from '@/lib/analytics/trend';

/**
 * Longer trends, on request only.
 *
 * ## Why this fetches nothing until asked
 *
 * The dashboard endpoint is the most expensive read in the app. `freeTrend` already
 * yields a two-point trend on every tab and a **twelve-point** trend on the year tab, both
 * from the payload in hand. So the default page load issues **no** extra request on any
 * tab, and the opt-in path adds at most three.
 *
 * ## Why three, and why two at a time
 *
 * Two points are free, so reaching `MAX_TREND_POINTS` of five needs three more. Firing all
 * three at once would triple a thirty-query endpoint's load in one tick; a concurrency of
 * two keeps at most two in flight and keeps the queue to three, which completes quickly
 * enough to be unnoticeable while never being the reason the page feels slow.
 *
 * ## The race
 *
 * Every fetch is aborted on unmount and on a change of period, and the results are
 * committed under a token — the same discipline as `usePeriodUrlState` and
 * `useComparePeriod`. A slow response for an old period must never land on top of a newer
 * one, because the strip would then show a trend that jumps backwards.
 *
 * ## The cache
 *
 * Session-lifetime and keyed by `period|anchor`. Stepping back and forward over history is
 * the normal way to use this page, and re-fetching a period the user just looked at would
 * be the most wasteful thing the feature could do.
 */

export interface TrendState {
  trend: TrendStripData;
  isLoading: boolean;
  /** True when the user has asked for more and the fetch finished short. */
  partial: boolean;
  load: () => void;
}

/**
 * Session cache, deliberately module-level.
 *
 * Deliberate: the cache has to outlive the component, or unmounting the page would throw
 * away what it cost to build. Scoped to the tab session — a full reload starts empty,
 * which is the honest behaviour for a device-local optimisation.
 */
const cache = new Map<string, { points: TrendPoint[]; failed: number }>();

export function useTrendStrip(
  payload: AnalyticsDashboard,
  period: Period,
  anchorDate: string,
  metric: TrendMetric
): TrendState {
  const base = useMemo(() => freeTrend(payload, metric), [metric, payload]);

  const tokenRef = useRef({ current: true });
  const abortRef = useRef<AbortController[]>([]);

  const cacheKey = `${period}|${anchorDate}|${metric}`;

  // The year tab needs no request at all — its twelve points are already here. Opting in
  // would issue three requests to learn nothing the payload did not already say.
  const needsFetch = period !== 'year';

  /*
    One state object carrying the key it belongs to, rather than three pieces of state
    synced by an effect.

    The effect version — `useEffect(() => setExtra(cache.get(key)), [key])` — renders once
    with the *previous* period's points still on screen before correcting itself. On a
    dashboard whose whole promise is that the number shown is the number that was measured,
    a frame showing last week's trend under this week's heading is the exact bug worth
    avoiding. Resetting during render cannot produce that frame, and it is the pattern React
    documents for state that must not survive a prop change.
  */
  type LoadState = {
    key: string;
    entry: { points: TrendPoint[]; failed: number } | null;
    isLoading: boolean;
  };

  const [state, setState] = useState<LoadState>(() => ({
    key: cacheKey,
    entry: cache.get(cacheKey) ?? null,
    isLoading: false,
  }));

  const current: LoadState =
    state.key === cacheKey
      ? state
      : { key: cacheKey, entry: cache.get(cacheKey) ?? null, isLoading: false };

  // Abandon anything in flight when the period or metric changes.
  useEffect(() => {
    tokenRef.current = { current: true };
    return () => {
      tokenRef.current.current = false;
      for (const controller of abortRef.current) controller.abort();
      abortRef.current = [];
    };
  }, [cacheKey]);

  const load = useCallback(() => {
    if (!needsFetch || current.isLoading) return;

    const cached = cache.get(cacheKey);
    if (cached) {
      setState({ key: cacheKey, entry: cached, isLoading: false });
      return;
    }

    setState((prev) => ({ key: cacheKey, entry: prev.entry, isLoading: true }));
    const token = { current: true };
    tokenRef.current = token;

    const anchors = earlierAnchors(period, anchorDate);
    const weekStartsOn = resolveWeekStartsOn(payload.range.weekStartsOn);
    // Kept as anchor+point rather than bare points: the label is for humans and cannot be
    // sorted on. "12 – 18 Oct" sorts before "5 – 11 Oct" as a string, because "1" < "5", so
    // ordering by label would draw the strip in reverse. ISO anchors sort correctly.
    const collected: Array<{ anchor: string; point: TrendPoint }> = [];
    let failed = 0;

    const runOne = async (index: number): Promise<void> => {
      if (index >= anchors.length) return;
      const anchor = anchors[index] as string;
      const controller = new AbortController();
      abortRef.current.push(controller);

      try {
        const result = await apiRequest<AnalyticsDashboard>(
          `/api/analytics/dashboard?period=${period}&date=${anchor}`,
          { signal: controller.signal }
        );
        if (!token.current) return;
        collected.push({
          anchor,
          point: {
            label: getPeriodRange(period, anchor, undefined, weekStartsOn).label,
            value: metric === 'score' ? result.hero.total : result.hero.habitReliability,
            coverage: result.hero.daysScored || null,
          },
        });
      } catch (error) {
        // An abort is us changing our mind, not a failure worth counting or reporting.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        failed += 1;
      } finally {
        if (!token.current) return;
        await runOne(index + 1);
      }
    };

    // Lanes sized by the constant rather than a literal, so changing the cap changes the
    // concurrency deliberately instead of leaving two unrelated numbers behind.
    const lanes = Math.min(TREND_FETCH_CONCURRENCY, anchors.length);
    void Promise.all(
      Array.from({ length: lanes }, (_, lane) => runOne(lane))
    ).then(() => {
      if (!token.current) return;
      // Oldest first, so the strip reads left to right in time order.
      collected.sort((a, b) => a.anchor.localeCompare(b.anchor));
      const entry = { points: collected.map((entry) => entry.point), failed };
      cache.set(cacheKey, entry);
      setState({ key: cacheKey, entry, isLoading: false });
    });
  }, [anchorDate, cacheKey, current.isLoading, metric, needsFetch, payload.range.weekStartsOn, period]);

  const extra = current.entry;

  const trend = useMemo(
    () => (extra ? withExtraTrendPoints(base, extra.points, extra.failed) : base),
    [base, extra]
  );

  return { trend, isLoading: current.isLoading, partial: extra !== null && extra.failed > 0, load };
}

/**
 * The anchors to fetch, oldest first, capped so the strip stays a summary.
 *
 * Stepping the *anchor* rather than reading `range.prev` keeps this to one string per
 * period, and `getPeriodRange` is what turns each into a range server-side.
 */
/**
 * The anchors to fetch, oldest first, capped so the strip stays a summary.
 *
 * The delta is in **periods**, which is what `shiftAnchor` expects — a day, a week, a
 * month or a year. Multiplying by a day-count instead would have made "one month ago" from
 * 31 January land on 1 January rather than 1 December, and every later point with it.
 */
function earlierAnchors(period: Period, anchorDate: string): string[] {
  const wanted = MAX_TREND_POINTS - 2;
  const anchors: string[] = [];
  for (let i = wanted; i >= 1; i -= 1) {
    anchors.push(shiftAnchor(anchorDate, period, -i));
  }
  return anchors;
}
