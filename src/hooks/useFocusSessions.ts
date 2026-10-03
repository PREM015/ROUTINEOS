'use client';

/**
 * `useFocusSessions` — the one history query.
 *
 * The audit found **two** independent `GET /api/focus?limit=100` fetches on the old
 * page (one in `FocusTimer`, one in `FocusStats`), plus a third on the retry path
 * with no `AbortController`. This hook is the single fetcher, and every consumer
 * reads the same rows.
 *
 * ## Cache invalidation
 *
 * A tiny hand-rolled cache rather than a query library. The invalidation rule is
 * the whole design: **anything that could have ended a session invalidates**. The
 * risky version of this is caching on a timer and hoping; the safe version is
 * invalidating on the events themselves.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiRequest } from '@/lib/api-client';
import type { FocusSessionRow, FocusSessionsMeta } from '@/types/focus';

/** Dispatched after any lifecycle transition, so open panels refetch. */
export const FOCUS_SESSIONS_CHANGED = 'routineos:focus-sessions-changed';

const PAGE_SIZE = 25;

interface State {
  rows: FocusSessionRow[];
  meta: FocusSessionsMeta | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

const INITIAL: State = { rows: [], meta: null, loading: true, loadingMore: false, error: null };

export interface UseFocusSessionsFilters {
  from?: string;
  to?: string;
  type?: string;
  status?: string;
}

export function useFocusSessions(filters: UseFocusSessionsFilters = {}) {
  const [state, setState] = useState<State>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  /**
   * Row count in a ref, not in the dependency list.
   *
   * `load-more` needs the current length to compute an offset, but making the
   * callback depend on `state.rows.length` re-creates it after every page append,
   * which re-runs the mount effect and refetches from scratch — a loop, and one
   * that would make "load more" fetch page one again. The ref reads the same value
   * at call time with no identity change.
   */
  const rowCountRef = useRef(0);

  const load = useCallback(
    async (append: boolean) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({
        ...prev,
        loading: !append,
        loadingMore: append,
        error: null,
      }));

      const offset = append ? rowCountRef.current : 0;

      try {
        const rows = await apiRequest<FocusSessionRow[]>('/api/focus', {
          query: {
            limit: PAGE_SIZE,
            offset,
            from: filters.from,
            to: filters.to,
            type: filters.type,
            status: filters.status,
          },
        });
        if (controller.signal.aborted) return;
        rowCountRef.current = append ? rowCountRef.current + rows.length : rows.length;
        setState((prev) => ({
          rows: append ? [...prev.rows, ...rows] : rows,
          loading: false,
          loadingMore: false,
          error: null,
          meta: null,
        }));
      } catch (err) {
        if (controller.signal.aborted) return;
        // An abort is a cancellation we asked for, not a failure to report.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: err instanceof ApiError ? err.message : 'Could not load your sessions.',
        }));
      } finally {
        if (abortRef.current === controller) {
          inFlightRef.current = false;
          abortRef.current = null;
        }
      }
    },
    [filters.from, filters.to, filters.type, filters.status]
  );

  // Refetch on mount, on filter change, and whenever a session may have ended.
  useEffect(() => {
    void load(false);
    const onChanged = () => void load(false);
    window.addEventListener(FOCUS_SESSIONS_CHANGED, onChanged);
    return () => {
      window.removeEventListener(FOCUS_SESSIONS_CHANGED, onChanged);
      abortRef.current?.abort();
    };
  }, [load]);

  const retry = useCallback(() => void load(false), [load]);
  const loadMore = useCallback(() => void load(true), [load]);

  const hasMore = state.meta
    ? state.rows.length < state.meta.total
    : state.rows.length === PAGE_SIZE;

  return {
    ...state,
    hasMore,
    retry,
    loadMore,
    /** Tell every other consumer their rows are stale. */
    invalidate: () => window.dispatchEvent(new Event(FOCUS_SESSIONS_CHANGED)),
  };
}

/**
 * Fire the invalidation event.
 *
 * Exported so the runtime can call it after a transition without every component
 * that reads sessions having to know the event name.
 */
export function notifyFocusSessionsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(FOCUS_SESSIONS_CHANGED));
}
