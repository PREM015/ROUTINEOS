import type { HabitOverrideType, HabitStatus } from '@/generated/prisma/client';
import { isHabitDueByFrequency, type FrequencyContext, type FrequencyHabit } from '@/lib/scheduling/frequency';

export type HabitOverrideForEligibility = {
  type: HabitOverrideType;
  startDate: string;
  endDate?: string | null;
};

export type HabitForEligibility = FrequencyHabit & {
  status: HabitStatus;
  overrides?: HabitOverrideForEligibility[];
};

export type HabitEligibility = {
  eligible: boolean;
  reason: 'ACTIVE' | 'INACTIVE' | 'OUTSIDE_DATE_RANGE' | 'OVERRIDDEN' | 'NOT_DUE';
  override?: HabitOverrideForEligibility;
};

function dateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function appliesOnDate(override: HabitOverrideForEligibility, date: string): boolean {
  const end = override.endDate ?? override.startDate;
  return override.startDate <= date && end >= date;
}

/** The one authoritative answer to “should this habit appear for this date?” */
export function getHabitEligibility(
  habit: HabitForEligibility,
  date: string,
  frequencyContext: FrequencyContext = {},
): HabitEligibility {
  if (habit.status !== 'ACTIVE') return { eligible: false, reason: 'INACTIVE' };

  const startDate = dateOnly(habit.startDate);
  const endDate = dateOnly(habit.endDate);
  if ((startDate && date < startDate) || (endDate && date > endDate)) {
    return { eligible: false, reason: 'OUTSIDE_DATE_RANGE' };
  }

  const override = habit.overrides?.find((item) => appliesOnDate(item, date));
  if (override && ['SKIP_TODAY', 'SKIP_RANGE', 'PAUSE', 'NOT_APPLICABLE'].includes(override.type)) {
    return { eligible: false, reason: 'OVERRIDDEN', override };
  }

  if (!isHabitDueByFrequency(habit, date, frequencyContext)) {
    return { eligible: false, reason: 'NOT_DUE', override };
  }

  return { eligible: true, reason: 'ACTIVE', override };
}
