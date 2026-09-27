import { DayType } from '@/generated/prisma';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { formatInTimeZone } from 'date-fns-tz';

const routineRepository = new RoutineRepository();

/**
 * Resolves the natural day type for a date (no exception check).
 * Used by day-mode API for displaying the natural day type.
 *
 * `date` is a calendar date (YYYY-MM-DD), so it is parsed as **UTC** midnight,
 * never local midnight. Parsing it locally made the result depend on the
 * server's timezone: on a host east of UTC (IST, CET, JST, …) `2026-10-03`
 * became `2026-10-02T18:30Z`, and formatting that back in UTC reported Friday
 * instead of Saturday — so a Saturday resolved to WORKDAY for every user whose
 * requests were served by such a host.
 */
export function resolveNaturalDayType(date: string, timezone: string): DayType {
  const dateObj = new Date(`${date}T00:00:00.000Z`);
  // `i` is the ISO weekday: Monday = 1 … Sunday = 7. Sunday is 7, not 0, so it
  // must be folded back to 0 before the weekend check — comparing against 0/6
  // directly classified every Sunday as a WORKDAY.
  const isoDay = Number(formatInTimeZone(dateObj, timezone, 'i'));
  const dayOfWeek = isoDay % 7;
  return dayOfWeek === 0 || dayOfWeek === 6 ? 'WEEKEND' : 'WORKDAY';
}

/**
 * Resolves the day type for a specific date, checking for RoutineException first.
 * This is the canonical function for day-type resolution across the entire application.
 */
export async function resolveDayTypeForDate(
  userId: string,
  date: string
): Promise<{
  dayType: DayType;
  dayTypeId: string | null;
  source: 'EXCEPTION' | 'NATURAL';
  templateId: string | null;
}> {
  // Check for routine exception
  const exception = await routineRepository.findException(userId, date);
  if (exception) {
    return {
      dayType: exception.dayType,
      dayTypeId: exception.dayTypeId ?? null,
      source: 'EXCEPTION',
      templateId: exception.templateId ?? null,
    };
  }

  // Get natural day type using UTC (date is YYYY-MM-DD)
  const dayType = resolveNaturalDayType(date, 'UTC');
  
  return {
    dayType,
    dayTypeId: null,
    source: 'NATURAL',
    templateId: null,
  };
}

/**
 * Get the slug for a DayType enum value
 */
export function getDayTypeSlug(dayType: DayType): string {
  const ENUM_TO_SLUG: Record<DayType, string> = {
    WORKDAY: 'work-day',
    WEEKEND: 'weekend',
    HOLIDAY: 'holiday',
    EXAM_DAY: 'exam-day',
    LOW_ENERGY: 'low-energy-day',
    CUSTOM: 'custom',
  };
  return ENUM_TO_SLUG[dayType] ?? dayType.toLowerCase();
}

/**
 * Find a DayTypeDefinition by slug for a user
 */
export async function findDayTypeDefinitionBySlug(
  userId: string,
  slug: string
) {
  return routineRepository.findDayTypeDefinitionBySlug(userId, slug);
}

/**
 * Find a routine template by day type ID
 */
export async function findTemplateByDayTypeId(
  userId: string,
  dayTypeId: string
) {
  return routineRepository.findTemplateByDayTypeId(userId, dayTypeId);
}