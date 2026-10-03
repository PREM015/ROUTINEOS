import { slugToDayType } from '@/constants/routine';
import type { DayType } from '@/generated/prisma';

/**
 * Does this habit apply on a day whose resolved day type is `resolved`?
 *
 * Split out of `eligibility.ts` so client components can use it. The original
 * module instantiates `HabitRepository` at module scope, so importing anything
 * from it in a `'use client'` file pulled Prisma — and its Node built-ins —
 * into the browser bundle. These two declarations are pure types and the
 * function is pure and synchronous, so they are safe anywhere.
 *
 * This file is re-exported from `eligibility.ts`; the server callers
 * (`scoring.service.ts`) keep importing from there and are unaffected.
 */

/**
 * The minimum shape needed to decide whether a habit applies to a day type.
 *
 * Both the eligibility check and the scoring pass need this decision, and they
 * must never disagree — if scoring included a habit that the eligibility check
 * excluded, a habit restricted to "Weekend" would be marked MISSED on a
 * Wednesday and quietly drag the daily score down for a day the user was never
 * meant to do it.
 */
export interface DayTypeRestrictedHabit {
  appliesEveryDay?: boolean | null;
  dayTypeAssignments?: { dayTypeId: string; dayType?: { slug: string | null } | null }[] | null;
}

/** The subset of `resolveDayTypeForDate`'s return that matters here. */
export interface ResolvedDayTypeLike {
  dayType: DayType;
  dayTypeId: string | null;
}

/**
 * Pure, synchronous and side-effect free, so it can be unit-tested and reused
 * by the scoring service without another round trip.
 *
 * Matching is by **id first, then by slug**. Matching on id alone is not
 * enough: `resolveDayTypeForDate` only produces a concrete `dayTypeId` when the
 * user happens to own a non-archived `DayTypeDefinition` for the resolved slug.
 * For a user who never created a "Weekend" definition the natural resolution is
 * `{ dayType: 'WEEKEND', dayTypeId: null }`, and an id-only comparison cannot
 * distinguish "not my day type" from "unknown day type" — which is exactly how
 * the old code ended up treating a restricted habit as applicable on every
 * single day.
 */
export function habitAppliesToDayType(
  habit: DayTypeRestrictedHabit,
  resolved: ResolvedDayTypeLike
): boolean {
  // Global habit: applies everywhere, no further checks.
  if (habit.appliesEveryDay !== false) return true;

  const assignments = habit.dayTypeAssignments ?? [];
  // A habit that is flagged as restricted but has no assignments matches
  // nothing. It is *not* treated as global: silently promoting it would make
  // the assignment disappear with no way for the user to notice.
  if (assignments.length === 0) return false;

  if (resolved.dayTypeId && assignments.some((a) => a.dayTypeId === resolved.dayTypeId)) {
    return true;
  }

  // Fall back to the slug → enum mapping, which is stable regardless of whether
  // the user owns a DayTypeDefinition row for it.
  //
  // Restricted to the two *natural* day types, because `slugToDayType` collapses
  // every unrecognised slug to `CUSTOM`: a habit assigned to "GATE Day" and a
  // habit assigned to "College Day" would both map to `CUSTOM` and a
  // GATE-day habit would then be reported as applying to a College Day. Id
  // matching is the only safe discriminator for custom day types, so when there
  // is no id we decline rather than guess — showing a habit on the wrong day is
  // worse than hiding it, and the /habits card now shows each habit's day-type
  // chips so the situation is visible rather than silent.
  if (resolved.dayType !== 'WORKDAY' && resolved.dayType !== 'WEEKEND') {
    return false;
  }

  return assignments.some((a) => {
    const slug = a.dayType?.slug;
    if (typeof slug !== 'string') return false;
    return slugToDayType(slug) === resolved.dayType;
  });
}
