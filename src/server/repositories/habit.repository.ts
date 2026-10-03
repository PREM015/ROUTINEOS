import { HabitStatus } from '@/generated/prisma';
import type {
  Habit,
  HabitLog,
  HabitOverride,
  HabitOverrideType,
  Prisma,
  HabitTier,
} from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * `sortBy` values the query schema accepts, mapped to real `Habit` columns.
 *
 * `buildOrderQuery` in `base.repository.ts` interpolates the string straight
 * into `orderBy`, so anything that is not a column reaches Prisma verbatim and
 * the query fails. `streak` is the only API name that is not a column (the
 * cached one is `streakCount`), so `GET /api/habits?sortBy=streak` used to 500
 * with "Unknown field `streak` for orderBy". Unknown keys fall back to
 * `createdAt` rather than propagating.
 */
const HABIT_SORT_COLUMNS: Record<string, string> = {
  name: 'name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  streak: 'streakCount',
  longestStreak: 'longestStreak',
  completionRate: 'completionRate',
  points: 'points',
};

/**
 * Options accepted by the list and count reads.
 *
 * Extracted because `findAll` and `countAll` have to accept the same thing, and
 * the service derives its parameter type from this method's signature — an
 * inline type literal on one of the two would silently narrow the other.
 */
export interface HabitFindAllOptions {
  status?: HabitStatus | HabitStatus[];
  tier?: HabitTier | HabitTier[];
  categoryId?: string;
  includeArchived?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  dayTypeId?: string;
  tagId?: string;
  search?: string;
}

/**
 * Habit Repository
 * Database operations for Habit and related models
 */

export class HabitRepository extends BaseRepository {
  /**
   * Find habit by ID with ownership check
   */
  async findById(
    habitId: string,
    userId: UserId,
    options?: { includeDayTypeAssignments?: boolean }
  ): Promise<Habit | null> {
    try {
      return await this.prisma.habit.findFirst({
        where: { id: habitId, userId },
        include: options?.includeDayTypeAssignments
          ? { dayTypeAssignments: { include: { dayType: true } } }
          : undefined,
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Find habit with all relations
   */
  async findWithRelations(habitId: string, userId: UserId) {
    try {
      return await this.prisma.habit.findFirst({
        where: { id: habitId, userId },
        include: {
          category: true,
          tags: {
            include: { tag: true },
          },
          logs: {
            orderBy: { date: 'desc' },
            take: 30,
          },
          overrides: {
            orderBy: { startDate: 'desc' },
          },
        },
      });
    } catch (error) {
      this.handleError(error, 'findWithRelations');
    }
  }

  /**
   * Find all habits for user
   */
  async findAll(
    userId: UserId,
    options?: HabitFindAllOptions
  ) {
    try {
      return await this.prisma.habit.findMany({
        where: this.buildWhere(userId, options),
        include: {
          category: true,
          tags: {
            include: { tag: true },
          },
          dayTypeAssignments: {
            include: { dayType: true },
          },
          _count: {
            select: {
              logs: true,
              overrides: true,
            },
          },
        },
        orderBy: this.buildOrderQuery(
          HABIT_SORT_COLUMNS[options?.sortBy || 'createdAt'] ?? 'createdAt',
          options?.sortOrder
        ),
        ...this.buildPaginationQuery(options?.limit, options?.offset),
      });
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  /**
   * Row count for the same filter set as `findAll`.
   *
   * Shares `buildWhere` rather than restating the predicate, because two
   * hand-maintained copies of these filters eventually disagree — the count would
   * then describe a different set than the rows actually returned, and the
   * symptom is a "have I loaded everything?" check that is quietly wrong instead
   * of one that visibly fails.
   */
  async countAll(userId: UserId, options?: HabitFindAllOptions) {
    try {
      return await this.prisma.habit.count({
        where: this.buildWhere(userId, options),
      });
    } catch (error) {
      this.handleError(error, 'countAll');
    }
  }

  /**
   * The single `where` for every habit list/count read.
   *
   * Kept private and shared on purpose: `findAll` and `countAll` must agree, and
   * the filters below are the ones the API advertises on `habitQuerySchema`.
   */
  private buildWhere(
    userId: UserId,
    options?: HabitFindAllOptions
  ): Prisma.HabitWhereInput {
    const where: Prisma.HabitWhereInput = { userId };

    // Status filter
    if (options?.status) {
      where.status = Array.isArray(options.status)
        ? { in: options.status }
        : options.status;
    } else if (!options?.includeArchived) {
      where.status = { not: HabitStatus.ARCHIVED };
    }

    // Tier filter
    if (options?.tier) {
      where.tier = Array.isArray(options.tier)
        ? { in: options.tier }
        : options.tier;
    }

    // Category filter
    if (options?.categoryId) {
      where.categoryId = options.categoryId;
    }

    // Day type filter
    if (options?.dayTypeId) {
      where.dayTypeAssignments = {
        some: { dayTypeId: options.dayTypeId },
      };
    }

    // Tag filter. Declared on `habitQuerySchema` and returned by
    // `getHabitsForTags`, but `findAll` never applied it, so the filter could not
    // narrow anything.
    if (options?.tagId) {
      where.tags = { some: { tagId: options.tagId } };
    }

    /*
     * Free-text search.
     *
     * `search` was validated by `habitQuerySchema` and then silently dropped: the
     * route read it off the query string, Zod accepted it, and the repository
     * built a `where` that ignored it — so the search narrowed nothing while
     * looking like it worked.
     *
     * `mode: 'insensitive'` is required because `name` is a plain `String` and
     * Postgres would otherwise match "water" only against a literal lowercase
     * "water". Description is `@db.Text` and matches on the same terms.
     */
    const search = options?.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /**
   * Create habit
   */
  async create(data: Prisma.HabitCreateInput): Promise<Habit> {
    try {
      return await this.prisma.habit.create({ data });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Update habit
   */
  async update(
    habitId: string,
    userId: UserId,
    data: Prisma.HabitUpdateInput
  ): Promise<Habit> {
    try {
      return await this.prisma.habit.update({
        where: { id: habitId, userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete habit
   */
  async delete(habitId: string, userId: UserId): Promise<Habit> {
    try {
      return await this.prisma.habit.delete({
        where: { id: habitId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  /**
   * Archive habit
   */
  async archive(habitId: string, userId: UserId): Promise<Habit> {
    try {
      return await this.prisma.habit.update({
        where: { id: habitId, userId },
        data: {
          status: HabitStatus.ARCHIVED,
          archivedAt: new Date(),
        },
      });
    } catch (error) {
      this.handleError(error, 'archive');
    }
  }

  /**
   * Update habit status
   */
  async updateStatus(
    habitId: string,
    userId: UserId,
    status: HabitStatus
  ): Promise<Habit> {
    try {
      return await this.prisma.habit.update({
        where: { id: habitId, userId },
        data: { status },
      });
    } catch (error) {
      this.handleError(error, 'updateStatus');
    }
  }

  /**
   * Update habit streak
   */
  async updateStreak(
    habitId: string,
    userId: UserId,
    streakData: {
      streakCount: number;
      longestStreak?: number;
      lastCompletedDate: string;
    }
  ): Promise<Habit> {
    try {
      const updateData: Prisma.HabitUpdateInput = {
        streakCount: streakData.streakCount,
        lastCompletedDate: streakData.lastCompletedDate,
      };

      if (
        streakData.longestStreak !== undefined &&
        streakData.longestStreak > streakData.streakCount
      ) {
        updateData.longestStreak = streakData.longestStreak;
      }

      return await this.prisma.habit.update({
        where: { id: habitId, userId },
        data: updateData,
      });
    } catch (error) {
      this.handleError(error, 'updateStreak');
    }
  }

  // ============================================================================
  // Habit Logs
  // ============================================================================

  /**
   * Find habit log
   */
  async findLog(
    habitId: string,
    userId: UserId,
    date: string
  ): Promise<HabitLog | null> {
    try {
      return await this.prisma.habitLog.findUnique({
        where: {
          userId_habitId_date: {
            userId,
            habitId,
            date,
          },
        },
      });
    } catch (error) {
      this.handleError(error, 'findLog');
    }
  }

  /**
   * Find logs for date
   */
  async findLogsByDate(userId: UserId, date: string): Promise<HabitLog[]> {
    try {
      return await this.prisma.habitLog.findMany({
        where: { userId, date },
        include: {
          habit: {
            select: {
              id: true,
              name: true,
              tier: true,
              color: true,
              icon: true,
            },
          },
        },
      });
    } catch (error) {
      this.handleError(error, 'findLogsByDate');
    }
  }

  /**
   * Find logs for habit in date range
   */
  async findLogsByRange(
    habitId: string,
    userId: UserId,
    startDate: string,
    endDate: string
  ): Promise<HabitLog[]> {
    try {
      return await this.prisma.habitLog.findMany({
        where: {
          habitId,
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { date: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findLogsByRange');
    }
  }

  /**
   * Find all habit logs for a user across a date range (any habit).
   * Distinct from findLogsByRange — that one is scoped to a single habit.
   */
  async findLogsByUserRange(
    userId: UserId,
    startDate: string,
    endDate: string
  ): Promise<HabitLog[]> {
    try {
      return await this.prisma.habitLog.findMany({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { date: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findLogsByUserRange');
    }
  }

  /**
   * Create habit log
   */
  async createLog(data: Prisma.HabitLogCreateInput): Promise<HabitLog> {
    try {
      return await this.prisma.habitLog.create({ data });
    } catch (error) {
      this.handleError(error, 'createLog');
    }
  }

  /**
   * Upsert habit log
   */
  async upsertLog(
    habitId: string,
    userId: UserId,
    date: string,
    data: Prisma.HabitLogCreateInput
  ): Promise<HabitLog> {
    try {
      return await this.prisma.habitLog.upsert({
        where: {
          userId_habitId_date: {
            userId,
            habitId,
            date,
          },
        },
        create: data,
        update: data,
      });
    } catch (error) {
      this.handleError(error, 'upsertLog');
    }
  }

  /**
   * Attach or clear a note on a habit log **without touching its status**.
   *
   * Notes used to be saved by POSTing `/log` with `status: 'COMPLETED'`, which
   * also upserted a completion and advanced the streak — writing a note
   * silently marked the habit done. On a day the habit was not scheduled the
   * service rejected the COMPLETED status outright, so notes could not be saved
   * at all. This only touches `note`.
   */
  async setLogNote(
    habitId: string,
    userId: UserId,
    date: string,
    note: string | null
  ): Promise<HabitLog> {
    try {
      return await this.prisma.habitLog.upsert({
        where: { userId_habitId_date: { userId, habitId, date } },
        create: {
          habit: { connect: { id: habitId } },
          user: { connect: { id: userId } },
          date,
          // A note on its own is not a completion. `PARTIAL` records that the
          // day was touched without claiming the habit was done.
          status: 'PARTIAL',
          note,
        } as Prisma.HabitLogCreateInput,
        update: { note },
      });
    } catch (error) {
      this.handleError(error, 'setLogNote');
    }
  }

  /**
   * Delete habit log
   */
  async deleteLog(habitId: string, userId: UserId, date: string): Promise<void> {
    try {
      await this.prisma.habitLog.delete({
        where: {
          userId_habitId_date: {
            userId,
            habitId,
            date,
          },
        },
      });
    } catch (error) {
      this.handleError(error, 'deleteLog');
    }
  }

  /**
   * Count completed logs
   */
  async countCompletedLogs(
    habitId: string,
    userId: UserId,
    startDate?: string,
    endDate?: string
  ): Promise<number> {
    try {
      const where: Prisma.HabitLogWhereInput = {
        habitId,
        userId,
        status: 'COMPLETED',
      };

      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = startDate;
        if (endDate) where.date.lte = endDate;
      }

      return await this.prisma.habitLog.count({ where });
    } catch (error) {
      this.handleError(error, 'countCompletedLogs');
    }
  }

  /**
   * Ids of the user's habits that have at least one log at the given energy
   * level. Resolved in a single query rather than one lookup per habit, which
   * is what the habit filter used to do.
   */
  async findIdsWithLogEnergy(userId: UserId, energyLevel: number): Promise<string[]> {
    try {
      const rows = await this.prisma.habitLog.findMany({
        where: { userId, energyLevel },
        select: { habitId: true },
        distinct: ['habitId'],
      });
      return rows.map((row) => row.habitId);
    } catch (error) {
      this.handleError(error, 'findIdsWithLogEnergy');
    }
  }

  /**
   * Count every completed habit log for a user across all of their habits.
   */
  async countAllCompletedLogs(
    userId: UserId,
    startDate?: string,
    endDate?: string
  ): Promise<number> {
    try {
      const where: Prisma.HabitLogWhereInput = { userId, status: 'COMPLETED' };

      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = startDate;
        if (endDate) where.date.lte = endDate;
      }

      return await this.prisma.habitLog.count({ where });
    } catch (error) {
      this.handleError(error, 'countAllCompletedLogs');
    }
  }

  // ============================================================================
  // Habit Overrides
  // ============================================================================

  /**
   * Find active overrides for habit
   */
  async findActiveOverrides(
    habitId: string,
    userId: UserId,
    date: string
  ): Promise<HabitOverride[]> {
    try {
      return await this.prisma.habitOverride.findMany({
        where: {
          habitId,
          userId,
          startDate: { lte: date },
          OR: [{ endDate: null }, { endDate: { gte: date } }],
        },
      });
    } catch (error) {
      this.handleError(error, 'findActiveOverrides');
    }
  }

  /**
   * Every override that is active at any point within `[startDate, endDate]`.
   *
   * `findActiveOverrides` answers "which overrides cover this one date", so
   * evaluating a habit across a year called it 365 times per habit. The
   * contribution heatmap needs exactly the same rule over a whole calendar year,
   * so this is the range form: one query, then the per-date matching is done in
   * memory against the returned rows.
   *
   * `endDate: null` is an open-ended override, which is why the OR clause is
   * required rather than just a `lte` on start.
   */
  async findOverridesByUserRange(
    userId: UserId,
    startDate: string,
    endDate: string
  ): Promise<HabitOverride[]> {
    try {
      return await this.prisma.habitOverride.findMany({
        where: {
          userId,
          startDate: { lte: endDate },
          OR: [{ endDate: null }, { endDate: { gte: startDate } }],
        },
        orderBy: { startDate: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findOverridesByUserRange');
    }
  }

  /**
   * Create habit override
   */
  async createOverride(
    data: Prisma.HabitOverrideCreateInput
  ): Promise<HabitOverride> {
    try {
      return await this.prisma.habitOverride.create({ data });
    } catch (error) {
      this.handleError(error, 'createOverride');
    }
  }

  /**
   * Delete habit override
   */
  async deleteOverride(overrideId: string, userId: UserId): Promise<void> {
    try {
      await this.prisma.habitOverride.delete({
        where: { id: overrideId, userId },
      });
    } catch (error) {
      this.handleError(error, 'deleteOverride');
    }
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /**
   * Bulk create logs
   */
  async bulkCreateLogs(logs: Prisma.HabitLogCreateManyInput[]): Promise<number> {
    try {
      const result = await this.prisma.habitLog.createMany({
        data: logs,
        skipDuplicates: true,
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'bulkCreateLogs');
    }
  }

  /**
   * Count habits by status
   */
  /**
   * Attach tags to a habit.
   */
  async addTags(habitId: string, tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) return;
    try {
      await this.prisma.habitTag.createMany({
        data: tagIds.map((tagId) => ({ habitId, tagId })),
        skipDuplicates: true,
      });
    } catch (error) {
      this.handleError(error, 'addTags');
    }
  }

  /**
   * Detach every tag from a habit.
   */
  async clearTags(habitId: string): Promise<void> {
    try {
      await this.prisma.habitTag.deleteMany({ where: { habitId } });
    } catch (error) {
      this.handleError(error, 'clearTags');
    }
  }

  /**
   * Assign a habit to a set of day-type definitions.
   */
  async addDayTypeAssignments(habitId: string, dayTypeIds: string[]): Promise<void> {
    if (dayTypeIds.length === 0) return;
    try {
      await this.prisma.habitDayType.createMany({
        data: dayTypeIds.map((dayTypeId) => ({ habitId, dayTypeId })),
        skipDuplicates: true,
      });
    } catch (error) {
      this.handleError(error, 'addDayTypeAssignments');
    }
  }

  /**
   * Remove every day-type assignment from a habit.
   */
  async clearDayTypeAssignments(habitId: string): Promise<void> {
    try {
      await this.prisma.habitDayType.deleteMany({ where: { habitId } });
    } catch (error) {
      this.handleError(error, 'clearDayTypeAssignments');
    }
  }

  /**
   * Remove overrides of a given type from a habit (e.g. clear PAUSE on resume).
   */
  async deleteOverridesByType(
    habitId: string,
    type: HabitOverrideType
  ): Promise<void> {
    try {
      await this.prisma.habitOverride.deleteMany({ where: { habitId, type } });
    } catch (error) {
      this.handleError(error, 'deleteOverridesByType');
    }
  }

  /**
   * Delete a habit and everything that references it, in one transaction.
   *
   * Owning the whole cascade here keeps the service free of raw Prisma while
   * still guaranteeing the unlink-before-delete ordering that the time-entry
   * foreign key requires.
   */
  async deleteCascade(habitId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Unlink time entries first, otherwise the FK constraint fails.
        await tx.timeEntry.updateMany({
          where: { habitId },
          data: { habitId: null },
        });
        await tx.habitLog.deleteMany({ where: { habitId } });
        await tx.habitOverride.deleteMany({ where: { habitId } });
        await tx.habitTag.deleteMany({ where: { habitId } });
        await tx.habitDayType.deleteMany({ where: { habitId } });
        await tx.habit.delete({ where: { id: habitId } });
      });
    } catch (error) {
      this.handleError(error, 'deleteCascade');
    }
  }

  async countByStatus(userId: UserId): Promise<Record<HabitStatus, number>> {
    try {
      const counts = await this.prisma.habit.groupBy({
        by: ['status'],
        where: { userId },
        _count: true,
      });

      const result = {} as Record<HabitStatus, number>;
      for (const { status, _count } of counts) {
        result[status] = _count;
      }

      return result;
    } catch (error) {
      this.handleError(error, 'countByStatus');
    }
  }
}