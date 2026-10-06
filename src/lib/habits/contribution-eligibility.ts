import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { DayType, HabitFrequencyType, HabitStatus, HabitTier } from '@/generated/prisma';
import { DEFAULT_TZ } from '@/lib/dates';
import { habitAppliesToDayType } from '@/lib/habits/day-type-match';
import { isHabitScheduledForDate } from '@/lib/habits/scheduling';
import type { ResolvedDayTypeLike } from '@/lib/habits/day-type-match';

/**
 * The eligibility rule, made evaluable across a whole year without a query per
 * cell.
 *
 * ## Why this exists rather than calling `calculateHabitEligibility`
 *
 * The canonical rule in `calculateHabitEligibility` is correct but costs 2-4
 * queries per habit per date: `findById`, `findActiveOverrides`, and - only for
 * day-type-restricted habits - `resolveDayTypeForDate`. A 365-day grid over 12
 * habits is ~5,000 queries, which is not a slow page, it is a denial of service
 * against the database.
 *
 * Every one of those *lookups* is bulk-loadable. Every one of those *rules* was
 * already pure: `isHabitScheduledForDate` (frequency), `habitAppliesToDayType`
 * (day type), and plain date comparison. So this module hoists the lookups into
 * a context the caller fills once, and then applies **the same rules in the same
 * order** synchronously.
 *
 * ## The duplication is deliberate and bounded
 *
 * This is a second implementation of the rule, which is normally how two
 * definitions end up disagreeing - the exact failure the previous dashboard
 * audit recorded. Two things keep it honest:
 *
 *  1. The rule bodies below are `return` statements in the same order as
 *     `calculateHabitEligibility`, and the reasons are the same enum values.
 *  2. `tests/lib/habit-contribution-eligibility.test.ts` pins the precedence
 *     cases that are easy to get subtly wrong - skip beats reschedule, pause
 *     beats both, day-type is checked before frequency, and so on.
 *
 * If `calculateHabitEligibility` changes, this file is the second thing to
 * change. It is not the first, because it cannot be: the alternative is 5,000
 * queries.
 */

/** The subset of `Habit` this needs. */
export interface ContributionHabit {
  id: string;
  name: string;
  tier: HabitTier;
  status: HabitStatus;
  frequencyType: HabitFrequencyType;
  frequencyValue: string | null;
  appliesEveryDay: boolean;
  /** Calendar day in `DEFAULT_TZ`, precomputed by the caller. */
  startDay: string;
  /** Calendar day in `DEFAULT_TZ`, or `null` for an open-ended habit. */
  endDay: string | null;
  dayTypeAssignments: { dayTypeId: string; dayType?: { slug: string | null } | null }[];
  color: string | null;
  icon: string | null;
  points: number | null;
  /** The habit's own cached streak, carried through so a daily view need not re-read it. */
  streakCount: number;
}

export interface OverrideLike {
  habitId: string;
  type: string;
  startDate: string;
  endDate: string | null;
}

export interface EligibilityContext {
  /** Every override that is active anywhere in the window, grouped by habit. */
  overrides: Map<string, OverrideLike[]>;
  /** Pre-resolved day type per date, so the day-type check costs no query. */
  dayTypes: Map<string, ResolvedDayTypeLike>;
}

export type IneligibleReason =
  | 'ARCHIVED'
  | 'PAUSED'
  | 'BEFORE_START_DATE'
  | 'AFTER_END_DATE'
  | 'SKIPPED'
  | 'PAUSE_OVERRIDE'
  | 'NOT_APPLICABLE'
  | 'DAY_TYPE_MISMATCH'
  | 'NOT_SCHEDULED';

export interface EligibilityResult {
  eligible: boolean;
  reason: IneligibleReason | null;
  /** `true` when a `RESCHEDULE` override put the habit on a day it was not due. */
  manual: boolean;
}

/**
 * The same precedence as `calculateHabitEligibility`, with no I/O.
 *
 * Order matters and is not arbitrary:
 *   archived/paused -> date bounds -> skip -> pause -> not-applicable
 *   -> day type -> frequency, with reschedule overriding frequency only.
 *
 * A `RESCHEDULE` override is an ad-hoc inclusion ("add this to today"), so it
 * makes an otherwise-unscheduled habit eligible but must still yield to an
 * explicit skip, pause or not-applicable, which are all "do not ask me this".
 */
export function isEligibleOn(
  habit: ContributionHabit,
  date: string,
  ctx: EligibilityContext
): EligibilityResult {
  if (habit.status === 'ARCHIVED') return { eligible: false, reason: 'ARCHIVED', manual: false };
  if (habit.status === 'PAUSED') return { eligible: false, reason: 'PAUSED', manual: false };

  if (date < habit.startDay) {
    return { eligible: false, reason: 'BEFORE_START_DATE', manual: false };
  }
  if (habit.endDay !== null && date > habit.endDay) {
    return { eligible: false, reason: 'AFTER_END_DATE', manual: false };
  }

  const overrides = ctx.overrides.get(habit.id) ?? [];
  const active = overrides.filter(
    (o) => o.startDate <= date && (o.endDate === null || o.endDate >= date)
  );

  if (
    active.some(
      (o) =>
        (o.type === 'SKIP_TODAY' || o.type === 'SKIP_RANGE') &&
        // Same single-day rule as `calculateHabitEligibility`: a `SKIP_TODAY`
        // whose `endDate` was never written must not swallow every later date.
        (o.type === 'SKIP_TODAY' ? o.startDate === date : true)
    )
  ) {
    return { eligible: false, reason: 'SKIPPED', manual: false };
  }
  if (active.some((o) => o.type === 'PAUSE')) {
    return { eligible: false, reason: 'PAUSE_OVERRIDE', manual: false };
  }
  if (active.some((o) => o.type === 'NOT_APPLICABLE')) {
    return { eligible: false, reason: 'NOT_APPLICABLE', manual: false };
  }

  const manual = active.some(
    (o) => o.type === 'RESCHEDULE' && (o.endDate === null || o.endDate >= date)
  );

  if (habit.appliesEveryDay === false) {
    const resolved = ctx.dayTypes.get(date);
    // An unresolvable day type cannot be evidence of a mismatch, and treating it
    // as one would hide every restricted habit on days the user has no
    // DayTypeDefinition for. `habitAppliesToDayType` is given the natural
    // fallback so the comparison still happens rather than being skipped.
    const dayType = resolved ?? { dayType: 'WORKDAY' as DayType, dayTypeId: null };
    if (!habitAppliesToDayType(habit, dayType)) {
      return { eligible: false, reason: 'DAY_TYPE_MISMATCH', manual: false };
    }
  }

  const scheduled = isHabitScheduledForDate(
    {
      frequencyType: habit.frequencyType,
      frequencyValue: habit.frequencyValue,
      status: habit.status,
    },
    date
  );

  if (!scheduled && !manual) {
    return { eligible: false, reason: 'NOT_SCHEDULED', manual: false };
  }

  return { eligible: true, reason: null, manual };
}

/**
 * A `Habit` row -> the narrow shape the rule needs.
 *
 * `startDay` / `endDay` are formatted in `DEFAULT_TZ` deliberately, to match
 * `calculateHabitEligibility` exactly.
 *
 * That pinning is itself a documented smell - every other date comparison in the
 * habits system uses the user's zone - so the two can disagree by a day for a
 * user far from IST. Matching it here is still the right call for *this* feature:
 * a contribution grid whose habit-start boundary differs from the `/today`
 * checklist would be a new instance of the "two definitions, one page" bug, and
 * fixing the zone is a change that belongs in `calculateHabitEligibility` where
 * every caller sees it at once.
 */
export function toContributionHabit(habit: {
  id: string;
  name: string;
  tier: HabitTier;
  status: HabitStatus;
  frequencyType: HabitFrequencyType;
  frequencyValue: string | null;
  appliesEveryDay: boolean;
  startDate: Date;
  endDate: Date | null;
  color: string | null;
  icon: string | null;
  points: number | null;
  streakCount: number;
  dayTypeAssignments: { dayTypeId: string; dayType?: { slug: string | null } | null }[];
}): ContributionHabit {
  return {
    id: habit.id,
    name: habit.name,
    tier: habit.tier,
    status: habit.status,
    frequencyType: habit.frequencyType,
    frequencyValue: habit.frequencyValue,
    appliesEveryDay: habit.appliesEveryDay,
    startDay: format(toZonedTime(habit.startDate, DEFAULT_TZ), 'yyyy-MM-dd'),
    endDay: habit.endDate ? format(toZonedTime(habit.endDate, DEFAULT_TZ), 'yyyy-MM-dd') : null,
    color: habit.color,
    icon: habit.icon,
    points: habit.points,
    streakCount: habit.streakCount,
    dayTypeAssignments: habit.dayTypeAssignments,
  };
}
