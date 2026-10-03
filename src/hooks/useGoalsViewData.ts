'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import {
  buildConsistency,
  buildSparkline,
  computeGoalPace,
  addDays,
  type ConsistencySummary,
  type GoalPace,
  type ProgressPoint,
} from '@/lib/goals/goal-metrics';
import type { Goal } from '@/context/AppContext';

/**
 * Everything the `/goals` page renders that is **not** already on the `Goal`
 * row: pace, streaks, sparkline points, and today's check-in state.
 *
 * ## Why one range request rather than one history request per goal
 *
 * Pace needs velocity; velocity needs the log; and the log is a `GoalProgress`
 * row per entry. The naive shape is `GET /api/goals/[id]/history` per goal — a
 * request per card, on a page whose whole point is to show fifteen of them at
 * once. Fifteen round trips before a single card has a streak.
 *
 * Instead one request covers the whole 30-day window across every goal, and the
 * purely-derived parts (`computeGoalPace`, `buildConsistency`) are computed here
 * from that. The goals list itself still comes from `AppContext`, so there is
 * exactly one source of truth for the rows; this hook only *decorates* them.
 *
 * ## Loading honesty
 *
 * `paceFor` and `consistencyFor` return `null` while the range is in flight, and
 * the page renders skeletons for exactly those. They do not default to
 * `on_pace`/empty, because "we have not asked yet" and "nothing is recorded" are
 * different facts and the first one used to render as the second.
 */

const HEAT_STRIP_DAYS = 30;

interface RangeRow {
  goalId: string;
  value: number;
  date: string;
  note?: string | null;
}

interface TodayRow {
  id: string;
  loggedToday: number | null;
  appliesEveryDay: boolean;
}

export interface GoalsViewData {
  /** Pace per goal id, or `null` while the log window is loading. */
  paceFor: (goalId: string) => GoalPace | null;
  consistencyFor: (goalId: string) => ConsistencySummary | null;
  /** Progress-log rows for one goal, for the drawer's sparkline and history. */
  pointsFor: (goalId: string) => ProgressPoint[];
  /** `doneToday` per goal id, from `GET /api/goals/today`. */
  doneToday: (goalId: string) => boolean;
  /** `buildSparkline` output for one goal, for the card's inline trajectory. */
  shapeFor: (goalId: string) => Array<{ date: string; value: number | null }>;
  /** `true` while the range request is in flight. */
  loadingLog: boolean;
  /** Non-null when the range request failed. Decoration degrades; the page does not. */
  logError: string | null;
  /** Re-reads the log window. Called after a write that should move a streak. */
  refreshLog: () => void;
}

export function useGoalsViewData(goals: Goal[]): GoalsViewData {
  const { today } = useUserTimezone();

  const [rows, setRows] = useState<RangeRow[]>([]);
  const [todayRows, setTodayRows] = useState<Map<string, boolean>>(new Map());
  const [loadingLog, setLoadingLog] = useState(true);
  const [logError, setLogError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * Goals are read from context, so the range request is keyed on the set of ids
   * rather than the array identity — context re-creates `goals` on every
   * optimistic write, and refetching a 30-day log for each would be a request
   * per keystroke in a slider.
   */
  const goalKey = useMemo(() => goals.map((g) => g.id).join(','), [goals]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setLoadingLog(true);
      setLogError(null);

      // `[today - 29, tomorrow)` — half-open, so today's row is included and
      // tomorrow's is not.
      const from = addDays(today, -(HEAT_STRIP_DAYS - 1));
      const to = addDays(today, 1);

      try {
        const [range, todayData] = await Promise.all([
          apiRequest<RangeRow[]>('/api/goals/progress-range', {
            query: { from, to },
          }),
          apiRequest<TodayRow[]>('/api/goals/today', { query: { date: today } }),
        ]);

        if (cancelled) return;

        setRows(range ?? []);
        const done = new Map<string, boolean>();
        for (const row of todayData ?? []) {
          // `loggedToday` is the day's most recent row's raw value. A cleared
          // check-in deletes the row outright, so a row existing at all means
          // done — but a `0` from an older client is still treated as not-done
          // rather than as done.
          done.set(row.id, row.loggedToday !== null && row.loggedToday > 0);
        }
        setTodayRows(done);
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setLogError(
          error instanceof Error ? error.message : 'Failed to load goal history'
        );
      } finally {
        if (!cancelled) setLoadingLog(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [today, goalKey, reloadToken]);

  /** Index the log once per load rather than filtering it per goal per render. */
  const byGoal = useMemo(() => {
    const index = new Map<string, ProgressPoint[]>();
    for (const row of rows) {
      const list = index.get(row.goalId);
      const point: ProgressPoint = { date: row.date, value: row.value, note: row.note };
      if (list) list.push(point);
      else index.set(row.goalId, [point]);
    }
    return index;
  }, [rows]);

  const paceFor = useCallback(
    (goalId: string): GoalPace | null => {
      if (loadingLog) return null;

      const goal = goals.find((g) => g.id === goalId);
      if (!goal) return null;

      return computeGoalPace(
        {
          startDate: goal.startDate,
          endDate: goal.endDate,
          currentValue: goal.currentValue,
          targetValue: goal.targetValue,
          status: goal.status,
        },
        today,
        byGoal.get(goalId) ?? []
      );
    },
    [goals, today, byGoal, loadingLog]
  );

  const consistencyFor = useCallback(
    (goalId: string): ConsistencySummary | null => {
      if (loadingLog) return null;

      const goal = goals.find((g) => g.id === goalId);
      if (!goal) return null;

      return buildConsistency(
        {
          startDate: goal.startDate,
          endDate: goal.endDate,
          currentValue: goal.currentValue,
          targetValue: goal.targetValue,
          status: goal.status,
        },
        byGoal.get(goalId) ?? [],
        today,
        HEAT_STRIP_DAYS
      );
    },
    [goals, today, byGoal, loadingLog]
  );

  const pointsFor = useCallback(
    (goalId: string) => byGoal.get(goalId) ?? [],
    [byGoal]
  );

  /**
   * Sparkline shape, derived once per load per goal rather than once per render
   * per card.
   *
   * The card grid renders the same goal id in up to two places at once (the
   * needs-attention rail and the main list can both contain it), and
   * `buildSparkline` walks the whole 30-day window each time. Memoising by goal id
   * turns that into one derivation per goal per load.
   */
  const shapes = useMemo(() => {
    const cache = new Map<string, Array<{ date: string; value: number | null }>>();
    for (const goal of goals) {
      if (loadingLog) continue;
      cache.set(
        goal.id,
        buildSparkline(
          byGoal.get(goal.id) ?? [],
          {
            startDate: goal.startDate,
            endDate: goal.endDate,
            currentValue: goal.currentValue,
            targetValue: goal.targetValue,
            status: goal.status,
          },
          today
        )
      );
    }
    return cache;
  }, [goals, byGoal, today, loadingLog]);

  const shapeFor = useCallback(
    (goalId: string) => shapes.get(goalId) ?? [],
    [shapes]
  );

  const doneToday = useCallback((goalId: string) => todayRows.get(goalId) ?? false, [todayRows]);

  const refreshLog = useCallback(() => setReloadToken((n) => n + 1), []);

  return {
    paceFor,
    consistencyFor,
    pointsFor,
    shapeFor,
    doneToday,
    loadingLog,
    logError,
    refreshLog,
  };
}