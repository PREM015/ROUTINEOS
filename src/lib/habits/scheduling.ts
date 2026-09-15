import { Habit } from "@/types/habit";
import { parseISO, getDay, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { parseFrequencyConfig } from "./frequency";

export function isHabitScheduledForDate(habit: Habit, date: string, timezone: string): boolean {
  if (habit.status === 'ARCHIVED') return false;

  const dateObj = new Date(date);
  const config = parseFrequencyConfig(habit.frequencyConfig as string | null);
  
  if (!config) return true; // Default to daily if no config

  switch (habit.frequencyType) {
    case 'DAILY':
      return true;
    case 'SPECIFIC_WEEKDAYS':
      if (config.daysOfWeek) {
        const dayOfWeek = getDay(dateObj); // 0 = Sunday, 1 = Monday
        return config.daysOfWeek.includes(dayOfWeek);
      }
      return false;
    case 'WEEKLY_TARGET':
      return true; // Technically scheduled every day until target is met, handled at UI level
    case 'MONTHLY_TARGET':
      return true; // Same as weekly target
    case 'ONE_TIME':
      return config.exactDates?.includes(date) ?? false;
    case 'CUSTOM':
      return true; // Simplification for now
    default:
      return false;
  }
}
