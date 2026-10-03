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

/**
 * `DayType` enum value → its presentation, for callers that have no
 * `DayTypeDefinition` row to read from.
 *
 * ## Why this is derived rather than a second hand-written table
 *
 * This used to be a literal `DAY_TYPE_CONFIG` in `constants/routine.ts`, and
 * `DEFAULT_DAY_TYPES` below is the same information again. When the day-type
 * work consolidated onto `DEFAULT_DAY_TYPES`, the literal was deleted and four
 * call sites were left importing a name that no longer existed — which `tsc
 * --noEmit` does not catch, because the four import it as a *value* from a
 * client-component path, and only Turbopack resolves that chain. The build
 * failed at `TodayDayType.tsx:13`.
 *
 * So it is built from `DEFAULT_DAY_TYPES` instead of restated. Two tables of the
 * same six day types cannot disagree, and the next label or colour change lands
 * in one place.
 *
 * `CUSTOM` has no built-in entry: it is the absence of a specific kind of day, so
 * it is deliberately absent here and the callers' `?? fallback` handles it. That
 * is why the type is `Partial`.
 */
interface DayTypePresentation {
  type: DayType;
  label: string;
  description: string;
  color: string;
  icon: string;
}

export const DAY_TYPE_CONFIG: Partial<Record<DayType, DayTypePresentation>> =
  DEFAULT_DAY_TYPES.reduce<Partial<Record<DayType, DayTypePresentation>>>(
    (acc, dt) => {
      acc[dt.enumValue] = {
        type: dt.enumValue,
        label: dt.name,
        description: dt.description,
        color: dt.color,
        icon: dt.icon,
      };
      return acc;
    },
    {}
  );

/**
 * `DayType` enum value → the slug the seeded `DayTypeDefinition` uses.
 *
 * `CUSTOM` is seeded explicitly rather than left out: it is in the `DayType` enum
 * but has no `DEFAULT_DAY_TYPES` entry, and a missing key here would be a
 * `Record<DayType, string>` that lied at exactly one value.
 */
export const ENUM_VALUE_TO_DAY_TYPE_SLUG = DEFAULT_DAY_TYPES.reduce<
  Partial<Record<DayType, string>>
>(
  (acc, dt) => {
    acc[dt.enumValue] = dt.slug;
    return acc;
  },
  // `CUSTOM` is in the enum but has no DEFAULT_DAY_TYPES entry. Seeded explicitly
  // so the value is total rather than `string | undefined` at exactly one key.
  { CUSTOM: 'custom' }
) as Record<DayType, string>;

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

/**
 * Canonical slug → `DayType`, normalising the separators first.
 *
 * Seeded slugs are hyphenated (`work-day`) but a slug arriving from a URL, a
 * user's template, or an older row can be `work_day` or `Work Day`. Normalising
 * both sides is what makes the lookup total instead of matching only the exact
 * seeded spelling.
 */
const SLUG_TO_ENUM_NORMALISED: Record<string, DayType> = Object.entries(
  ENUM_VALUE_TO_DAY_TYPE_SLUG
).reduce<Record<string, DayType>>(
  (acc, [enumValue, slug]) => {
    acc[normaliseDayTypeSlug(slug)] = enumValue as DayType;
    return acc;
  },
  {}
);

function normaliseDayTypeSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/[\s_-]+/g, '-');
}

export function enumValueForSlug(slug: string): DayType {
  if (typeof slug !== 'string' || slug.trim() === '') return 'CUSTOM';
  return SLUG_TO_ENUM_NORMALISED[normaliseDayTypeSlug(slug)] ?? 'CUSTOM';
}

/**
 * The canonical `DayType` list, in display order.
 *
 * `CUSTOM` is last on purpose: it is the absence of a specific kind of day, so
 * it is the least informative value and belongs at the end of any list.
 */
export const DAY_TYPES_ORDERED: readonly DayType[] = [
  ...DEFAULT_DAY_TYPES.map((dt) => dt.enumValue),
  'CUSTOM',
];

/** Narrow an untrusted value, e.g. out of parsed JSON, to a `DayType`. */
export function isDayType(value: unknown): value is DayType {
  return typeof value === 'string' && (DAY_TYPES_ORDERED as readonly string[]).includes(value);
}
