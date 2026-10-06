'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getPeriodRange, resolveWeekStartsOn, type Period } from '@/lib/period-range';
import { isCalendarDate } from '@/lib/dates';
import { ApiError } from '@/lib/api-client';
import { ErrorReporter } from '@/lib/monitoring/error-reporter';

/**
 * A reporting period held in the URL, with its own fetch and its own race guard.
 *
 * ## Why the URL
 *
 * `/analytics` kept `period` and `anchorDate` in component state. That made the
 * page impossible to link to, impossible to bookmark, and impossible to reach with
 * the back button: a user who looked at last month's habits and pressed back
 * landed on "today" with no sign that anything had happened. For a *reporting*
 * surface, a reload silently resetting the view is the one thing that must not
 * happen — the view is the result, not a transient UI state.
 *
 * ## The race this also fixes
 *
 * Two rapid period changes issue two requests. A naive `setData(result)` lets
 * whichever response arrives **last** win, so a slow week request landing after a
 * fast day request renders the week's numbers under a "Today" heading. Every load
 * takes a monotonically increasing token and only the newest token may write.
 * Aborting the request too would be tidier, but the token is what actually
 * guarantees correctness: a fetch can resolve in the same tick it is aborted.
 *
 * ## Stale data is shown, but labelled
 *
 * While the new period loads, the previous period stays on screen and
 * `isStale` is true, so the page can dim it and say "updating". Blanking the
 * screen on every arrow click destroys the sense of a continuous surface, and
 * showing the old numbers with no signal at all is how you end up reading last
 * week's average as today's.
 *
 * ## Invalid input is ignored, not obeyed
 *
 * `?period=quarter` does not become a quarter and `?date=not-a-date` does not
 * become `NaN`. Unparseable values are dropped from the URL and the default is
 * used, because a shared link that renders someone else's garbage is worse than
 * one that quietly lands on today.
 */

function isPeriod(value: string | null): value is Period {
  return value === 'day' || value === 'week' || value === 'month' || value === 'year';
}

/*
 * The shared calendar-date rule, not a local copy of it.

 * A shape regex accepts `2026-13-45`, and this hook is the only thing standing
 * between a hand-edited or stale link and a request the server would have to
 * refuse. Sharing the predicate means the URL is cleaned up on exactly the inputs
 * the API rejects — if the two ever disagreed, the client would keep a parameter
 * the server 400s on and the page would show an error for a link it had just
 * decided was fine.
 */
function isDate(value: string | null): value is string {
  return isCalendarDate(value);
}

/**
 * Whether a failure is worth telling monitoring about.
 *
 * Three outcomes reach this hook's `catch` and only one of them is a fault:
 *
 *  - **Aborts.** Superseded requests are cancelled by design. `api-client`
 *    rethrows `AbortError` untouched precisely so it can be told apart here.
 *  - **401.** The answer to "are you still signed in", not an error. Reporting it
 *    would bury real failures under the ordinary churn of an expired session.
 *  - **429.** Reported on purpose. The dashboard limiter is generous enough that
 *    hitting it means something is hammering the endpoint, and that is exactly
 *    what should show up.
 */
function reportableFailure(err: unknown): Error | null {
  if (err instanceof DOMException && err.name === 'AbortError') return null;
  if (err instanceof ApiError && err.status === 401) return null;
  return err instanceof Error ? err : null;
}

export interface PeriodUrlState<T> {
  period: Period;
  anchorDate: string;
  /** `null` until the first successful load. */
  data: T | null;
  error: string | null;
  /** True while a request for the *currently selected* period is in flight. */
  isLoading: boolean;
  /** True while `data` still belongs to an earlier period than the controls. */
  isStale: boolean;
  /** Label for the resolved range; `null` before the first load. */
  label: string | null;
  setPeriod: (period: Period) => void;
  /** Step one period back/forward from the current anchor. */
  step: (delta: number) => void;
  reset: () => void;
  retry: () => void;
}

/**
 * The weekday the client should resolve weeks against.
 *
 * Prefers the value the **server** resolved, because that is the authoritative one
 * and it is present in the very first successful response. Falling back to the
 * caller's default covers the window before that first load settles, which is the
 * only time this can be wrong — and stepping to a slightly wrong anchor is benign
 * next to disagreeing with the range the server is about to render.
 */
export interface PeriodUrlDefaults<T> {
  period: Period;
  today: string;
  timezone: string;
  /** Used until the first response reports its own; see `readWeekStartsOn`. */
  weekStartsOn?: number;
  /**
   * How to read the resolved weekday back out of a loaded payload.
   *
   * A function rather than a value, and that is the whole point: the hook owns
   * `data`, so the caller cannot hand it a value derived from `data` without
   * creating a cycle in its own initialiser. Passing a reader keeps the hook
   * generic over `T` while letting the authoritative server value win as soon as
   * it exists.
   */
  readWeekStartsOn?: (data: T) => number | null | undefined;
}

export function usePeriodUrlState<T>(
  fetcher: (period: Period, anchorDate: string) => Promise<T>,
  defaults: PeriodUrlDefaults<T>
): PeriodUrlState<T> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlPeriod = searchParams.get('period');
  const urlDate = searchParams.get('date');

  const period: Period = isPeriod(urlPeriod) ? urlPeriod : defaults.period;
  const anchorDate = isDate(urlDate) ? urlDate : defaults.today;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [settledKey, setSettledKey] = useState<string>('');
  const [attempt, setAttempt] = useState(0);

  /*
    The latest fetcher, in a ref that is never written during render.

    Writing `fetcherRef.current = fetcher` in the render body is a render-phase
    mutation: a discarded concurrent render would leave the ref holding a fetcher
    that never committed, and the effect below would call it. Assigning in an effect
    keeps the ref to committed values only.

    The effect that reads it is declared after this one, so on the commit where
    `fetcher` changes the ref is updated before anything can call it.
  */
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const key = `${period}|${anchorDate}`;

  useEffect(() => {
    // The token is the whole race guard: the cleanup flips it, so a superseded
    // response can neither write data nor clear the loading flag for the request
    // that replaced it.
    const token = { current: true };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the loading flag is the point of the effect
    setIsLoading(true);

    fetcherRef
      .current(period, anchorDate)
      .then((result) => {
        if (!token.current) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!token.current) return;
        /*
          The previous period's data is deliberately left in place: an error on
          refresh should not blank a page the user was reading, and `isStale`
          keeps it honest. It is cleared only when a load succeeds.
        */
        const reportable = reportableFailure(err);
        if (reportable) {
          ErrorReporter.reportClientError(reportable, undefined, {
            surface: 'usePeriodUrlState',
            period,
            anchorDate,
          });
        }
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      })
      .finally(() => {
        if (!token.current) return;
        setIsLoading(false);
        setSettledKey(`${period}|${anchorDate}`);
      });

    return () => {
      token.current = false;
    };
  }, [period, anchorDate, attempt, fetcherRef]);

  // Drop parameters we refuse to honour, so the address bar always describes what
  // is rendered. `replace`, not `push`: a typo should not cost a back-button entry.
  useEffect(() => {
    const invalidPeriod = urlPeriod !== null && !isPeriod(urlPeriod);
    const invalidDate = urlDate !== null && !isDate(urlDate);
    if (!invalidPeriod && !invalidDate) return;
    const params = new URLSearchParams(searchParams.toString());
    if (invalidPeriod) params.delete('period');
    if (invalidDate) params.delete('date');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [urlDate, urlPeriod, searchParams, pathname, router]);

  const commit = useCallback(
    (nextPeriod: Period, nextDate: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('period', nextPeriod);
      params.set('date', nextDate);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  /*
    The weekday every client-side range calculation uses.

    Read from the loaded response when it exposes one, otherwise from the caller's
    setting. Both go through `resolveWeekStartsOn`, so a malformed value from
    either source degrades to Monday instead of producing an empty or eight-day
    week locally.
  */
  const weekStartsOn = resolveWeekStartsOn(
    data === null ? defaults.weekStartsOn : defaults.readWeekStartsOn?.(data)
  );

  const setPeriod = useCallback(
    (next: Period) => {
      /*
        Keep the anchor inside the newly selected period.

        Switching from a month to a day would otherwise pin the day to the 1st and
        drop the user on a date they never asked about. Re-deriving from the new
        period keeps the visible date honest about where it sits.
      */
      commit(next, getPeriodRange(next, anchorDate, defaults.timezone, weekStartsOn).start);
    },
    [anchorDate, commit, defaults.timezone, weekStartsOn]
  );

  const step = useCallback(
    (delta: number) => {
      const range = getPeriodRange(period, anchorDate, defaults.timezone, weekStartsOn);
      commit(period, delta < 0 ? range.prev : range.next);
    },
    [anchorDate, commit, defaults.timezone, period, weekStartsOn]
  );

  const reset = useCallback(() => {
    commit(period, defaults.today);
  }, [commit, defaults.today, period]);

  const label = useMemo(() => {
    if (data === null) return null;
    return getPeriodRange(period, anchorDate, defaults.timezone, weekStartsOn).label;
  }, [anchorDate, data, defaults.timezone, period, weekStartsOn]);

  return {
    period,
    anchorDate,
    data,
    error,
    isLoading,
    isStale: data !== null && settledKey !== key,
    label,
    setPeriod,
    step,
    reset,
    retry: useCallback(() => setAttempt((n) => n + 1), []),
  };
}