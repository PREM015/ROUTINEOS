'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest, ApiError } from '@/lib/api-client';
import type { DayTypeDefinition } from '@/types/routine';
import type { DayType } from '@/generated/prisma';
import { slugToDayType } from '@/constants/routine';

/**
 * The user's day types, fetched once for the whole page.
 *
 * `GET /api/day-types` returns **archived rows too**, because the management
 * surface needs to list and restore them. A picker needs the active subset. The
 * endpoint filters server-side via `?active=true` but drops the usage counts,
 * and the counts are exactly what `AppliesToCard` renders — so this asks for the
 * full management list and derives the active subset here, rather than making
 * two requests or losing the counts.
 *
 * ## Failure is a first-class state
 *
 * `error` is set instead of quietly substituting the canonical six built-in day
 * types. Rendering the fallbacks on a failed request tells a user with five
 * custom day types that they have six built-in ones and none of their own, and
 * the page would then invite them to create duplicates. The tab strip shows the
 * error and the *already-resolved* day type still works, because that comes from
 * the day payload rather than from this list.
 */
export interface DayTypesState {
  dayTypes: DayTypeDefinition[];
  /** Non-archived, in display order. */
  active: DayTypeDefinition[];
  /** Archived, for the "Manage" list. */
  archived: DayTypeDefinition[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/** The enum classification a definition maps to. Never used as an identity. */
export function dayTypeValueOf(definition: DayTypeDefinition): DayType {
  return slugToDayType(definition.slug);
}

export function useDayTypes(): DayTypesState {
  const [dayTypes, setDayTypes] = useState<DayTypeDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await apiRequest<DayTypeDefinition[]>('/api/day-types');
      setDayTypes(Array.isArray(result) ? result : []);
      setError(null);
    } catch (caught) {
      // No fallback list. An empty strip plus this message is honest; the
      // canonical defaults would not be.
      setDayTypes([]);
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Day types could not be loaded. The schedule below is still correct for this date.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  return {
    dayTypes,
    active: dayTypes.filter((dayType) => !dayType.isArchived),
    archived: dayTypes.filter((dayType) => dayType.isArchived),
    isLoading,
    error,
    refetch: load,
  };
}