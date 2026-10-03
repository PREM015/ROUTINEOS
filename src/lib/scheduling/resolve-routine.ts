import { RoutineRepository } from '@/server/repositories/routine.repository';
import {
  getDayTypeSlug,
  resolveDayTypeFromException,
  resolveNaturalDayType,
  type DayTypeExceptionLike,
  type ResolvedDayType,
} from '@/lib/scheduling/day-type';
import type { UserId } from '@/types/ids';

/**
 * Database-backed day-type resolution.
 *
 * The pure half of this module - the rule that decides whether an exception wins
 * over the natural weekday - now lives in `./day-type`, which imports no
 * repository. It is re-exported below so the eight existing call sites
 * (`day-mode.service`, `goal.service`, `scoring.service`, `routine.service`,
 * `notifications/scheduler`, `habits/eligibility`, `context`, and the dashboard
 * derivation) keep a single import path.
 *
 * That split is not cosmetic. Keeping the rule here meant importing anything from
 * this file transitively evaluated `@/lib/prisma`, which **throws at import time**
 * without `DATABASE_URL` - so the pure rule was untestable and any test wanting it
 * had to mock the whole repository layer. `day-type.ts` has no such import and is
 * usable with no environment at all.
 */

/**
 * Built on first use, not at import time, so merely importing this module does
 * not construct a Prisma client.
 */
let repository: RoutineRepository | null = null;
function getRoutineRepository(): RoutineRepository {
  if (!repository) repository = new RoutineRepository();
  return repository;
}

/**
 * Resolves the day type for a specific date, checking for RoutineException first.
 * This is the canonical database-backed function for day-type resolution across
 * the entire application.
 *
 * The natural (no-exception) branch also resolves the matching
 * `DayTypeDefinition` - a plain Monday maps to the user's own "Workday"
 * definition. Returning `dayTypeId: null` there is what made day-type filtering
 * of habits and goals dead code: `lib/habits/eligibility.ts` and
 * `goal.service.ts` both gate on `dayTypeId`, so on an ordinary weekday the gate
 * never opened and a habit assigned to a specific day type appeared on every day
 * of the week.
 *
 * Callers resolving MANY dates should not use this. It is 2 queries per call. Bulk
 * -load the definitions and exceptions once and apply `resolveDayTypeFromException`
 * from `./day-type` instead - which is what `DashboardOverviewService` does for its
 * 30-day window.
 */
export async function resolveDayTypeForDate(
  userId: UserId,
  date: string
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
 * Find a day type definition by slug for a user
 */
export async function findDayTypeDefinitionBySlug(userId: UserId, slug: string) {
  return getRoutineRepository().findDayTypeDefinitionBySlug(userId, slug);
}

/**
 * Find a routine template by day type ID
 */
export async function findTemplateByDayTypeId(userId: UserId, dayTypeId: string) {
  return getRoutineRepository().findTemplateByDayTypeId(userId, dayTypeId);
}

/*
 * Re-exported so the eight existing call sites keep one import path, and so there
 * is exactly one implementation of the rule in the repo.
 */
export {
  getDayTypeSlug,
  resolveDayTypeFromException,
  resolveNaturalDayType,
  type DayTypeExceptionLike,
  type ResolvedDayType,
};
