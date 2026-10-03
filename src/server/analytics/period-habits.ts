import {
  buildPeriodHabits,
  emptyPeriodHabits,
  type PeriodHabitModel,
} from '@/lib/analytics/period-habits';
import { toContributionHabit } from '@/lib/habits/contribution-eligibility';
import { buildEligibilityContext } from '@/server/analytics/eligibility-context';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { RoutineRepository } from '@/server/repositories/routine.repository';

/**
 * Load the period habit model for a date range in five queries.
 *
 *   1. HabitRepository.findAll                  habits + day-type assignments
 *   2. HabitRepository.findLogsByUserRange      every log in the range
 *   3. HabitRepository.findOverridesByUserRange skip / pause / reschedule
 *   4. RoutineRepository.listDayTypeDefinitions day-type names
 *   5. RoutineRepository.findExceptionsByRange  per-date day-type overrides
 *
 * This is the replacement for the four per-habit `findLogsByRange` loops that
 * `weeklySummary`, `monthlySummary` and `yearlySummary` each ran, plus the
 * per-habit log read in `dailyBreakdown`. Query cost is now **independent of the
 * number of habits and of the length of the range**: a year for a user with 40
 * habits costs the same five queries a single day costs, where before it was 41.
 *
 * The window is clipped to `today`, so a live week or month is not scored against
 * days the user has not lived yet. See `lib/analytics/period-habits` for why.
 */
export async function loadPeriodHabits(
  userId: string,
  start: string,
  end: string,
  today: string
): Promise<PeriodHabitModel> {
  // A period entirely after today has nothing to score. Clamping would otherwise
  // produce a one-day "today" window and report the live day under a future
  // month's label.
  if (start > today) return emptyPeriodHabits();

  const windowStart = start;
  const windowEnd = end < today ? end : today;

  const habitRepository = new HabitRepository();
  const routineRepository = new RoutineRepository();

  const [habitRows, logs, overrides, definitions, exceptions] = await Promise.all([
    habitRepository.findAll(userId, {
      status: ['ACTIVE', 'PAUSED'],
      sortBy: 'createdAt',
      sortOrder: 'asc',
    }),
    habitRepository.findLogsByUserRange(userId, windowStart, windowEnd),
    habitRepository.findOverridesByUserRange(userId, windowStart, windowEnd),
    routineRepository.listDayTypeDefinitions(userId),
    routineRepository.findExceptionsByRange(userId, windowStart, windowEnd),
  ]);

  const habits = habitRows.map(toContributionHabit);

  return buildPeriodHabits({
    start: windowStart,
    end: windowEnd,
    habits,
    logs: logs.map((log) => ({
      habitId: log.habitId,
      date: log.date,
      status: log.status,
    })),
    ctx: buildEligibilityContext(
      overrides.map((override) => ({
        habitId: override.habitId,
        type: override.type,
        startDate: override.startDate,
        endDate: override.endDate,
      })),
      definitions,
      exceptions,
      { from: windowStart, to: windowEnd }
    ),
  });
}