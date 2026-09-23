'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ListChecks } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import AddHabitModal from '@/components/habits/AddHabitModal';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';
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
  const reduce = useReducedMotion();
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
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
      <Card className="p-6" aria-busy="true" aria-label="Loading today's habits">
        <div className="mb-6 flex items-center justify-between">
          <Skeleton shine className="h-6 w-40" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
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
        <p role="alert" className="text-sm text-destructive mb-4">{error}</p>
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
                <span className="text-sm text-muted-foreground tabular-nums">
                  {completedCount}/{tierHabits.length}
                </span>
              </div>

              <div className="space-y-2">
                {tierHabits.map(habit => {
                  const done = habit.log?.status === 'COMPLETED';
                  return (
                    <motion.div
                      key={habit.id}
                      layout={reduce ? false : true}
                      transition={reduce ? undefined : { layout: { duration: 0.4, ease: EASE } }}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/60 transition-colors"
                    >
                      <motion.div
                        key={done ? 'done' : 'open'}
                        initial={reduce ? false : { scale: done ? 0.6 : 1 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                        className="shrink-0"
                      >
                        <Checkbox
                          checked={done}
                          disabled={togglingId === habit.id}
                          onCheckedChange={() =>
                            toggleHabit(habit.id, habit.log?.status || null)
                          }
                          aria-label={`Mark ${habit.name} ${done ? 'not done' : 'done'}`}
                        />
                      </motion.div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {habit.icon && <span>{habit.icon}</span>}
                          <span
                            className={cn(
                              'transition-colors duration-300',
                              done ? 'line-through text-muted-foreground' : 'text-foreground'
                            )}
                          >
                            {habit.name}
                          </span>
                        </div>
                        {habit.estimatedDuration && (
                          <span className="text-xs text-muted-foreground">
                            {habit.estimatedDuration} min
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {habits.length === 0 && (
        <EmptyState
          icon={<ListChecks className="mx-auto h-10 w-10 text-muted-foreground/50" />}
          title="No habits scheduled for today"
          action={
            <Button variant="outline" onClick={() => setModalOpen(true)}>
              Add Habits
            </Button>
          }
        />
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