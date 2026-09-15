import { Habit } from "@/types/habit";
import { isBefore, parseISO } from "date-fns";

export function isHabitPaused(habit: Habit, date: string): boolean {
  if (habit.status !== 'PAUSED') return false;
  if (!habit.pausedUntil) return true; // Paused indefinitely
  
  return isBefore(new Date(date), new Date(habit.pausedUntil));
}

export function shouldAutoResume(habit: Habit, date: string): boolean {
  if (habit.status !== 'PAUSED' || !habit.pausedUntil) return false;
  
  return isBefore(new Date(habit.pausedUntil), new Date(date));
}

export function getPauseStatus(habit: Habit): { isPaused: boolean; pausedUntil: string | null; reason: string | null } {
  return {
    isPaused: habit.status === 'PAUSED',
    pausedUntil: habit.pausedUntil ? new Date(habit.pausedUntil).toISOString() : null,
    reason: habit.pauseReason ?? null
  };
}
