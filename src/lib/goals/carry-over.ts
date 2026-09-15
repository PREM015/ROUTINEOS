import { Goal } from '@/types/goal';

export function canCarryOver(goal: Goal): boolean {
  if (goal.status === 'COMPLETED') return false;
  const now = new Date();
  const dueDate = new Date(goal.endDate);
  return now >= dueDate || goal.status === 'FAILED';
}

export function createCarryOverGoal(goal: Goal, newDueDate: string): Omit<Goal, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    ...goal,
    title: `${goal.title} (Carried Over)`,
    startDate: new Date().toISOString(),
    endDate: newDueDate,
    status: 'ACTIVE',
    currentValue: 0,
    carryOverCount: (goal.carryOverCount || 0) + 1,
    originalGoalId: goal.id
  } as any;
}

export function getSuggestedCarryOverDate(goal: Goal): string {
  const now = new Date();
  if (goal.type === 'WEEKLY') {
    now.setDate(now.getDate() + 7);
  } else if (goal.type === 'MONTHLY') {
    now.setMonth(now.getMonth() + 1);
  } else if (goal.type === 'YEARLY') {
    now.setFullYear(now.getFullYear() + 1);
  } else {
    now.setDate(now.getDate() + 7); // Default
  }
  return now.toISOString().split('T')[0];
}
