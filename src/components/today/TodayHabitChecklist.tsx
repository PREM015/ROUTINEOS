'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import AddHabitModal from '@/components/habits/AddHabitModal';
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
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchTodayHabits = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/habits/today?date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load today's habits");
      if (data.success) {
        setHabits(data.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load today's habits");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchTodayHabits();
  }, [fetchTodayHabits]);

  async function toggleHabit(habitId: string, currentStatus: HabitLogStatus | null) {
    if (togglingId) return;
    const newStatus: HabitLogStatus = currentStatus === 'COMPLETED' ? 'MISSED' : 'COMPLETED';
    setTogglingId(habitId);
    setError(null);
    // Optimistic update with rollback on failure.
    const previous = habits;
    setHabits((prev) =>
      prev.map((h) =>
        h.id === habitId ? { ...h, log: { id: h.log?.id ?? `local-${habitId}`, status: newStatus } } : h
      )
    );
    try {
      const res = await fetch(`/api/habits/${habitId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          status: newStatus,
          completedAt: newStatus === 'COMPLETED' ? new Date().toISOString() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to save habit log');
      // Reconcile with server truth (score + streak update downstream).
      fetchTodayHabits();
    } catch (err) {
      setHabits(previous);
      setError(err instanceof Error ? err.message : 'Failed to save habit log');
    } finally {
      setTogglingId(null);
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
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h2 className="text-xl font-bold">Today&apos;s Habits</h2>
        <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
          + Add Habit
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-500 mb-4">{error}</p>
      )}

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
                      disabled={togglingId === habit.id}
                      onCheckedChange={() =>
                        toggleHabit(habit.id, habit.log?.status || null)
                      }
                      aria-label={`Mark ${habit.name} ${habit.log?.status === 'COMPLETED' ? 'not done' : 'done'}`}
                    />
                    <div className="flex-1 min-w-0">
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
          <Button className="mt-4" variant="outline" onClick={() => setModalOpen(true)}>
            Add Habits
          </Button>
        </div>
      )}

      <AddHabitModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          fetchTodayHabits();
        }}
      />
    </Card>
  );
}
