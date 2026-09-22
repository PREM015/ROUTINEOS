import { HabitStatus } from '@prisma/client';
import type { Habit, HabitLog, HabitOverride, Prisma, HabitTier } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Habit Repository
 * Database operations for Habit and related models
 */

export class HabitRepository extends BaseRepository {
  /**
   * Find habit by ID with ownership check
   */
  async findById(habitId: string, userId: string): Promise<Habit | null> {
    try {
      return await this.prisma.habit.findFirst({
        where: { id: habitId, userId },
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

      return await this.prisma.habit.findMany({
        where,
        include: {
          category: true,
          tags: {
            include: { tag: true },
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