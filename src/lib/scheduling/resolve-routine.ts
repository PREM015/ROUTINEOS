import { DayType } from '@/generated/prisma';
import { ENUM_TO_SLUG } from '@/constants/routine';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Built on first use, not at import time.
 *
 * The pure helpers below (`resolveNaturalDayType`, `resolveDayTypeFromException`)
 * are importable without a database, but `new RoutineRepository()` at module
 * scope constructs a Prisma client, which throws when `DATABASE_URL` is absent.
 * That made this module unusable from any test that only wanted the pure rule.
 */
let repository: RoutineRepository | null = null;
function getRoutineRepository(): RoutineRepository {
  if (!repository) repository = new RoutineRepository();
  return repository;
}

/**
 * Resolves the natural day type for a date (no exception check).
 * Used by day-mode API for displaying the natural day type.
 *
 * `date` is a calendar date (YYYY-MM-DD), so its weekday is intrinsic: it must
 * NOT be derived by formatting an instant in some timezone.
 *
 * Two separate bugs lived here:
 *
 *  1. The date was parsed as **local** midnight. On a host east of UTC (IST,
 *     CET, JST, …) `2026-10-03` became `2026-10-02T18:30Z`, and formatting that
 *     back in UTC reported Friday instead of Saturday — so a Saturday resolved
 *     to WORKDAY for every user served by such a host. It is now parsed as UTC
 *     midnight.
 *
 *  2. The UTC instant was then formatted in `timezone`. A zone behind UTC
 *     renders UTC midnight as the *previous* day, so `2026-10-05` (a Monday)
 *     formatted in `America/New_York` became Sunday and resolved to WEEKEND —
 *     every user west of UTC had their weekdays and weekends swapped. The
 *     instant is now always formatted in UTC.
 *
 * `timezone` is retained in the signature because callers pass the user's zone
 * and a caller may legitimately want the day *as experienced locally*; it just
 * no longer influences the calendar date's own weekday.
 */
export function resolveNaturalDayType(date: string, _timezone?: string): DayType {
  const dateObj = new Date(`${date}T00:00:00.000Z`);
  // `i` is the ISO weekday: Monday = 1 … Sunday = 7. Sunday is 7, not 0, so it
  // must be folded back to 0 before the weekend check — comparing against 0/6
  // directly classified every Sunday as a WORKDAY.
  const isoDay = Number(formatInTimeZone(dateObj, 'UTC', 'i'));
  const dayOfWeek = isoDay % 7;
  return dayOfWeek === 0 || dayOfWeek === 6 ? 'WEEKEND' : 'WORKDAY';
}

/** The subset of a `RoutineException` that day-type resolution needs. */
export interface DayTypeExceptionLike {
  dayType: DayType;
  dayTypeId?: string | null;
  templateId?: string | null;
}

export interface ResolvedDayType {
  dayType: DayType;
  dayTypeId: string | null;
  /** The user's display name for `dayTypeId`, when it can be resolved. */
  dayTypeName: string | null;
  source: 'EXCEPTION' | 'NATURAL';
  templateId: string | null;
}

/**
 * THE day-type rule, in one place: a `RoutineException` wins, otherwise fall
 * back to the natural weekday-derived type.
 *
 * Pure and synchronous, so callers that have already bulk-loaded their
 * exceptions can apply the same rule without issuing a query per date. Three
 * call sites previously hand-rolled this precedence independently, which meant a
 * change to the rule had to be made in three places to stay consistent.
 *
 * `timezone` is only used for the natural fallback. Pass `'UTC'` for calendar
 * dates (`YYYY-MM-DD`), which is what `resolveNaturalDayType` expects.
 */
export function resolveDayTypeFromException(
  date: string,
  timezone: string,
  exception?: DayTypeExceptionLike | null,
  /** Definition row for the exception, when the caller already loaded it. */
  definition?: { id: string; name: string } | null,
): ResolvedDayType {
  if (exception) {
    return {
      dayType: exception.dayType,
      dayTypeId: exception.dayTypeId ?? null,
      dayTypeName: definition?.name ?? null,
      source: 'EXCEPTION',
      templateId: exception.templateId ?? null,
    };
  }

  const dayType = resolveNaturalDayType(date, timezone);
  return {
    dayType,
    dayTypeId: null,
    dayTypeName: null,
    source: 'NATURAL',
    templateId: null,
  };
}

/**
 * Resolves the day type for a specific date, checking for RoutineException first.
 * This is the canonical function for day-type resolution across the entire application.
 *
 * The natural (no-exception) branch also resolves the matching
 * `DayTypeDefinition` — a plain Monday maps to the user's own "Workday"
 * definition. Returning `dayTypeId: null` there is what made day-type filtering
 * of habits and goals dead code: `lib/habits/eligibility.ts` and
 * `goal.service.ts` both gate on `dayTypeId`, so on any ordinary weekday the
 * gate never opened and a habit assigned to a specific day type appeared on
 * every day of the week.
 */
export async function resolveDayTypeForDate(
  userId: string,
  date: string,
): Promise<ResolvedDayType> {
  // Check for routine exception
  const exception = await getRoutineRepository().findException(userId, date);

  if (exception) {
    const definition = exception.dayTypeId
      ? await getRoutineRepository()
          .findDayTypeDefinitionById(exception.dayTypeId, userId)
          .catch(() => null)
      : null;
    return resolveDayTypeFromException(date, 'UTC', exception, definition);
  }

  // Natural day type, mapped onto the user's own definition so callers get a
  // concrete id to match habit/goal assignments against.
  const dayType = resolveNaturalDayType(date, 'UTC');
  const definition = await getRoutineRepository()
    .findDayTypeDefinitionBySlug(userId, getDayTypeSlug(dayType))
    .catch(() => null);

  return {
    dayType,
    dayTypeId: definition?.id ?? null,
    dayTypeName: definition?.name ?? null,
    source: 'NATURAL',
    templateId: null,
  };
}

/**
 * Get the slug for a DayType enum value
 */
export function getDayTypeSlug(dayType: DayType): string {
  return ENUM_TO_SLUG[dayType] ?? dayType.toLowerCase();
}

/**
 * Find a DayTypeDefinition by slug for a user
 */
export async function findDayTypeDefinitionBySlug(userId: string, slug: string) {
  return getRoutineRepository().findDayTypeDefinitionBySlug(userId, slug);
}

/**
 * Find a routine template by day type ID
 */
export async function findTemplateByDayTypeId(userId: string, dayTypeId: string) {
  return getRoutineRepository().findTemplateByDayTypeId(userId, dayTypeId);
}
