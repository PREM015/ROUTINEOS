import { DEFAULT_TZ, getTodayString } from '@/lib/dates';
import {
  toContributionHabit,
  type ContributionHabit,
} from '@/lib/habits/contribution-eligibility';
import {
  buildContributionYear,
  firstDayOfYear,
  lastDayOfYear,
  type ContributionStats,
  type ContributionYear,
  type LogLike,
} from '@/lib/habits/contributions';
import { buildEligibilityContext } from '@/server/analytics/eligibility-context';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import type { UserId } from '@/types/ids';

/**
 * The habit contribution year, in six queries.
 *
 * ## Why the queries are hoisted
 *
 * The canonical eligibility rule (`calculateHabitEligibility`) costs 2-4 queries
 * per habit per date. Evaluated over a calendar year for a user with 12 habits
 * that is ~5,000 queries, so the only way to render a 365-day grid is to load
 * every lookup once and apply the rules in memory.
 * `lib/habits/contribution-eligibility` is that in-memory mirror; this class only
 * fills its context and composes.
 *
 * ## Query budget
 *
 *   1. UserRepository.getSettings               timezone
 *   2. HabitRepository.findAll                  habits + day-type assignments
 *   3. HabitRepository.findLogsByUserRange      every log in the year
 *   4. HabitRepository.findOverridesByUserRange skip / pause / reschedule
 *   5. RoutineRepository.listDayTypeDefinitions day-type names
 *   6. RoutineRepository.findExceptionsByRange  per-date day-type overrides
 *
 * All six in one `Promise.all`, so the endpoint costs one round trip's latency.
 *
 * **No schema change**, and no duplicated habit metrics: the cell data is
 * `HabitLog` rows the rest of the app already reads, bucketed by a date range.
 */
export class HabitContributionService {
  private habitRepository = new HabitRepository();
  private routineRepository = new RoutineRepository();
  private userRepository = new UserRepository();

  async getYear(userId: UserId, year: number): Promise<ContributionYear> {
    const settings = await this.userRepository.getSettings(userId);
    const timezone = settings?.timezone || DEFAULT_TZ;
    const today = getTodayString(timezone);

    const yearStart = firstDayOfYear(year);
    const yearEnd = lastDayOfYear(year);

    const [habitRows, logs, overrides, definitions, exceptions] = await Promise.all([
      this.habitRepository.findAll(userId, {
        status: ['ACTIVE', 'PAUSED'],
        sortBy: 'createdAt',
        sortOrder: 'asc',
      }),
      this.habitRepository.findLogsByUserRange(userId, yearStart, yearEnd),
      this.habitRepository.findOverridesByUserRange(userId, yearStart, yearEnd),
      this.routineRepository.listDayTypeDefinitions(userId),
      this.routineRepository.findExceptionsByRange(userId, yearStart, yearEnd),
    ]);

    const habits: ContributionHabit[] = habitRows.map(toContributionHabit);

    const ctx = buildEligibilityContext(overrides, definitions, exceptions, {
      from: yearStart,
      to: yearEnd,
    });

    const current = buildContributionYear({
      year,
      today,
      habits,
      logs: logs.map(toLogLike),
      ctx,
    });

    /*
      Year-over-year, only when there is something to compare against.

      The previous year is built from the *same* already-loaded rows when its logs
      are in range, and from three extra range queries only when the current year
      has no history at all (so its own log fetch came back empty and cannot
      answer for 2025 either). `availableYears` is derived from real log dates, so
      an empty comparison is reported as "no data" rather than as 0%.
    */
    const previousYear = year - 1;
    const canCompare =
      previousYear > 0 && current.availableYears.some((y) => y === previousYear);

    let previousStats: ContributionStats | null = null;
    if (canCompare) {
      const prevStart = firstDayOfYear(previousYear);
      const prevEnd = lastDayOfYear(previousYear);
      const [prevLogs, prevOverrides, prevExceptions] = await Promise.all([
        this.habitRepository.findLogsByUserRange(userId, prevStart, prevEnd),
        this.habitRepository.findOverridesByUserRange(userId, prevStart, prevEnd),
        this.routineRepository.findExceptionsByRange(userId, prevStart, prevEnd),
      ]);
      previousStats = buildContributionYear({
        year: previousYear,
        today,
        habits,
        logs: prevLogs.map(toLogLike),
        ctx: buildEligibilityContext(prevOverrides, definitions, prevExceptions, {
          from: prevStart,
          to: prevEnd,
        }),
      }).stats;
    }

    return { ...current, previousYear: previousStats };
  }
}

function toLogLike(log: { habitId: string; date: string; status: string }): LogLike {
  return { habitId: log.habitId, date: log.date, status: log.status };
}

export const habitContributionService = new HabitContributionService();
