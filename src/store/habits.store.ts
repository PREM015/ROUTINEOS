/**
 * Habits zustand store.
 *
 * Holds the habit list, today's eligible habits with their logs, and the
 * active filters. Reads/writes hit the real API routes:
 *   GET  /api/habits, /api/habits/today
 *   POST /api/habits, /api/habits/[id]/log
 *   PUT/DELETE /api/habits/[id]
 */

import { create } from 'zustand';
import { apiRequest } from '@/lib/api-client';
import type { Habit, Category, Tag, HabitLog, HabitLogStatus } from '@prisma/client';
import type {
  CreateHabitInput,
  HabitQueryParams,
  LogHabitInput,
  UpdateHabitInput,
} from '@/schemas/habit.schema';

export type HabitFilters = HabitQueryParams;
export type LogHabitData = Omit<LogHabitInput, 'habitId'>;

/** Habit list item as returned by GET /api/habits (repository findAll). */
export interface HabitItem extends Habit {
  category: Category | null;
  tags: Array<{ tag: Tag }>;
  _count?: { logs: number; overrides: number };
}

/** Item as returned by GET /api/habits/today (eligible habits + today's log). */
export interface TodayHabitItem {
  id: string;
  name: string;
  tier: string;
  color: string | null;
  icon: string | null;
  estimatedDuration: number | null;
  targetCount: number | null;
  category: Category | null;
  isEligible: boolean;
  log: HabitLog | null;
}

export type HabitLogEntry = HabitLog & { habitId: string };

interface LogResult {
  log: HabitLog;
  streakUpdated?: boolean;
  newStreak?: number;
}

interface HabitsState {
  habits: HabitItem[];
  todayHabits: TodayHabitItem[];
  todayLogs: HabitLogEntry[];
  filters: HabitFilters;
  loading: boolean;
  error: string | null;
  fetchHabits: (filters?: HabitFilters) => Promise<HabitItem[]>;
  fetchHabit: (id: string) => Promise<HabitItem>;
  createHabit: (input: CreateHabitInput) => Promise<HabitItem>;
  updateHabit: (id: string, patch: UpdateHabitInput) => Promise<HabitItem>;
  deleteHabit: (id: string) => Promise<void>;
  logHabit: (habitId: string, data: LogHabitData) => Promise<HabitLog>;
  toggleToday: (habitId: string) => Promise<HabitLog>;
  getTodayLogs: (date?: string) => Promise<HabitLogEntry[]>;
  clear: () => void;
  reset: () => void;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Format a local Date as YYYY-MM-DD in the user's own timezone. */
function toDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function upsertTodayLog(
  logs: HabitLogEntry[],
  log: HabitLog,
  habitId: string
): HabitLogEntry[] {
  const entry: HabitLogEntry = { ...log, habitId };
  const index = logs.findIndex((item) => item.habitId === habitId);
  if (index === -1) return [...logs, entry];
  const copy = [...logs];
  copy[index] = entry;
  return copy;
}

export const useHabitsStore = create<HabitsState>()((set, get) => ({
  habits: [],
  todayHabits: [],
  todayLogs: [],
  filters: {},
  loading: false,
  error: null,

  /**
   * Fetch the habit list. Passing filters replaces the stored ones; omitting
   * them re-runs the last applied filters.
   */
  fetchHabits: async (filters) => {
    set({ loading: true, error: null });
    try {
      const next = filters ?? get().filters;
      const habits = await apiRequest<HabitItem[]>('/api/habits', {
        query: next,
      });
      set({ habits, filters: next, loading: false });
      return habits;
    } catch (err) {
      const message = errorMessage(err, 'Failed to fetch habits');
      set({ loading: false, error: message });
      throw err;
    }
  },

  fetchHabit: async (id) => {
    set({ loading: true, error: null });
    try {
      const habit = await apiRequest<HabitItem>(`/api/habits/${id}`);
      set((state) => ({
        habits: state.habits.some((h) => h.id === id)
          ? state.habits.map((h) => (h.id === id ? habit : h))
          : state.habits,
        loading: false,
      }));
      return habit;
    } catch (err) {
      const message = errorMessage(err, 'Failed to fetch habit');
      set({ loading: false, error: message });
      throw err;
    }
  },

  createHabit: async (input) => {
    set({ loading: true, error: null });
    try {
      const habit = await apiRequest<HabitItem>('/api/habits', {
        method: 'POST',
        body: input,
      });
      set((state) => ({ habits: [habit, ...state.habits], loading: false }));
      return habit;
    } catch (err) {
      const message = errorMessage(err, 'Failed to create habit');
      set({ loading: false, error: message });
      throw err;
    }
  },

  updateHabit: async (id, patch) => {
    set({ loading: true, error: null });
    try {
      const updated = await apiRequest<HabitItem>(`/api/habits/${id}`, {
        method: 'PUT',
        body: patch,
      });
      set((state) => ({
        habits: state.habits.map((habit) => (habit.id === id ? updated : habit)),
        loading: false,
      }));
      return updated;
    } catch (err) {
      const message = errorMessage(err, 'Failed to update habit');
      set({ loading: false, error: message });
      throw err;
    }
  },

  deleteHabit: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiRequest<unknown>(`/api/habits/${id}`, { method: 'DELETE' });
      set((state) => ({
        habits: state.habits.filter((habit) => habit.id !== id),
        todayHabits: state.todayHabits.filter((habit) => habit.id !== id),
        todayLogs: state.todayLogs.filter((log) => log.habitId !== id),
        loading: false,
      }));
    } catch (err) {
      const message = errorMessage(err, 'Failed to delete habit');
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Log a habit for a given day via POST /api/habits/[id]/log and keep
   * today's views in sync.
   */
  logHabit: async (habitId, data) => {
    set({ loading: true, error: null });
    try {
      const result = await apiRequest<LogResult>(
        `/api/habits/${habitId}/log`,
        { method: 'POST', body: { habitId, ...data } }
      );
      set((state) => ({
        todayHabits: state.todayHabits.map((habit) =>
          habit.id === habitId ? { ...habit, log: result.log } : habit
        ),
        todayLogs: upsertTodayLog(state.todayLogs, result.log, habitId),
        loading: false,
      }));
      return result.log;
    } catch (err) {
      const message = errorMessage(err, 'Failed to log habit');
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Toggle today's completion for a habit: completes it when it isn't
   * marked COMPLETED yet, and marks it MISSED when it already is.
   */
  toggleToday: async (habitId) => {
    const today = toDateKey();
    const current = get().todayHabits.find((habit) => habit.id === habitId);
    const status: HabitLogStatus =
      current?.log?.status === 'COMPLETED' ? 'MISSED' : 'COMPLETED';
    return get().logHabit(habitId, { date: today, status });
  },

  /**
   * Load today's eligible habits (and their logs) via GET /api/habits/today.
   */
  getTodayLogs: async (date) => {
    set({ loading: true, error: null });
    try {
      const habits = await apiRequest<TodayHabitItem[]>('/api/habits/today', {
        query: date ? { date } : {},
      });
      const logs: HabitLogEntry[] = habits.flatMap((habit) =>
        habit.log ? [{ ...habit.log, habitId: habit.id }] : []
      );
      set({ todayHabits: habits, todayLogs: logs, loading: false });
      return logs;
    } catch (err) {
      const message = errorMessage(err, 'Failed to load today\'s habits');
      set({ loading: false, error: message });
      throw err;
    }
  },

  clear: () => {
    set({ habits: [], todayHabits: [], todayLogs: [] });
  },

  reset: () => {
    set({
      habits: [],
      todayHabits: [],
      todayLogs: [],
      filters: {},
      loading: false,
      error: null,
    });
  },
}));