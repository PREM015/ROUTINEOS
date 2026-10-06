'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { ErrorReporter } from '@/lib/monitoring/error-reporter';
import { isCalendarDate } from '@/lib/dates';
import type { Period } from '@/lib/period-range';
import type { AnalyticsDashboard } from '@/types/analytics';

/**
 * The comparison period's data, fetched separately and only when asked for.
 *
 * ## Why this is a second request and not a parameter of the first
 *
 * The dashboard endpoint returns one period. Comparing two means two periods, and the
 * period *type* must match — a week against a month is not a comparison, it is two
 * unrelated numbers placed side by side. Extending the existing endpoint to return both
 * would mean every ordinary page load paid for a comparison nobody asked to see.
 *
 * ## Why it never loads on mount
 *
 * The endpoint is the most expensive read in the app, around thirty queries across
 * twenty repositories. Doubling that for every visitor to look at one number would be a
 * bad trade, so this hook issues **nothing** until `compareWith` is set. The page's own
 * single request is unaffected, and a failure here cannot take the main view down.
 *
 * ## The race
 *
 * The same guard as `usePeriodUrlState`, and for the same reason: two rapid anchor
 * changes issue two requests, and a naive `setData` lets whichever resolves *last* win —
 * so a slow request for last month landing after a fast one for March renders March's
 * numbers under "last month". A monotonic token means only the newest request may write.
 *
 * Both an abort and a token, because they solve different halves. The token guarantees
 * correctness; the abort saves the work. A fetch can resolve in the same tick it is
 * aborted, so the abort alone is not sufficient.
 */

export interface CompareState {
  /** The loaded comparison period, or `null` before one has loaded. */
  data: AnalyticsDashboard | null;
  isLoading: boolean;
  error: string | null;
  /** True while `data` belongs to an earlier anchor than `compareWith`. */
  isStale: boolean;
  clear: () => void;
  retry: () => void;
}

/**
 * One state object rather than four.
 *
 * The reset path sets all of them at once, and four separate `setState` calls in an effect
 * body is both a cascading-render hazard and four renders for one logical change. Holding
 * them together makes the reset atomic and the reset a single call.
 */
interface InternalState {
  data: AnalyticsDashboard | null;
  error: string | null;
  isLoading: boolean;
  settledKey: string;
}

const EMPTY: InternalState = {
  data: null,
  error: null,
  isLoading: false,
  settledKey: '',
};

export function useComparePeriod(
  period: Period,
  currentAnchor: string,
  /** Anchor to compare against, or `null` when comparing is off. */
  compareWith: string | null
): CompareState {
  const [state, setState] = useState<InternalState>(EMPTY);
  const [attempt, setAttempt] = useState(0);

  const key = compareWith ? `${period}|${compareWith}` : '';

  useEffect(() => {
    // Comparing is off, or the anchor is gone. Drop the previous period rather than
    // leaving it on screen under a toggle that says "off".
    if (compareWith === null) {
      // Clearing on an input becoming null is the whole behaviour, and there is no derived
      // value to compute instead. Same pattern and same justification as
      // `usePeriodUrlState`, whose loading flag is set the same way.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(EMPTY);
      return;
    }

    const token = { current: true };
    const controller = new AbortController();
    setState((current) => ({ ...current, isLoading: true }));

    apiRequest<AnalyticsDashboard>(
      `/api/analytics/dashboard?period=${period}&date=${compareWith}`,
      { signal: controller.signal }
    )
      .then((result) => {
        if (!token.current) return;
        setState((current) => ({ ...current, data: result, error: null }));
      })
      .catch((err: unknown) => {
        if (!token.current) return;
        // A superseded request is cancelled by design, not a failure.
        if (err instanceof DOMException && err.name === 'AbortError') return;

        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not load the comparison period';

        // Reported, but never allowed to surface here: the panel shows its own error and
        // a Retry. 401 is the answer to "still signed in", not a fault.
        if (!(err instanceof ApiError && err.status === 401) && err instanceof Error) {
          ErrorReporter.reportClientError(err, undefined, {
            surface: 'useComparePeriod',
            period,
            compareWith,
          });
        }
        setState((current) => ({ ...current, error: message }));
      })
      .finally(() => {
        if (!token.current) return;
        setState((current) => ({
          ...current,
          isLoading: false,
          settledKey: `${period}|${compareWith}`,
        }));
      });

    return () => {
      token.current = false;
      controller.abort();
    };
  }, [period, compareWith, attempt]);

  /*
    Moving to a different period invalidates the comparison entirely — a week cannot be
    compared with a month — so the anchor is discarded rather than reinterpreted.
  */
  const anchorPeriodKey = `${period}|${currentAnchor}`;
  const lastSeen = useRef(anchorPeriodKey);
  useEffect(() => {
    if (lastSeen.current === anchorPeriodKey) return;
    lastSeen.current = anchorPeriodKey;
    setAttempt(0);
  }, [anchorPeriodKey]);

  return {
    data: state.data,
    isLoading: state.isLoading,
    error: state.error,
    isStale: state.data !== null && state.settledKey !== key,
    clear: useCallback(() => setState(EMPTY), []),
    retry: useCallback(() => setAttempt((n) => n + 1), []),
  };
}

/**
 * Validate a comparison anchor from the URL.
 *
 * Same rule as the main anchor, and for the same reason: a hand-edited `cmp` must not
 * produce a request the server will reject, and `2026-13-45` would pass a shape check and
 * then become a `NaN` in every average computed from it.
 *
 * Also refuses a future anchor. "Compare with next week" has no answer, and offering it
 * would produce an empty panel that looks like a bug rather than an impossibility.
 */
export function parseCompareAnchor(
  raw: string | null,
  today: string
): string | null {
  if (!isCalendarDate(raw)) return null;
  if (raw > today) return null;
  return raw;
}
