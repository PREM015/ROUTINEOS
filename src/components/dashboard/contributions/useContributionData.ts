'use client';

/**
 * The Consistency card's data: one fetch, one dense map, two views.
 *
 * The layout maths it feeds lives in `@/lib/dashboard/contributions`, which is
 * pure and unit-tested. This module is only the fetching, the densifying and the
 * timezone anchor.
 *
 * ## The timezone anchor
 *
 * `today` comes from `useUserTimezone()`, which reads the settings store
 * `useSettingsLoader` has already populated. Deliberately NOT from
 * `new Date()` and NOT from storage: a grid anchored to the host's or the
 * device's date shifts by a whole day for anyone outside it, which is exactly how
 * this grid previously rendered an empty most-recent column and a phantom future
 * one. The fetch also waits for that value rather than racing it, so the year is
 * not fetched twice.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { heatLevel } from '@/components/dashboard-ui/tokens';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { shiftCalendarDay } from '@/lib/dates';
import {
  WINDOW_DAYS,
  yearsInWindow,
  type ContributionDay,
} from '@/lib/dashboard/contributions';

export function useContributionData() {
  const { today, isLoading: timezoneLoading } = useUserTimezone();

  const [days, setDays] = useState<ContributionDay[]>([]);
  const [loading, setLoading] = useState(true);
  /** History could not load; the grid renders blank without saying why. */
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (timezoneLoading) return;
    let cancelled = false;

    void (async () => {
      try {
        const start = shiftCalendarDay(today, -WINDOW_DAYS);
        const res = await fetch(`/api/scores/daily?startDate=${start}&endDate=${today}`);

        if (!res.ok) {
          throw new Error(`Could not load your history (status ${res.status})`);
        }
        const result = await res.json();

        if (!result.success) {
          throw new Error(result.error || 'Could not load your history');
        }
        if (cancelled) return;

        setDays(
          (result.data as { date: string; totalScore: number | null }[]).map((row) => ({
            date: row.date,
            score: row.totalScore,
            level: heatLevel(row.totalScore),
          }))
        );
        setError(null);
      } catch (err) {
        // Previously `console.error` only: a failed request left the grid blank,
        // which reads as "you have no history" rather than "this did not load".
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load your history');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [today, nonce, timezoneLoading]);

  /**
   * A dense map, so both views can ask about any date without caring whether a
   * `DailyScore` row exists. Missing days are present with `score: null` rather
   * than absent, which is what lets the month view print a number in every real
   * cell while the year view leaves a visible break.
   */
  const byDate = useMemo(() => {
    const map = new Map<string, ContributionDay>();
    for (const day of days) map.set(day.date, day);
    return map;
  }, [days]);

  const years = useMemo(() => yearsInWindow(byDate), [byDate]);

  return { days, byDate, years, today, loading, error, retry };
}

export type { ContributionDay } from '@/lib/dashboard/contributions';
