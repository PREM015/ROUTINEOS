'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Mount } from '@/components/motion/Mount';
import type { GoalPriority, GoalType } from '@prisma/client';

interface TodayGoal {
  id: string;
  title: string;
  type: GoalType;
  priority: GoalPriority;
  currentValue: number;
  targetValue: number;
  unit: string | null;
  endDate: string;
}

interface TodayGoalsProps {
  date: string;
}

function daysRemaining(endDate: string): number {
  const diff = new Date(endDate).getTime() - new Date(dateStr()).getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function dateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TodayGoals({ date }: TodayGoalsProps) {
  const [goals, setGoals] = useState<TodayGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGoals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/goals?status=ACTIVE&limit=50');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load goals');

      if (data.success) {
        // Daily goals first (today's check-off), then the rest. Top 5.
        const list: TodayGoal[] = Array.isArray(data.data) ? data.data : [];
        const sorted = [...list].sort((a, b) =>
          a.type === 'DAILY' && b.type !== 'DAILY' ? -1 : b.type === 'DAILY' && a.type !== 'DAILY' ? 1 : 0
        );
        setGoals(sorted.slice(0, 5));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Initial data fetch when the date changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- date-driven data fetch
    fetchGoals();
  }, [fetchGoals]);

  if (loading) {
    return (
      <Card className="p-6" aria-busy="true" aria-label="Loading goals">
        <Skeleton shine className="mb-4 h-6 w-1/3" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Active Goals</h3>
        <p role="alert" className="text-sm text-red-500 mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchGoals}>Retry</Button>
      </Card>
    );
  }

  if (goals.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Active Goals</h3>
        <EmptyState
          title="No active goals"
          action={
            <Link href="/goals">
              <Button variant="outline">Create Goal</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <Mount>
      <Card className="p-6">
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
            const remaining = daysRemaining(goal.endDate);
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
              </div>
            );
          })}
        </div>
      </Card>
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