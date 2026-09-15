import { HabitOverride } from "@/types/habit";
import { format } from "date-fns";

export function createSkipOverride(habitId: string, userId: string, date: string, reason: string): Partial<HabitOverride> {
  return {
    habitId,
    userId,
    date,
    overrideType: 'SKIP',
    reason
  };
}

export function isHabitSkippedOnDate(overrides: HabitOverride[], date: string): boolean {
  return overrides.some(o => o.date === date && o.overrideType === 'SKIP');
}

export function getSkipReason(overrides: HabitOverride[], date: string): string | null {
  const override = overrides.find(o => o.date === date && o.overrideType === 'SKIP');
  return override?.reason ?? null;
}
