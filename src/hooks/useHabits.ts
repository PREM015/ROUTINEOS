'use client';

import { useShallow } from 'zustand/react/shallow';
import { useHabitsStore } from '@/store/habits.store';
import type {
  HabitFilters,
  HabitItem,
  HabitLogEntry,
  LogHabitData,
  TodayHabitItem,
} from '@/store/habits.store';
import type { HabitLog } from '@prisma/client';
import type { CreateHabitInput, UpdateHabitInput } from '@/schemas/habit';

/**
 * Habits hook: subscribe to the habits store for the cached lists (habits +
 * today's eligible habits/logs), filters and the CRUD/log actions.
 */
export function useHabits() {
  const habits = useHabitsStore((state) => state.habits);
  const todayHabits = useHabitsStore((state) => state.todayHabits);
  const todayLogs = useHabitsStore((state) => state.todayLogs);
  const filters = useHabitsStore((state) => state.filters);
  const loading = useHabitsStore((state) => state.loading);
  const error = useHabitsStore((state) => state.error);

  const actions = useHabitsStore(
    useShallow((state) => ({
      fetchHabits: state.fetchHabits,
      fetchHabit: state.fetchHabit,
      createHabit: state.createHabit,
      updateHabit: state.updateHabit,
      deleteHabit: state.deleteHabit,
      logHabit: state.logHabit,
      toggleToday: state.toggleToday,
      getTodayLogs: state.getTodayLogs,
      clear: state.clear,
      reset: state.reset,
    }))
  );

  return {
    habits,
    todayHabits,
    todayLogs,
    filters,
    loading,
    error,
    ...actions,
  };
}

export type {
  HabitFilters,
  HabitItem,
  HabitLogEntry,
  LogHabitData,
  TodayHabitItem,
  HabitLog,
  CreateHabitInput,
  UpdateHabitInput,
};
export { useHabitsStore };