'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { Button } from '@/components/ui/Button';
import type { GoalPriority } from '@prisma/client';

interface TodayGoal {
  id: string;
  title: string;
  priority: GoalPriority;
  currentValue: number;
  targetValue: number;
  unit: string | null;
  endDate: Date;
  daysRemaining: number;
  progressPercentage: number;
  requiredTodayProgress: number;
}

interface TodayGoalsProps {
  date: string;
}

export function TodayGoals({ date }: TodayGoalsProps) {
  const [goals, setGoals] = useState<TodayGoal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGoals();
  }, [date]);

  async function fetchGoals() {
    try {
      const res = await fetch('/api/goals?status=ACTIVE&limit=5');
      const data = await res.json();
      
      if (data.success) {
        setGoals(data.data.slice(0, 5)); // Top 5 active goals
      }
    } catch (error) {
      console.error('Error fetching goals:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateProgress(goalId: string, value: number) {
    try {
      const res = await fetch(`/api/goals/${goalId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, date }),
      });

      if (res.ok) {
        fetchGoals(); // Refresh
      }
    } catch (error) {
      console.error('Error updating goal progress:', error);
    }
  }

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

  if (goals.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Active Goals</h3>
        <div className="text-center py-8 text-gray-500">
          <p>No active goals</p>
          <Button className="mt-4" variant="outline">
            Create Goal
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Active Goals</h3>
        <Button variant="ghost" size="sm">
          View All
        </Button>
      </div>

      <div className="space-y-4">
        {goals.map(goal => (
          <div key={goal.id} className="border rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h4 className="font-medium">{goal.title}</h4>
                <p className="text-sm text-gray-600">
                  {goal.currentValue} / {goal.targetValue} {goal.unit}
                </p>
              </div>
              <div className="text-right">
                <span className={`text-xs px-2 py-1 rounded-full ${getPriorityColor(goal.priority)}`}>
                  {goal.priority}
                </span>
              </div>
            </div>

            <Progress value={goal.progressPercentage} className="h-2 mb-2" />

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {goal.daysRemaining} days left
              </span>
              {goal.requiredTodayProgress > 0 && (
                <span className="text-blue-600 font-medium">
                  +{goal.requiredTodayProgress.toFixed(1)} needed today
                </span>
              )}
            </div>
          </div>
        ))}
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