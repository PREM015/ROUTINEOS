'use client';

import { useShallow } from 'zustand/react/shallow';
import { useGoalsStore } from '@/store/goals.store';
import type { GoalFilters } from '@/store/goals.store';
import type {
  CreateGoalInput,
  GoalWithRelations,
  UpdateGoalInput,
} from '@/types/goal';

/**
 * Goals hook: subscribe to the goals store for the cached list, selection,
 * filters and the CRUD/progress actions.
 */
export function useGoals() {
  const goals = useGoalsStore((state) => state.goals);
  const selectedGoal = useGoalsStore((state) => state.selectedGoal);
  const selectedGoalId = useGoalsStore((state) => state.selectedGoalId);
  const filters = useGoalsStore((state) => state.filters);
  const loading = useGoalsStore((state) => state.loading);
  const error = useGoalsStore((state) => state.error);

  const actions = useGoalsStore(
    useShallow((state) => ({
      fetchGoals: state.fetchGoals,
      fetchGoal: state.fetchGoal,
      createGoal: state.createGoal,
      updateGoal: state.updateGoal,
      deleteGoal: state.deleteGoal,
      completeGoal: state.completeGoal,
      selectGoal: state.selectGoal,
      clear: state.clear,
      reset: state.reset,
    }))
  );

  return {
    goals,
    selectedGoal,
    selectedGoalId,
    filters,
    loading,
    error,
    ...actions,
  };
}

export type { GoalFilters, CreateGoalInput, GoalWithRelations, UpdateGoalInput };
export { useGoalsStore };