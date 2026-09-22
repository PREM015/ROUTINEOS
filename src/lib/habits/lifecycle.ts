import { Habit, HabitOverride } from "@/types/habit";
import { isHabitScheduledForDate } from "./scheduling";
import { isHabitSkippedOnDate } from "./skip";
import { isHabitPaused } from "./pause";

export function canArchiveHabit(habit: Habit): { canArchive: boolean; reason?: string } {
  if (habit.status === 'ARCHIVED') {
    return { canArchive: false, reason: 'Habit is already archived' };
  }
  return { canArchive: true };
}

export function canDeleteHabit(_habit: Habit, hasLogs: boolean): { canDelete: boolean; reason?: string } {
  if (hasLogs) {
    return { canDelete: false, reason: 'Cannot delete habit with existing logs. Archive it instead.' };
  }
  return { canDelete: true };
}

export function getHabitHealthScore(completionRate: number, streak: number): number {
  const rateScore = Math.min(100, Math.max(0, completionRate * 100));
  const streakBonus = Math.min(20, streak * 2); 
  return Math.min(100, (rateScore * 0.8) + streakBonus);
}

export function getHabitStatus(habit: Habit, date: string, overrides: HabitOverride[]): 'scheduled' | 'skipped' | 'paused' | 'not-scheduled' | 'completed' | 'missed' {
  if (isHabitPaused(overrides, date)) return 'paused';
  if (isHabitSkippedOnDate(overrides, date)) return 'skipped';
  if (!isHabitScheduledForDate(habit, date, 'UTC')) return 'not-scheduled';
  
  return 'scheduled'; // Will be resolved to completed/missed by logs
}
