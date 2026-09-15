import { Goal } from '@/types/goal';
import { calculateCompletionPercentage } from './progress';

export function isGoalExpired(goal: Goal, todayStr?: string): boolean {
  if (goal.status === 'COMPLETED') return false;
  const today = todayStr ? new Date(todayStr) : new Date();
  const dueDate = new Date(goal.endDate);
  return today > dueDate;
}

export function getDaysUntilDue(goal: Goal, todayStr?: string): number {
  const today = todayStr ? new Date(todayStr) : new Date();
  const dueDate = new Date(goal.endDate);
  const diffTime = Math.max(dueDate.getTime() - today.getTime(), 0);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function isGoalAtRisk(goal: Goal, todayStr?: string): boolean {
  if (goal.status === 'COMPLETED') return false;
  
  const today = todayStr ? new Date(todayStr) : new Date();
  const startDate = new Date(goal.startDate);
  const endDate = new Date(goal.endDate);
  
  const totalDuration = endDate.getTime() - startDate.getTime();
  if (totalDuration <= 0) return true;
  
  const elapsed = today.getTime() - startDate.getTime();
  const timeProgress = (elapsed / totalDuration) * 100;
  
  const valueProgress = calculateCompletionPercentage(goal);
  
  // E.g., 75% of time has passed but less than 50% progress
  return timeProgress > 75 && valueProgress < 50;
}

export function getExpiredGoals(goals: Goal[], today?: string): Goal[] {
  return goals.filter(g => isGoalExpired(g, today));
}
