import { Habit, HabitFrequencyConfig } from "@/types/habit";
import { parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, differenceInDays } from "date-fns";

export function getWeeklyCompletionTarget(habit: Habit, weekStart: Date, weekEnd: Date): number {
  if (habit.frequencyType === 'WEEKLY_TARGET') {
    const config = parseFrequencyConfig(habit.frequencyConfig as string | null);
    return config?.targetDays ?? 7;
  }
  return 7; // Default max
}

export function getMonthlyCompletionTarget(habit: Habit, month: number, year: number): number {
  if (habit.frequencyType === 'MONTHLY_TARGET') {
    const config = parseFrequencyConfig(habit.frequencyConfig as string | null);
    return config?.targetDays ?? 30;
  }
  return 30; // Default max
}

export function parseFrequencyConfig(config: string | null): HabitFrequencyConfig | null {
  if (!config) return null;
  try {
    return JSON.parse(config) as HabitFrequencyConfig;
  } catch {
    return null;
  }
}

export function frequencyToHumanString(config: HabitFrequencyConfig | null): string {
  if (!config) return 'Daily';
  
  const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  if (config.daysOfWeek && config.daysOfWeek.length > 0) {
    const days = config.daysOfWeek.map(d => daysMap[d]).join(', ');
    return `Every ${days}`;
  }
  
  if (config.targetDays) {
    return `${config.targetDays} times per period`;
  }

  return 'Custom Schedule';
}
