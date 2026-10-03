'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, ApiError } from '@/lib/api-client';
import type { DayOverride } from '@/types/routine';

/**
 * The user's day-type overrides, for `/routine`'s rail.
 *
 * ## What this is not
 *
 * Only `DAY_TYPE` mode in `DayModeDialog` writes a `RoutineException`. `REST` and
 * `MINIMUM` set `isRestDay` / `isMinimumDay` on the `DailyScore` row and leave
 * no exception, and `CLEAR` deletes it. So a rest day is **absent from this
 * list by design**, not lost. The card is titled "Day-type overrides" for the
 * same reason — a card called "Overridden days" that silently omitted every
 * rest day would be the exact half-truth this page has been removing.
 *
 * ## Refreshed on date change
 *
 * A date change is a navigation, not a mutation, so the list is refetched rather
 * than cached. It is one indexed query on `(userId, date)`.
 *
 * ## Stale data survives a failure
 *
 * Same rule as `useRoutineDay` and `useWeekPattern`: a failed refetch must not
 * blank a card the user is reading. `data` is left in place and `error` is set
 * beside it.
 */
export interface DayOverridesState {
  data: DayOverride[] | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDayOverrides(): DayOverridesState {
  const [data, setData] = useState<DayOverride[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    try {
      const result = await apiRequest<DayOverride[]>('/api/routine/exceptions');
      if (id !== requestId.current) return;
      setData(result);
      setError(null);
    } catch (caught) {
      if (id !== requestId.current) return;
      if (caught instanceof ApiError && caught.status === 0) {
        setError('You appear to be offline.');
      } else if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError('Could not load your overrides');
      }
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, isLoading, error, refetch: load };
}

export default useDayOverrides;
