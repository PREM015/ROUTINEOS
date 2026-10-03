'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, ApiError } from '@/lib/api-client';
import type { RoutineProgressResponse } from '@/types/routine';

/**
 * The week behind the rail, for `/routine`.
 *
 * ## One fetch, two surfaces
 *
 * `WeekPattern` and `DayTypePerformance` are two views of this single payload,
 * so they share this hook rather than each issuing `GET /api/routine/progress`.
 * That matters more here than on the day view: the endpoint is a 3-query
 * aggregate over templates, exceptions and logs, and two copies of it would be
 * two copies of that cost for two renderings of the same week.
 *
 * ## Refetched on date change
 *
 * `date` is in the URL, so moving a day moves the week. The anchor is the
 * selected date rather than "today", so a user parked on a date three weeks ago
 * sees that week — the same rule the day view follows. Weeks start Monday
 * (`getPeriodRange`), so only a week boundary triggers a new response.
 *
 * ## Stale data is kept on failure
 *
 * Same rule as `useRoutineDay`: a failed refetch must not blank a rail the user
 * is already reading. The previous response stays and `error` is set alongside
 * it, so the surfaces can stay silent rather than flashing an empty state.
 *
 * `error` surfaces but does not block. The two surfaces are supplementary —
 * losing them degrades the rail, it does not break the page.
 */

export interface WeekPatternState {
  data: RoutineProgressResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useWeekPattern(date: string, timezone: string): WeekPatternState {
  const [data, setData] = useState<RoutineProgressResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guards a slow response from overwriting a newer one. `useRoutineDay` solves
  // this with an abort flag; a ref is used here because the week is fetched far
  // less often and the sequencing is simpler to read this way.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    try {
      const result = await apiRequest<RoutineProgressResponse>(
        `/api/routine/progress?period=week&date=${encodeURIComponent(date)}`
      );
      if (id !== requestId.current) return;
      setData(result);
      setError(null);
    } catch (caught) {
      if (id !== requestId.current) return;
      // Same three-way split as `useRoutineDay`: offline, a real API error
      // (which carries its own message), and an unexpected throw.
      if (caught instanceof ApiError && caught.status === 0) {
        setError('You appear to be offline. This week may be out of date.');
      } else if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError('Could not load this week');
      }
      // `data` is deliberately left alone. See the docblock.
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load, timezone]);

  return { data, isLoading, error, refetch: load };
}

export default useWeekPattern;
