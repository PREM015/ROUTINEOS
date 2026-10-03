'use client';

/**
 * One fetch, one result, shared by every trend-shaped widget on `/dashboard`.
 *
 * Momentum, Weekly Recap, Weekly Adherence, Life Balance radar, Day-Type
 * Performance and Goals Velocity are all functions of the same trailing window,
 * so they share one request through this provider.
 *
 * ## Why a provider and not a plain hook
 *
 * A plain `useDashboardOverview()` called from six components issues six
 * identical requests. That is precisely the failure mode the audit recorded as
 * F15 — the old page polled `/api/routine/today` twice and `/api/habits/today`
 * twice, and two independent computations of one number could disagree. A
 * provider makes the sharing structural instead of a convention.
 *
 * ## Failure is contained, not propagated
 *
 * `error` is per-consumer. Each widget decides for itself whether it can still
 * render something honest. The heatmap and the achievements strip do not read
 * this provider at all, so a failure here costs six cards, not the page.
 *
 * The window is always the full 30 days. The Momentum 7d/30d toggle slices it
 * client-side rather than refetching — that toggle sits on the hero card, and a
 * round trip there would read as the chart hanging.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiRequest } from '@/lib/api-client';
import { DEFAULT_WINDOW_DAYS } from '@/constants/dashboard';
import type { DashboardOverview } from '@/types/dashboard';

export interface DashboardOverviewState {
  data: DashboardOverview | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const DashboardOverviewContext = createContext<DashboardOverviewState | null>(null);

export function DashboardOverviewProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    /*
      State is set inside the promise callbacks, never synchronously in the effect
      body. That keeps the effect a genuine "subscribe to an external system"
      rather than a synchronous cascade, and the `cancelled` flag closes the
      setState-after-unmount race the previous version had: a slow response
      arriving after the user navigated away would still try to update an
      unmounted provider.
    */
    apiRequest<DashboardOverview>(`/api/dashboard/overview?days=${DEFAULT_WINDOW_DAYS}`)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load your dashboard');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  /*
    Refetch when the tab comes back.

    Without this the provider fetches once on mount and never again, so a
    dashboard left open across lunch — or overnight — shows a stale streak, a
    stale radar and a stale heatmap, and nothing on the page says so. The user
    has to know to reload, which is not a thing anyone does to a dashboard they
    are looking at.

    `visibilitychange` rather than a poll: these numbers change when the user
    acts, and the actions are on other pages. Coming back to the tab is the
    moment the data is actually wanted, so that is when it is worth a request.
    A poll would cost the same request every 30s to answer a question nobody
    asked yet.

    Guarded on `document.visibilityState === 'visible'` so a backgrounded tab
    does not fire the request the moment it is switched to.
  */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setNonce((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const value = useMemo<DashboardOverviewState>(
    () => ({
      data,
      loading,
      error,
      reload: () => {
        setLoading(true);
        setError(null);
        setNonce((n) => n + 1);
      },
    }),
    [data, loading, error]
  );

  return (
    <DashboardOverviewContext.Provider value={value}>{children}</DashboardOverviewContext.Provider>
  );
}

/**
 * Read the shared overview.
 *
 * Throws outside the provider rather than silently issuing a second request —
 * a widget that forgot the provider should fail loudly in development, not
 * quietly quadruple the page's network traffic.
 */
export function useDashboardOverview(): DashboardOverviewState {
  const ctx = useContext(DashboardOverviewContext);
  if (ctx === null) {
    throw new Error('useDashboardOverview must be used inside <DashboardOverviewProvider>');
  }
  return ctx;
}
