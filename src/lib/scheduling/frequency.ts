import type { HabitFrequencyType } from '@/generated/prisma/client';

export type FrequencyHabit = {
  frequencyType: HabitFrequencyType;
  frequencyValue?: string | null;
  startDate: Date | string;
  endDate?: Date | string | null;
};

export type FrequencyContext = {
  /** Completed occurrences in the relevant week or month before this date. */
  completedOccurrences?: number;
};

function toDateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function utcDay(date: string): number {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

function positiveInteger(value: string | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Resolves the recurrence rule only. Start/end bounds and overrides belong in
 * `getHabitEligibility`, so every caller composes them in the same order.
 */
export function isHabitDueByFrequency(
  habit: FrequencyHabit,
  date: string,
  context: FrequencyContext = {},
): boolean {
  switch (habit.frequencyType) {
    case 'DAILY':
      return true;
    case 'SPECIFIC_WEEKDAYS': {
      const weekdays = (habit.frequencyValue ?? '')
        .split(',')
        .map((day) => Number(day.trim()))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
      return weekdays.includes(utcDay(date));
    }
    case 'WEEKLY_TARGET': {
      const target = positiveInteger(habit.frequencyValue);
      return target !== null && (context.completedOccurrences ?? 0) < target;
    }
    case 'MONTHLY_TARGET': {
      const target = positiveInteger(habit.frequencyValue);
      return target !== null && (context.completedOccurrences ?? 0) < target;
    }
    case 'ONE_TIME':
      return date === toDateOnly(habit.startDate);
  }
}

export function frequencyLabel(habit: Pick<FrequencyHabit, 'frequencyType' | 'frequencyValue'>): string {
  switch (habit.frequencyType) {
    case 'DAILY': return 'Daily';
    case 'SPECIFIC_WEEKDAYS': return 'Specific weekdays';
    case 'WEEKLY_TARGET': return `${habit.frequencyValue ?? 1}× per week`;
    case 'MONTHLY_TARGET': return `${habit.frequencyValue ?? 1}× per month`;
    case 'ONE_TIME': return 'One time';
  }
}
