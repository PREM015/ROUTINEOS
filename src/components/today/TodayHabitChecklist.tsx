'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import type { HabitTier, HabitLogStatus } from '@prisma/client';
import { HABIT_TIER_CONFIG } from '@/constants/habit-tiers';

interface TodayHabit {
  id: string;
  name: string;
  tier: HabitTier;
  color: string | null;
  icon: string | null;
  estimatedDuration: number | null;
  log: {
    id: string;
    status: HabitLogStatus;
  } | null;
}

interface TodayHabitChecklistProps {
  date: string;
}

export function TodayHabitChecklist({ date }: TodayHabitChecklistProps) {
  const [habits, setHabits] = useState<TodayHabit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTodayHabits();
  }, [date]);

  async function fetchTodayHabits() {
    try {
      setLoading(true);
      const res = await fetch(`/api/habits/today?date=${date}`);
      const data = await res.json();
      if (data.success) {
        setHabits(data.data);
      }
    } catch (error) {
      console.error('Error fetching today\'s habits:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleHabit(habitId: string, currentStatus: HabitLogStatus | null) {
    const newStatus: HabitLogStatus = currentStatus === 'COMPLETED' ? 'MISSED' : 'COMPLETED';

    try {
      const res = await fetch(`/api/habits/${habitId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          status: newStatus,
          completedAt: newStatus === 'COMPLETED' ? new Date() : null,
        }),
      });

      if (res.ok) {
        // Refresh habits
        fetchTodayHabits();
      }
    } catch (error) {
      console.error('Error toggling habit:', error);
    }
  }

  // Group by tier
  const habitsByTier = habits.reduce((acc, habit) => {
    if (!acc[habit.tier]) {
      acc[habit.tier] = [];
    }
    acc[habit.tier].push(habit);
    return acc;
  }, {} as Record<HabitTier, TodayHabit[]>);

  const tiers: HabitTier[] = ['GROWTH', 'BONUS', 'LIFESTYLE'];

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold mb-6">Today's Habits</h2>

      <div className="space-y-6">
        {tiers.map(tier => {
          const tierHabits = habitsByTier[tier] || [];
          if (tierHabits.length === 0) return null;

          const tierConfig = HABIT_TIER_CONFIG[tier];
          const completedCount = tierHabits.filter(
            h => h.log?.status === 'COMPLETED'
          ).length;

          return (
            <div key={tier}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span>{tierConfig.icon}</span>
                  <h3 className="font-semibold">{tierConfig.label}</h3>
                </div>
                <span className="text-sm text-gray-600">
                  {completedCount}/{tierHabits.length}
                </span>
              </div>

              <div className="space-y-2">
                {tierHabits.map(habit => (
                  <div
                    key={habit.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Checkbox
                      checked={habit.log?.status === 'COMPLETED'}
                      onCheckedChange={() =>
                        toggleHabit(habit.id, habit.log?.status || null)
                      }
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {habit.icon && <span>{habit.icon}</span>}
                        <span
                          className={
                            habit.log?.status === 'COMPLETED'
                              ? 'line-through text-gray-500'
                              : ''
                          }
                        >
                          {habit.name}
                        </span>
                      </div>
                      {habit.estimatedDuration && (
                        <span className="text-xs text-gray-500">
                          {habit.estimatedDuration} min
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {habits.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No habits scheduled for today</p>
          <Button className="mt-4" variant="outline">
            Add Habits
          </Button>
        </div>
      )}
    </Card>
  );
}