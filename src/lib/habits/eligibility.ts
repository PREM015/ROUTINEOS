import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { HabitEligibility, HabitEligibilityReason } from '@/types/habit';
import { DEFAULT_TZ } from '@/lib/dates';
import { isHabitScheduledForDate } from './scheduling';
import { resolveDayTypeForDate } from '@/lib/scheduling/resolve-routine';
import { UserRepository } from '@/server/repositories/user.repository';
import { habitAppliesToDayType } from './day-type-match';

/**
 * Habit Eligibility
 * Determine if a habit should be completed on a given date
 */

const habitRepository = new HabitRepository();

/*
 * Re-exported for the server callers that already import from here
 * (`scoring.service.ts`). The implementation now lives in `day-type-match.ts`
 * so that client components can use it without this module's
 * `new HabitRepository()` at module scope dragging Prisma into the browser
 * bundle.
 */
export {
  habitAppliesToDayType,
  type DayTypeRestrictedHabit,
  type ResolvedDayTypeLike,
} from './day-type-match';

export async function calculateHabitEligibility(
  habitId: string,
  userId: string,
  date: string,
  /**
   * Optional pre-resolved timezone.
   *
   * Callers that evaluate a whole list of habits for one date (`getHabitsForDate`
   * does this for every ACTIVE habit) should resolve the timezone once and pass
   * it in. Resolving it per habit turns one `UserSettings` read into N. Same
   * reasoning applies to the day-type resolution below.
   */
  timezone?: string
): Promise<HabitEligibility> {
  // Get habit with day type assignments
  const habit = await habitRepository.findById(habitId, userId, { includeDayTypeAssignments: true });
  if (!habit) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: 'HABIT_NOT_FOUND' as HabitEligibilityReason,
    };
  }

  // Check if archived
  if (habit.status === 'ARCHIVED') {
    return {
      habitId,
      date,
      isEligible: false,
      reason: HabitEligibilityReason.ARCHIVED,
    };
  }

  // Check if paused
  if (habit.status === 'PAUSED') {
    return {
      habitId,
      date,
      isEligible: false,
      reason: HabitEligibilityReason.PAUSED,
    };
  }

  // Check start and end dates (calendar-day comparison in the user's timezone,
  // so a habit created "today" is eligible today).
  const startDay = format(toZonedTime(habit.startDate, DEFAULT_TZ), 'yyyy-MM-dd');
  if (date < startDay) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: HabitEligibilityReason.BEFORE_START_DATE,
    };
  }

  if (habit.endDate) {
    const endDay = format(toZonedTime(habit.endDate, DEFAULT_TZ), 'yyyy-MM-dd');
    if (date > endDay) {
      return {
        habitId,
        date,
        isEligible: false,
        reason: HabitEligibilityReason.AFTER_END_DATE,
      };
    }
  }

  // Check for active overrides
  const overrides = await habitRepository.findActiveOverrides(habitId, userId, date);
  const skipOverride = overrides.find(o => o.type === 'SKIP_TODAY' || o.type === 'SKIP_RANGE');
  if (skipOverride) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: HabitEligibilityReason.SKIPPED,
      override: skipOverride,
    };
  }

  const pauseOverride = overrides.find(o => o.type === 'PAUSE');
  if (pauseOverride) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: HabitEligibilityReason.PAUSED,
      override: pauseOverride,
    };
  }

  const notApplicableOverride = overrides.find(o => o.type === 'NOT_APPLICABLE');
  if (notApplicableOverride) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: HabitEligibilityReason.NOT_APPLICABLE,
      override: notApplicableOverride,
    };
  }

  // A RESCHEDULE override covering this date marks a manual ad-hoc inclusion
  // for the day (added directly to today's list rather than by frequency). It
  // overrides the schedule check below but still yields to skip/pause/NA above.
  const rescheduleOverride = overrides.find(
    o =>
      o.type === 'RESCHEDULE' &&
      o.startDate <= date &&
      (o.endDate === null || o.endDate === undefined || o.endDate >= date)
  );

  // Check day type filtering.
  //
  // This used to read:
  //
  //   if (appliesEveryDay === false && assignments.length > 0) {
  //     const info = await resolveDayTypeForDate(userId, date);
  //     if (info.dayTypeId) {            // <-- the bug
  //       if (!assignments.some(...)) return NOT_ELIGIBLE;
  //     }
  //   }
  //
  // The `if (info.dayTypeId)` guard meant that whenever the resolved day type
  // had no `DayTypeDefinition` row — which is the normal case for a user who
  // never created one for their natural WORKDAY/WEEKEND — the entire filter was
  // skipped and a day-type-restricted habit was reported eligible on **every
  // day**. The habit looked correctly hidden on the days that did have a
  // definition and leaked everywhere else.
  //
  // The resolution is done lazily: `resolveDayTypeForDate` costs a query, and
  // the overwhelming majority of habits are global, so paying for it
  // unconditionally would be a regression on the hot list path.
  if (habit.appliesEveryDay === false) {
    const dayTypeInfo = await resolveDayTypeForDate(userId, date);
    if (!habitAppliesToDayType(habit, dayTypeInfo)) {
      return {
        habitId,
        date,
        isEligible: false,
        reason: HabitEligibilityReason.DAY_TYPE_MISMATCH,
        source: 'DAY_TYPE_FILTER',
      };
    }
  }

  // The frequency schedule is a calendar question, so it has to be asked in the
  // user's own timezone. It was pinned to `DEFAULT_TZ` (UTC), which shifted the
  // boundary by a day for anyone not on UTC — a daily habit at 21:00 IST was
  // evaluated against the previous calendar day.
  const resolvedTimezone =
    timezone ??
    (await new UserRepository()
      .getSettings(userId)
      .then((s) => s?.timezone || DEFAULT_TZ)
      .catch(() => DEFAULT_TZ));

  // Check if scheduled for this date
  const scheduled = isHabitScheduledForDate(habit, date, resolvedTimezone);
  if (!scheduled && !rescheduleOverride) {
    return {
      habitId,
      date,
      isEligible: false,
      reason: HabitEligibilityReason.NOT_SCHEDULED,
      source: 'SCHEDULED',
    };
  }

  // Habit is eligible
  return {
    habitId,
    date,
    isEligible: true,
    source: rescheduleOverride && !scheduled ? 'MANUAL' : 'SCHEDULED',
    ...(rescheduleOverride ? { override: rescheduleOverride } : {}),
  };
}

export async function checkHabitEligibility(
  habitId: string,
  userId: string,
  date: string
): Promise<boolean> {
  const eligibility = await calculateHabitEligibility(habitId, userId, date);
  return eligibility.isEligible;
}