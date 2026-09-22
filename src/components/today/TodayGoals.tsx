'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { Button } from '@/components/ui/Button';
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
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
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
        <div className="text-center py-8 text-gray-500">
          <p>No active goals</p>
          <Link href="/goals" className="mt-4 inline-block">
            <Button variant="outline">Create Goal</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
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
                  <p className="text-sm text-gray-600">
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
                <span className="text-gray-600">
                  {isDaily ? 'Repeats daily' : `${remaining} days left`}
                </span>
                <span className="text-gray-600 font-medium">{Math.round(pct)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function getPriorityColor(priority: GoalPriority): string {
  const colors: Record<GoalPriority, string> = {
    CRITICAL: 'bg-red-100 text-red-800',
    HIGH: 'bg-orange-100 text-orange-800',
    MEDIUM: 'bg-yellow-100 text-yellow-800',
    LOW: 'bg-green-100 text-green-800',
    PERSONAL: 'bg-purple-100 text-purple-800',
    ACADEMIC: 'bg-blue-100 text-blue-800',
    PROFESSIONAL: 'bg-indigo-100 text-indigo-800',
    NON_PROFIT: 'bg-pink-100 text-pink-800',
  };
  return colors[priority] || colors.MEDIUM;
}
