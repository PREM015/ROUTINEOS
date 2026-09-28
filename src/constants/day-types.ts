import type { DayType } from '@/generated/prisma';

/**
 * The canonical default day types.
 *
 * Previously there were FOUR independent hardcoded lists, and they disagreed:
 *
 *  - `scripts/seed-day-types.ts`   → "Work Day", "Low Energy Day" (writes rows)
 *  - `routine/page.tsx`            → "Weekday", "Low Energy"     (tabs, when the
 *                                    user has no rows, so it never hit the DB)
 *  - `settings/routine/page.tsx`   → its own third variant
 *  - `DayContextSelector.tsx`       → always prepends the enum labels
 *
 * That is why `/today` offered day types that `/routine` did not show: the two
 * screens were reading different arrays, and neither was necessarily the user's
 * data. Registration also never created the rows, so a new user had none at all
 * and every screen silently fell back to a hardcoded list.
 *
 * This module is now the single source of truth. `UserService` seeds these rows
 * at registration; the day-type pickers read the rows from the database rather
 * than this list. `scripts/seed-day-types.ts` imports from here too, so a
 * backfill of existing accounts can never drift from new ones.
 */
export interface DefaultDayType {
  name: string;
  slug: string;
  /** The `DayType` enum value this maps to, used by the natural-weekday resolver. */
  enumValue: DayType;
  color: string;
  icon: string;
  description: string;
  sortOrder: number;
}

export const DEFAULT_DAY_TYPES: readonly DefaultDayType[] = [
  {
    name: 'Work Day',
    slug: 'work-day',
    enumValue: 'WORKDAY',
    color: '#3b82f6',
    icon: 'briefcase',
    description: 'Standard work day routine',
    sortOrder: 0,
  },
  {
    name: 'Weekend',
    slug: 'weekend',
    enumValue: 'WEEKEND',
    color: '#22c55e',
    icon: 'sun',
    description: 'Weekend routine',
    sortOrder: 1,
  },
  {
    name: 'Holiday',
    slug: 'holiday',
    enumValue: 'HOLIDAY',
    color: '#f97316',
    icon: 'plane',
    description: 'Holiday routine',
    sortOrder: 2,
  },
  {
    name: 'Exam Day',
    slug: 'exam-day',
    enumValue: 'EXAM_DAY',
    color: '#8b5cf6',
    icon: 'graduation-cap',
    description: 'Exam preparation routine',
    sortOrder: 3,
  },
  {
    name: 'Low Energy Day',
    slug: 'low-energy-day',
    enumValue: 'LOW_ENERGY',
    color: '#f59e0b',
    icon: 'battery',
    description: 'Low energy recovery routine',
    sortOrder: 4,
  },
] as const;

/** `DayType` enum value → the slug the seeded `DayTypeDefinition` uses. */
export const ENUM_VALUE_TO_DAY_TYPE_SLUG: Record<DayType, string> =
  DEFAULT_DAY_TYPES.reduce(
    (acc, dt) => {
      acc[dt.enumValue] = dt.slug;
      return acc;
    },
    { CUSTOM: 'custom' } as Record<DayType, string>
  );

/**
 * The inverse: a `DayTypeDefinition.slug` → its `DayType` enum value.
 *
 * The picker needs this because `DayTypeDefinition` has no enum column, but
 * `RoutineException` stores both. Every user day type was being written as
 * `dayType: 'CUSTOM'`, so a seeded "Work Day" and a seeded "Weekend" were
 * indistinguishable once selected — the exception no longer said which kind of
 * day it was, and the natural-weekday resolver could not map back to it.
 *
 * Unknown slugs (a user's own invention) legitimately fall back to `'CUSTOM'`.
 */
export const SLUG_TO_ENUM_VALUE: Record<string, DayType> = Object.entries(
  ENUM_VALUE_TO_DAY_TYPE_SLUG
).reduce(
  (acc, [enumValue, slug]) => {
    acc[slug] = enumValue as DayType;
    return acc;
  },
  {} as Record<string, DayType>
);

export function enumValueForSlug(slug: string): DayType {
  return SLUG_TO_ENUM_VALUE[slug] ?? 'CUSTOM';
}
