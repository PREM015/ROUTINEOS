/**
 * Habit Scheduling Engine
 * Determines if a habit is scheduled for a given date.
 */

import { parseISO, getDay, format } from 'date-fns';

export type FrequencyType =
  | 'DAILY'
  | 'WEEKDAYS'        // Mon–Fri only
  | 'WEEKENDS'        // Sat–Sun only
  | 'SPECIFIC_DAYS'   // frequencyValue: "1,3,5" (0=Sun,1=Mon,...,6=Sat)
  | 'WEEKLY_TARGET'   // frequencyValue: "4" (4 times per week — no specific days)
  | 'MONTHLY_TARGET'  // frequencyValue: "20" (20 times per month)
  | 'ONE_TIME';       // Only on startDate

export interface HabitSchedule {
  id: string;
  frequencyType: FrequencyType;
  frequencyValue?: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string;  // YYYY-MM-DD
}

/**
 * Returns true if the habit is scheduled for the given date.
 * WEEKLY_TARGET and MONTHLY_TARGET are always "potentially scheduled"
 * — the caller decides whether to include them based on remaining count.
 */
export function isHabitScheduledForDate(habit: HabitSchedule, dateStr: string): boolean {
  const date = parseISO(dateStr);

  // Check date range
  if (dateStr < habit.startDate) return false;
  if (habit.endDate && dateStr > habit.endDate) return false;

  const dayOfWeek = getDay(date); // 0=Sun, 1=Mon, ..., 6=Sat

  switch (habit.frequencyType) {
    case 'DAILY':
      return true;

    case 'WEEKDAYS':
      return dayOfWeek >= 1 && dayOfWeek <= 5;

    case 'WEEKENDS':
      return dayOfWeek === 0 || dayOfWeek === 6;

    case 'SPECIFIC_DAYS': {
      if (!habit.frequencyValue) return false;
      const days = habit.frequencyValue.split(',').map(Number);
      return days.includes(dayOfWeek);
    }

    case 'WEEKLY_TARGET':
    case 'MONTHLY_TARGET':
      // These are always considered "available" every day.
      // Scoring should check if the weekly/monthly count is already met.
      return true;

    case 'ONE_TIME':
      return dateStr === habit.startDate;

    default:
      return false;
  }
}

/**
 * Get a human-readable frequency label.
 */
export function getFrequencyLabel(habit: HabitSchedule): string {
  switch (habit.frequencyType) {
    case 'DAILY': return 'Daily';
    case 'WEEKDAYS': return 'Weekdays';
    case 'WEEKENDS': return 'Weekends';
    case 'SPECIFIC_DAYS': {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days = (habit.frequencyValue || '').split(',').map(Number);
      return days.map(d => dayNames[d]).join(', ');
    }
    case 'WEEKLY_TARGET': return `${habit.frequencyValue}×/week`;
    case 'MONTHLY_TARGET': return `${habit.frequencyValue}×/month`;
    case 'ONE_TIME': return 'One time';
    default: return 'Custom';
  }
}
