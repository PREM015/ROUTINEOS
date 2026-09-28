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
    userId: string,
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
  async findWithRelations(habitId: string, userId: string) {
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
    userId: string,
    options?: {
      status?: HabitStatus | HabitStatus[];
      tier?: HabitTier | HabitTier[];
      categoryId?: string;
      includeArchived?: boolean;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
      dayTypeId?: string;
    }
  ) {
    try {
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

      return await this.prisma.habit.findMany({
        where,
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
        orderBy: this.buildOrderQuery(options?.sortBy || 'createdAt', options?.sortOrder),
        ...this.buildPaginationQuery(options?.limit, options?.offset),
      });
    } catch (error) {
      this.handleError(error, 'findAll');
    }
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
    userId: string,
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
  async delete(habitId: string, userId: string): Promise<Habit> {
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
  async archive(habitId: string, userId: string): Promise<Habit> {
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
    userId: string,
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
    userId: string,
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
    userId: string,
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
  async findLogsByDate(userId: string, date: string): Promise<HabitLog[]> {
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
    userId: string,
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
    userId: string,
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
    userId: string,
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
    userId: string,
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
  async deleteLog(habitId: string, userId: string, date: string): Promise<void> {
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
    userId: string,
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
  async findIdsWithLogEnergy(userId: string, energyLevel: number): Promise<string[]> {
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
    userId: string,
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
    userId: string,
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
  async deleteOverride(overrideId: string, userId: string): Promise<void> {
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

  async countByStatus(userId: string): Promise<Record<HabitStatus, number>> {
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