/**
 * Goals zustand store.
 *
 * Holds the goal list plus the current filters and a selected goal for
 * detail views. All reads/writes hit the real API routes:
 *   GET  /api/goals, /api/goals/[id]
 *   POST /api/goals, /api/goals/[id]/progress (used for completing)
 *   PUT/DELETE /api/goals/[id]
 */

import { create } from 'zustand';
import { apiRequest } from '@/lib/api-client';
import type {
  CreateGoalInput,
  GoalQueryParams,
  GoalWithRelations,
  UpdateGoalInput,
} from '@/types/goal';

export type GoalFilters = GoalQueryParams;

interface GoalsState {
  goals: GoalWithRelations[];
  selectedGoal: GoalWithRelations | null;
  selectedGoalId: string | null;
  filters: GoalFilters;
  loading: boolean;
  error: string | null;
  fetchGoals: (filters?: GoalFilters) => Promise<GoalWithRelations[]>;
  fetchGoal: (id: string) => Promise<GoalWithRelations>;
  createGoal: (input: CreateGoalInput) => Promise<GoalWithRelations>;
  updateGoal: (
    id: string,
    patch: UpdateGoalInput
  ) => Promise<GoalWithRelations>;
  deleteGoal: (id: string) => Promise<void>;
  completeGoal: (id: string) => Promise<GoalWithRelations>;
  selectGoal: (id: string | null) => void;
  clear: () => void;
  reset: () => void;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function replaceGoal(
  goals: GoalWithRelations[],
  id: string,
  updated: GoalWithRelations
): GoalWithRelations[] {
  return goals.map((goal) => (goal.id === id ? updated : goal));
}

export const useGoalsStore = create<GoalsState>()((set, get) => ({
  goals: [],
  selectedGoal: null,
  selectedGoalId: null,
  filters: {},
  loading: false,
  error: null,

  /**
   * Fetch the goal list. Passing filters replaces the stored ones; omitting
   * them re-runs the last applied filters.
   */
  fetchGoals: async (filters) => {
    set({ loading: true, error: null });
    try {
      const next = filters ?? get().filters;
      const goals = await apiRequest<GoalWithRelations[]>('/api/goals', {
        query: next,
      });
      set({ goals, filters: next, loading: false });
      return goals;
    } catch (err) {
      const message = errorMessage(err, 'Failed to fetch goals');
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Fetch a single goal with its relations.
   */
  fetchGoal: async (id) => {
    set({ loading: true, error: null });
    try {
      const goal = await apiRequest<GoalWithRelations>(`/api/goals/${id}`);
      set((state) => ({
        selectedGoal: goal,
        selectedGoalId: id,
        goals: state.goals.some((g) => g.id === id)
          ? replaceGoal(state.goals, id, goal)
          : state.goals,
        loading: false,
      }));
      return goal;
    } catch (err) {
      const message = errorMessage(err, 'Failed to fetch goal');
      set({ loading: false, error: message });
      throw err;
    }
  },

  createGoal: async (input) => {
    set({ loading: true, error: null });
    try {
      const goal = await apiRequest<GoalWithRelations>('/api/goals', {
        method: 'POST',
        body: input,
      });
      set((state) => ({
        goals: [goal, ...state.goals],
        selectedGoal: goal,
        selectedGoalId: goal.id,
        loading: false,
      }));
      return goal;
    } catch (err) {
      const message = errorMessage(err, 'Failed to create goal');
      set({ loading: false, error: message });
      throw err;
    }
  },

  updateGoal: async (id, patch) => {
    set({ loading: true, error: null });
    try {
      const updated = await apiRequest<GoalWithRelations>(`/api/goals/${id}`, {
        method: 'PUT',
        body: patch,
      });
      set((state) => ({
        goals: replaceGoal(state.goals, id, updated),
        selectedGoal:
          state.selectedGoal?.id === id ? updated : state.selectedGoal,
        loading: false,
      }));
      return updated;
    } catch (err) {
      const message = errorMessage(err, 'Failed to update goal');
      set({ loading: false, error: message });
      throw err;
    }
  },

  deleteGoal: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiRequest<unknown>(`/api/goals/${id}`, { method: 'DELETE' });
      set((state) => ({
        goals: state.goals.filter((goal) => goal.id !== id),
        selectedGoal:
          state.selectedGoal?.id === id ? null : state.selectedGoal,
        selectedGoalId:
          state.selectedGoalId === id ? null : state.selectedGoalId,
        loading: false,
      }));
    } catch (err) {
      const message = errorMessage(err, 'Failed to delete goal');
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Complete a goal by posting its target value to the progress endpoint
   * with `autoComplete` enabled, which flips the status server-side.
   */
  completeGoal: async (id) => {
    set({ loading: true, error: null });
    try {
      const current =
        get().goals.find((goal) => goal.id === id) ??
        (await apiRequest<GoalWithRelations>(`/api/goals/${id}`));
      const targetValue = current?.targetValue ?? 1;

      const updated = await apiRequest<GoalWithRelations>(
        `/api/goals/${id}/progress`,
        { method: 'POST', body: { value: targetValue, autoComplete: true } }
      );

      set((state) => ({
        goals: replaceGoal(state.goals, id, updated),
        selectedGoal:
          state.selectedGoal?.id === id ? updated : state.selectedGoal,
        loading: false,
      }));
      return updated;
    } catch (err) {
      const message = errorMessage(err, 'Failed to complete goal');
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Select a goal for detail views. Uses the cached list entry immediately
   * and refreshes from the API when the goal is not in the list.
   */
  selectGoal: (id) => {
    const cached = id ? get().goals.find((goal) => goal.id === id) ?? null : null;
    set({ selectedGoalId: id, selectedGoal: cached });
    if (id && !cached) {
      get()
        .fetchGoal(id)
        .catch(() => undefined);
    }
  },

  clear: () => {
    set({ goals: [], selectedGoal: null, selectedGoalId: null });
  },

  reset: () => {
    set({
      goals: [],
      selectedGoal: null,
      selectedGoalId: null,
      filters: {},
      loading: false,
      error: null,
    });
  },
}));