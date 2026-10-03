import type { DayType } from '@/generated/prisma';
import { ENUM_TO_SLUG } from '@/constants/routine';
import { shiftCalendarDay } from '@/lib/dates';
import {
  resolveDayTypeFromException,
  resolveNaturalDayType,
} from '@/lib/scheduling/day-type';
import type {
  EligibilityContext,
  OverrideLike,
} from '@/lib/habits/contribution-eligibility';

/**
 * Fill the in-memory eligibility context for a date range.
 *
 * `calculateHabitEligibility` resolves a day type with two queries per date
 * (`listDayTypeDefinitions` + `findExceptionsByRange`), so it is 2-4 queries per
 * habit per date. Both lookups are bulk-loadable and the *rule* is already pure,
 * which is what lets a whole year be scored in a fixed number of queries.
 *
 * Extracted from `HabitContributionService` so the analytics period model and the
 * contribution heatmap build the context from one function. Two copies of this
 * would be free to disagree about which definition a habit maps to, and that
 * disagreement would be invisible - both would still compile.
 */

export interface DayTypeExceptionRow {
  date: string;
  dayTypeId: string | null;
  dayType: DayType;
}

export interface DayTypeDefinitionRow {
  id: string;
  slug: string;
  name: string;
}

export function buildEligibilityContext(
  overrides: OverrideLike[],
  definitions: DayTypeDefinitionRow[],
  exceptions: DayTypeExceptionRow[],
  range: { from: string; to: string }
): EligibilityContext {
  const overridesByHabit = new Map<string, OverrideLike[]>();
  for (const override of overrides) {
    const list = overridesByHabit.get(override.habitId) ?? [];
    list.push(override);
    overridesByHabit.set(override.habitId, list);
  }

  const byId = new Map(definitions.map((d) => [d.id, d]));
  const bySlug = new Map(definitions.map((d) => [d.slug, d]));
  const exceptionByDate = new Map(exceptions.map((e) => [e.date, e]));

  const dayTypes = new Map<string, { dayType: DayType; dayTypeId: string | null }>();

  // 1. Every date carrying an exception, resolved through the canonical rule.
  for (const [date, exception] of exceptionByDate) {
    const definition = exception.dayTypeId ? byId.get(exception.dayTypeId) : undefined;
    const resolved = resolveDayTypeFromException(
      date,
      'UTC',
      { dayType: exception.dayType, dayTypeId: exception.dayTypeId },
      definition ? { id: definition.id, name: definition.name } : null
    );
    dayTypes.set(date, { dayType: resolved.dayType, dayTypeId: resolved.dayTypeId });
  }

  // 2. Every other date in the range, via the same natural rule - and mapped onto
  //    the user's own `DayTypeDefinition` by slug, exactly as
  //    `resolveDayTypeForDate` does on its natural branch. Without that mapping a
  //    day-type-restricted habit is filtered by id, the id is `null`, and the
  //    restriction silently stops applying - the bug documented on
  //    `habitAppliesToDayType`.
  for (let date = range.from; date <= range.to; date = shiftCalendarDay(date, 1)) {
    if (dayTypes.has(date)) continue;
    const dayType = resolveNaturalDayType(date, 'UTC');
    dayTypes.set(date, {
      dayType,
      dayTypeId: bySlug.get(ENUM_TO_SLUG[dayType] ?? '')?.id ?? null,
    });
  }

  return { overrides: overridesByHabit, dayTypes };
}