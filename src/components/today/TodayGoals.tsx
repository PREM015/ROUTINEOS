'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { Progress } from '@/components/ui/Progress';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Mount } from '@/components/motion/Mount';
import { calendarDaysBetween } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { GoalPriority, GoalType } from '@/generated/prisma';
import { GlassPanel } from '@/components/today/ui';
import { actionToast, errorToast } from '@/components/today/celebration';

interface TodayGoal {
  id: string;
  title: string;
  type: GoalType;
  priority: GoalPriority;
  currentValue: number;
  targetValue: number;
  unit: string | null;
  endDate: string;
  appliesEveryDay: boolean;
  loggedToday: number | null;
}

interface TodayGoalsProps {
  date: string;
}

/**
 * Whole days from `today` until `endDate`.
 *
 * Both operands are pure `YYYY-MM-DD` calendar labels, so they are stepped with
 * `shiftCalendarDay` rather than by subtracting `Date` millis. The previous
 * `new Date(endDate).getTime() - new Date(dateStr()).getTime()` parsed
 * `dateStr()` (a UTC date string) as **local** midnight, so the difference was
 * short by the host's UTC offset and every count was off by up to a day.
 */
function daysRemaining(endDate: string, today: string): number {
  return Math.max(0, calendarDaysBetween(today, endDate));
}

export function TodayGoals({ date }: TodayGoalsProps) {
  const [goals, setGoals] = useState<TodayGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGoals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/goals/today?date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load goals');

      if (data.success) {
        // Goals already filtered by eligibility (day type, schedule, etc.)
        const list: TodayGoal[] = Array.isArray(data.data) ? data.data : [];
        setGoals(list.slice(0, 5));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load goals');
    } finally {
      setLoading(false);
    }
   
  }, [date]);

  // Initial data fetch when the date changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- date-driven data fetch
    fetchGoals();
  }, [fetchGoals]);

  /**
   * 2.8 â€” the daily check-off, with the same toast + Undo the habit card uses.
   *
   * The card was entirely read-only: `loggedToday` was fetched from
   * `/api/goals/today` and never acted on, so a DAILY goal showed "Not done
   * today" on `/today` with no way to change it, while `/dashboard` could tick
   * the same goal. The optimistic update is reverted on failure and the Undo
   * action re-posts the previous value, so the card never drifts from the
   * server because of a stale local edit.
   */
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleGoalDone = useCallback(
    async (goal: TodayGoal) => {
      const nextDone = goal.loggedToday === null;
      const previous = goal.loggedToday;
      setTogglingId(goal.id);
      setGoals((prev) =>
        prev.map((g) => (g.id === goal.id ? { ...g, loggedToday: nextDone ? 1 : null } : g))
      );

      try {
        const res = await fetch(`/api/goals/${goal.id}/checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, completed: nextDone }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `Could not update that goal (status ${res.status})`);
        }
        actionToast(
          nextDone ? `${goal.title} done` : `${goal.title} check-in cleared`,
          async () => {
          setGoals((prev) =>
            prev.map((g) => (g.id === goal.id ? { ...g, loggedToday: previous } : g))
          );
          const undo = await fetch(`/api/goals/${goal.id}/checkin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, completed: previous !== null }),
          });
          if (!undo.ok) errorToast('Could not undo that change');
        });
      } catch (err) {
        setGoals((prev) =>
          prev.map((g) => (g.id === goal.id ? { ...g, loggedToday: previous } : g))
        );
        errorToast(err instanceof Error ? err.message : 'Could not update that goal');
      } finally {
        setTogglingId(null);
      }
    },
    [date]
  );

  if (loading) {
    return (
      <GlassPanel accent="goals" className="p-4 sm:p-5" aria-busy="true" aria-label="Loading goals">
        <Skeleton shine className="mb-4 h-6 w-1/3" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </GlassPanel>
    );
  }

  if (error) {
    return (
      <GlassPanel accent="goals" className="p-4 sm:p-5">
        <h3 className="text-lg font-semibold mb-4">Active Goals</h3>
        <p role="alert" className="text-sm text-destructive mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchGoals}>Retry</Button>
      </GlassPanel>
    );
  }

  if (goals.length === 0) {
    return (
      <GlassPanel accent="goals" className="p-4 sm:p-5">
        <h3 className="text-lg font-semibold mb-4">Active Goals</h3>
        <EmptyState
          title="No active goals"
          action={
            <Link href="/goals">
              <Button variant="outline">Create Goal</Button>
            </Link>
          }
        />
      </GlassPanel>
    );
  }

  return (
    <Mount>
      <GlassPanel accent="goals" className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Active Goals</h3>
          <Link href="/goals">
            <Button variant="ghost" size="sm">View All</Button>
          </Link>
        </div>

        <div className="space-y-4">
          {goals.map(goal => {
            const pct = goal.targetValue > 0
              ? Math.min(100, (Number(goal.currentValue) / Number(goal.targetValue)) * 100)
              : 0;
            const remaining = daysRemaining(goal.endDate, date);
            const isDaily = goal.type === 'DAILY';
            return (
              <div key={goal.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{goal.title}</h4>
                    <p className="text-sm text-muted-foreground">
                      {isDaily
                        ? (Number(goal.currentValue) >= 1 ? 'Done today' : 'Not done today')
                        : `${goal.currentValue} / ${goal.targetValue} ${goal.unit ?? ''}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full ${getPriorityColor(goal.priority)}`}>
                      {goal.priority}
                    </span>
                  </div>
                </div>

                <Progress value={pct} className="h-2 mb-2" />

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {isDaily ? 'Repeats daily' : `${remaining} days left`}
                  </span>
                  <span className="text-muted-foreground font-medium tabular-nums">{Math.round(pct)}%</span>
                </div>

                {isDaily && (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'text-xs font-medium',
                        goal.loggedToday !== null
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-muted-foreground'
                      )}
                    >
                      {goal.loggedToday !== null ? 'Done today' : 'Not done today'}
                    </span>
                    <Button
                      variant={goal.loggedToday !== null ? 'outline' : 'default'}
                      size="sm"
                      disabled={togglingId === goal.id}
                      onClick={() => void toggleGoalDone(goal)}
                    >
                      {goal.loggedToday !== null ? 'Undo check-in' : 'Mark done today'}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </GlassPanel>
    </Mount>
  );
}

function getPriorityColor(priority: GoalPriority): string {
  const colors: Record<GoalPriority, string> = {
    CRITICAL: 'bg-red-500/10 text-red-600 dark:text-red-400',
    HIGH: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    MEDIUM: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    LOW: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    PERSONAL: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    ACADEMIC: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    PROFESSIONAL: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    NON_PROFIT: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  };
  return colors[priority] || colors.MEDIUM;
}