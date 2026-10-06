import { HabitOverride } from "@/types/habit";
import type { UserId } from '@/types/ids';

export function createSkipOverride(
  habitId: string,
  userId: UserId,
  date: string,
  reason: string
): Pick<HabitOverride, 'habitId' | 'userId' | 'type' | 'startDate' | 'endDate' | 'reason'> {
  return {
    habitId,
    userId,
    type: 'SKIP_TODAY',
    startDate: date,
    // Inclusive single day. Readers treat `endDate: null` as open-ended, so
    // omitting this made a one-day skip permanent.
    endDate: date,
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