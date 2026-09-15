import { Goal } from '@/types/goal';

export function calculateCompletionPercentage(goal: Goal): number {
  if (goal.targetValue === 0) return 100;
  if (!goal.currentValue) return 0;
  const percentage = (goal.currentValue / goal.targetValue) * 100;
  return Math.min(Math.max(percentage, 0), 100);
}

export function getProgressStatus(goal: Goal): 'not-started' | 'in-progress' | 'completed' | 'overdue' {
  if (goal.status === 'COMPLETED') return 'completed';
  
  const now = new Date();
  const dueDate = new Date(goal.endDate);
  
  if (now > dueDate) return 'overdue';
  if (!goal.currentValue || goal.currentValue === 0) return 'not-started';
  
  return 'in-progress';
}

export function getRemainingValue(goal: Goal): number | null {
  if (goal.targetValue === null || goal.targetValue === undefined) return null;
  const current = goal.currentValue || 0;
  return Math.max(goal.targetValue - current, 0);
}
