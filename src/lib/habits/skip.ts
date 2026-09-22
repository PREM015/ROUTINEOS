import { HabitOverride } from "@/types/habit";

export function createSkipOverride(
  habitId: string,
  userId: string,
  date: string,
  reason: string
): Pick<HabitOverride, 'habitId' | 'userId' | 'type' | 'startDate' | 'reason'> {
  return {
    habitId,
    userId,
    type: 'SKIP_TODAY',
    startDate: date,
    reason,
  };
}

export function isHabitSkippedOnDate(overrides: HabitOverride[], date: string): boolean {
  return overrides.some(o => o.type === 'SKIP_TODAY' && o.startDate === date);
}

export function getSkipReason(overrides: HabitOverride[], date: string): string | null {
  const override = overrides.find(o => o.type === 'SKIP_TODAY' && o.startDate === date);
  return override?.reason ?? null;
}