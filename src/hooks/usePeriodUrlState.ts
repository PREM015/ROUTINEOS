'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getPeriodRange, type Period } from '@/lib/period-range';

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

function isDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
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

export function usePeriodUrlState<T>(
  fetcher: (period: Period, anchorDate: string) => Promise<T>,
  defaults: { period: Period; today: string; timezone: string }
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
        // The previous period's data is deliberately left in place: an error on
        // refresh should not blank a page the user was reading, and `isStale`
        // keeps it honest. It is cleared only when a load succeeds.
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

  const setPeriod = useCallback(
    (next: Period) => {
      /*
        Keep the anchor inside the newly selected period.

        Switching from a month to a day would otherwise pin the day to the 1st and
        drop the user on a date they never asked about. Re-deriving from the new
        period keeps the visible date honest about where it sits.
      */
      commit(next, getPeriodRange(next, anchorDate, defaults.timezone).start);
    },
    [anchorDate, commit, defaults.timezone]
  );

  const step = useCallback(
    (delta: number) => {
      const range = getPeriodRange(period, anchorDate, defaults.timezone);
      commit(period, delta < 0 ? range.prev : range.next);
    },
    [anchorDate, commit, defaults.timezone, period]
  );

  const reset = useCallback(() => {
    commit(period, defaults.today);
  }, [commit, defaults.today, period]);

  const label = useMemo(() => {
    if (data === null) return null;
    return getPeriodRange(period, anchorDate, defaults.timezone).label;
  }, [anchorDate, data, defaults.timezone, period]);

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