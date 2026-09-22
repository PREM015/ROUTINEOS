import { Habit } from "@/types/habit";
import { parseISO } from "date-fns";
import { format as formatTz } from "date-fns-tz";
import { parseFrequencyConfig } from "./frequency";

export function isHabitScheduledForDate(habit: Habit, date: string, timezone: string = 'UTC'): boolean {
  if (habit.status === 'ARCHIVED') return false;

  const config = parseFrequencyConfig(habit.frequencyValue);
  
  if (!config) return true; // Default to daily if no config

  switch (habit.frequencyType) {
    case 'DAILY':
      return true;
    case 'SPECIFIC_WEEKDAYS':
      if (config.daysOfWeek) {
        // Resolve the weekday in the user's timezone: ISO day (1=Mon..7=Sun) -> 0=Sun..6=Sat
        const isoDay = Number(formatTz(parseISO(date), 'i', { timeZone: timezone }));
        const dayOfWeek = isoDay % 7;
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

export function isHabitScheduled(habit: Habit, date: string, timezone: string = 'UTC'): boolean {
  return isHabitScheduledForDate(habit, date, timezone);
}
