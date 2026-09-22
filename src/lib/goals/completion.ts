import { Goal } from '@/types/goal';

export function checkGoalCompletion(goal: Goal): boolean {
  if (!goal.targetValue) return goal.status === 'COMPLETED';
  const current = goal.currentValue || 0;
  return current >= goal.targetValue;
}

export function markGoalComplete(_goal: Goal): Partial<Goal> {
  return {
    status: 'COMPLETED',
    completedAt: new Date()
  };
}

export function checkAllGoalsCompletion(goals: Goal[]): Goal[] {
  return goals.filter(checkGoalCompletion).map(g => ({
    ...g,
    ...markGoalComplete(g)
  }));
}
