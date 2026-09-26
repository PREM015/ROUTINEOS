'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  CalendarPlus,
  Check,
  ListChecks,
  Pencil,
  Plus,
  Search,
  SkipForward,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/Popover';
import AddHabitModal from '@/components/habits/AddHabitModal';
import { runAchievementCheck } from '@/store/achievement.store';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';
import type { HabitTier, HabitLogStatus } from '@prisma/client';
import { HABIT_TIER_CONFIG, HABIT_TIERS_ORDERED } from '@/constants/habit-tiers';

interface TodayHabit {
  id: string;
  name: string;
  tier: HabitTier;
  color: string | null;
  icon: string | null;
  estimatedDuration: number | null;
  source?: 'SCHEDULED' | 'MANUAL';
  log: {
    id: string;
    status: HabitLogStatus;
  } | null;
}

interface AllHabit {
  id: string;
  name: string;
  tier: HabitTier;
  icon: string | null;
}

interface TodayHabitChecklistProps {
  date: string;
}

export function TodayHabitChecklist({ date }: TodayHabitChecklistProps) {
  const reduce = useReducedMotion();
  const [habits, setHabits] = useState<TodayHabit[]>([]);
  const [allHabits, setAllHabits] = useState<AllHabit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [search, setSearch] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);

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

  const fetchAllHabits = useCallback(async () => {
    try {
      const res = await fetch('/api/habits?status=ACTIVE&limit=100');
      const data = await res.json();
      if (res.ok && data.success) {
        setAllHabits(data.data);
      }
    } catch {
      // Non-fatal; picker just shows an empty list.
    }
  }, []);

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
      if (newStatus === 'COMPLETED') void runAchievementCheck();
      // Reconcile with server truth (score + streak update downstream).
      fetchTodayHabits();
    } catch (err) {
      setHabits(previous);
      setError(err instanceof Error ? err.message : 'Failed to save habit log');
    } finally {
      setTogglingId(null);
    }
  }

  async function skipHabit(habitId: string) {
    setTogglingId(habitId);
    setError(null);
    try {
      const res = await fetch(`/api/habits/${habitId}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, reason: 'Skipped from today' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to skip habit');
      await fetchTodayHabits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to skip habit');
    } finally {
      setTogglingId(null);
    }
  }

  async function removeFromToday(habitId: string) {
    setTogglingId(habitId);
    setError(null);
    try {
      const res = await fetch('/api/habits/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, action: 'REMOVE', habitId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to remove habit');
      await fetchTodayHabits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove habit');
    } finally {
      setTogglingId(null);
    }
  }

  async function addToToday(habitId: string) {
    setAddingId(habitId);
    setError(null);
    try {
      const res = await fetch('/api/habits/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, action: 'ADD', habitId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to add habit');
      await fetchTodayHabits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add habit');
    } finally {
      setAddingId(null);
    }
  }

  async function saveRename(habitId: string) {
    const name = draftName.trim();
    if (!name || name === habits.find(h => h.id === habitId)?.name) {
      setEditingId(null);
      setDraftName('');
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/habits/${habitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to rename habit');
      await fetchTodayHabits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename habit');
    } finally {
      setEditingId(null);
      setDraftName('');
    }
  }

  function startRename(habit: TodayHabit) {
    setEditingId(habit.id);
    setDraftName(habit.name);
  }

  // Habits the user can add to today: active habits not already in the list.
  const addableHabits = useMemo(() => {
    const inToday = new Set(habits.map(h => h.id));
    const query = search.trim().toLowerCase();
    return allHabits
      .filter(h => !inToday.has(h.id))
      .filter(h => !query || h.name.toLowerCase().includes(query));
  }, [allHabits, habits, search]);

  // Group by tier (fixed ordering via HABIT_TIERS_ORDERED so non-central tiers render too).
  const habitsByTier = useMemo(() => {
    const acc: Record<string, TodayHabit[]> = {};
    for (const habit of habits) {
      const bucket = acc[habit.tier] ?? (acc[habit.tier] = []);
      bucket.push(habit);
    }
    return acc;
  }, [habits]);

  if (loading) {
    return (
      <Card className="p-6" aria-busy="true" aria-label="Loading today's habits">
        <div className="mb-6 flex items-center justify-between">
          <Skeleton shine className="h-6 w-40" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
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
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline">
                <CalendarPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Add to Today
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-3">
              <div className="mb-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search habits…"
                  icon={<Search className="h-4 w-4" aria-hidden="true" />}
                  aria-label="Search habits to add"
                />
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {addableHabits.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {habits.length === 0 && !search
                      ? 'No other active habits to add.'
                      : 'No habits match your search.'}
                  </p>
                )}
                {addableHabits.map((habit) => (
                  <button
                    key={habit.id}
                    type="button"
                    disabled={addingId === habit.id}
                    onClick={() => addToToday(habit.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted/70 disabled:opacity-60"
                  >
                    <span aria-hidden="true">{habit.icon ?? '🌱'}</span>
                    <span className="flex-1 truncate">{habit.name}</span>
                    <Badge variant="default">
                      {HABIT_TIER_CONFIG[habit.tier].label}
                    </Badge>
                    <Plus className="h-4 w-4 text-primary" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
            + New Habit
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive mb-4">{error}</p>
      )}

      <div className="space-y-6">
        {HABIT_TIERS_ORDERED.map(tier => {
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
                  const isManual = habit.source === 'MANUAL';
                  const isEditing = editingId === habit.id;
                  return (
                    <motion.div
                      key={habit.id}
                      layout={reduce ? false : true}
                      transition={reduce ? undefined : { layout: { duration: 0.4, ease: EASE } }}
                      className="group flex items-center gap-3 p-3 rounded-lg hover:bg-muted/60 transition-colors"
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
                          {habit.icon && <span aria-hidden="true">{habit.icon}</span>}
                          {isEditing ? (
                            <Input
                              autoFocus
                              value={draftName}
                              onChange={(e) => setDraftName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveRename(habit.id);
                                if (e.key === 'Escape') {
                                  setEditingId(null);
                                  setDraftName('');
                                }
                              }}
                              className="h-7 py-1 text-sm"
                              aria-label="Habit name"
                            />
                          ) : (
                            <span
                              className={cn(
                                'transition-colors duration-300',
                                done ? 'line-through text-muted-foreground' : 'text-foreground'
                              )}
                            >
                              {habit.name}
                            </span>
                          )}
                          {isManual && (
                            <Badge variant="warning" className="shrink-0">
                              added today
                            </Badge>
                          )}
                        </div>
                        {habit.estimatedDuration && !isEditing && (
                          <span className="text-xs text-muted-foreground">
                            {habit.estimatedDuration} min
                          </span>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              className="px-2"
                              variant="ghost"
                              onClick={() => saveRename(habit.id)}
                              aria-label={`Save ${habit.name}`}
                            >
                              <Check className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              size="sm"
                              className="px-2"
                              variant="ghost"
                              onClick={() => {
                                setEditingId(null);
                                setDraftName('');
                              }}
                              aria-label="Cancel rename"
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              className="px-2"
                              variant="ghost"
                              onClick={() => startRename(habit)}
                              aria-label={`Rename ${habit.name}`}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              size="sm"
                              className="px-2"
                              variant="ghost"
                              disabled={togglingId === habit.id || done}
                              onClick={() => skipHabit(habit.id)}
                              aria-label={`Skip ${habit.name} today`}
                            >
                              <SkipForward className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            {isManual && (
                              <Button
                                size="sm"
                                className="px-2"
                                variant="ghost"
                                disabled={togglingId === habit.id}
                                onClick={() => removeFromToday(habit.id)}
                                aria-label={`Remove ${habit.name} from today`}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            )}
                          </>
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
          description="Use “Add to Today” above, or create a new habit."
          action={<Button variant="outline" onClick={() => setModalOpen(true)}>New Habit</Button>}
        />
      )}

      <AddHabitModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          fetchTodayHabits();
          fetchAllHabits();
        }}
      />
    </Card>
  );
}