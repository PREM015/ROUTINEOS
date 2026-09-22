import { HabitOverride } from "@/types/habit";

export function isHabitPaused(overrides: HabitOverride[], date: string): boolean {
  return overrides.some(
    o => o.type === 'PAUSE' && o.startDate <= date && (!o.endDate || date < o.endDate)
  );
}

export function getPauseStatus(
  overrides: HabitOverride[]
): { isPaused: boolean; pausedUntil: string | null; reason: string | null } {
  const pause = overrides.find(o => o.type === 'PAUSE');
  return {
    isPaused: pause !== undefined,
    pausedUntil: pause?.endDate ?? null,
    reason: pause?.reason ?? null,
  };
}

export function shouldAutoResume(overrides: HabitOverride[], date: string): boolean {
  return overrides.some(o => o.type === 'PAUSE' && o.endDate !== null && date > o.endDate!);
}