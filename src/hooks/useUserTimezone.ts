'use client';

import { useMemo } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { DEFAULT_TZ, getTodayString } from '@/lib/dates';

/**
 * The signed-in user's timezone, and their "today".
 *
 * `settings.timezone` is already loaded on every dashboard page by
 * `useSettingsLoader` (`src/components/auth/AuthProvider.tsx`), so nothing new
 * is fetched here. Before this hook existed the value sat in the store unused:
 * every client component called `getTodayString()` with no argument and got
 * the hard-coded `Asia/Kolkata` default, so a user in `America/New_York` saw
 * *tomorrow's* date between local midnight and 05:30 — wrong checkboxes on the
 * Today page and the wrong day's score.
 *
 * Falls back to the browser's own zone while settings are still loading, then
 * to `DEFAULT_TZ`, rather than committing to IST.
 */
export function useUserTimezone(): {
  timezone: string;
  today: string;
  /** False while the authoritative value is still in flight. */
  isLoading: boolean;
} {
  const { settings, loading } = useSettings();

  return useMemo(() => {
    const fromSettings = settings?.timezone?.trim();
    const fromBrowser = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
      } catch {
        return undefined;
      }
    })();

    const timezone = fromSettings || fromBrowser || DEFAULT_TZ;

    return { timezone, today: getTodayString(timezone), isLoading: loading };
  }, [settings?.timezone, loading]);
}

export default useUserTimezone;
