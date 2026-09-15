import { Goal } from '@/types/goal';

export interface GoalProgress {
  id: string;
  goalId: string;
  value: number;
  note?: string | null;
  recordedAt: string;
}

export function calculateVelocity(goal: Goal, progressEntries: GoalProgress[]): number | null {
  if (progressEntries.length < 2) return null;
  
  const sorted = [...progressEntries].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  
  const daysDiff = (new Date(last.recordedAt).getTime() - new Date(first.recordedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff === 0) return null;
  
  const valueDiff = last.value - first.value;
  return valueDiff / daysDiff;
}

export function getProjectedCompletionDate(goal: Goal, velocity: number): string | null {
  if (velocity <= 0 || !goal.targetValue) return null;
  
  const current = goal.currentValue || 0;
  const remaining = goal.targetValue - current;
  if (remaining <= 0) return new Date().toISOString();
  
  const daysNeeded = remaining / velocity;
  const projected = new Date();
  projected.setDate(projected.getDate() + Math.ceil(daysNeeded));
  return projected.toISOString();
}

export function isOnTrack(goal: Goal, velocity: number): boolean {
  const projectedDate = getProjectedCompletionDate(goal, velocity);
  if (!projectedDate) return false;
  
  return new Date(projectedDate) <= new Date(goal.endDate);
}
