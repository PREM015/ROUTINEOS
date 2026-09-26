import type { SleepLog, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Sleep Repository
 * Database operations for sleep tracking
 */

export class SleepRepository extends BaseRepository {
  /**
   * Find sleep log by date
   */
  async findByDate(userId: string, date: string): Promise<SleepLog | null> {
    try {
      return await this.prisma.sleepLog.findFirst({
        where: { userId, date },
      });
    } catch (error) {
      this.handleError(error, 'findByDate');
    }
  }

  /**
   * Find sleep logs for range
   */
  async findByRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<SleepLog[]> {
    try {
      return await this.prisma.sleepLog.findMany({
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
      this.handleError(error, 'findByRange');
    }
  }

  /**
   * Create or update sleep log
   */
  async upsertLog(
    userId: string,
    date: string,
    data: Omit<Prisma.SleepLogCreateInput, 'userId' | 'date'>
  ): Promise<SleepLog> {
    try {
      // `data` already carries the owning `user` relation. Injecting the
      // scalar `userId` alongside it makes Prisma reject the whole create
      // ("Unknown argument `userId`. Did you mean `user`?"), so only `date`
      // is filled in here.
      const { user: _owner, ...scaledFields } = data;
      return await this.prisma.sleepLog.upsert({
        where: { userId_date: { userId, date } },
        create: {
          ...scaledFields,
          date,
          user: _owner ?? { connect: { id: userId } },
        },
        update: scaledFields,
      });
    } catch (error) {
      this.handleError(error, 'upsertLog');
    }
  }

  /**
   * Get average sleep duration
   */
  async getAverageDuration(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<number> {
    try {
      const result = await this.prisma.sleepLog.aggregate({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
          actualDurationMinutes: { not: null },
        },
        _avg: { actualDurationMinutes: true },
      });

      return Math.round(result._avg.actualDurationMinutes || 0);
    } catch (error) {
      this.handleError(error, 'getAverageDuration');
    }
  }

  /**
   * Get average sleep quality
   */
  async getAverageQuality(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<number> {
    try {
      const result = await this.prisma.sleepLog.aggregate({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
          quality: { not: null },
        },
        _avg: { quality: true },
      });

      return result._avg.quality || 0;
    } catch (error) {
      this.handleError(error, 'getAverageQuality');
    }
  }

  /**
   * Calculate total sleep deficit
   */
  async calculateTotalDeficit(
    userId: string,
    startDate: string,
    endDate: string,
    targetDuration: number
  ): Promise<number> {
    try {
      const logs = await this.prisma.sleepLog.findMany({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
          actualDurationMinutes: { not: null },
        },
        select: { actualDurationMinutes: true },
      });

      let totalDeficit = 0;
      for (const log of logs) {
        if (log.actualDurationMinutes) {
          const deficit = Math.max(0, targetDuration - log.actualDurationMinutes);
          totalDeficit += deficit;
        }
      }

      return totalDeficit;
    } catch (error) {
      this.handleError(error, 'calculateTotalDeficit');
    }
  }

  /**
   * Get latest sleep log
   */
  async getLatest(userId: string): Promise<SleepLog | null> {
    try {
      return await this.prisma.sleepLog.findFirst({
        where: { userId },
        orderBy: { date: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'getLatest');
    }
  }

  /**
   * Count days felt rested
   */
  async countRestedDays(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<number> {
    try {
      return await this.prisma.sleepLog.count({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
          feltRested: true,
        },
      });
    } catch (error) {
      this.handleError(error, 'countRestedDays');
    }
  }
}