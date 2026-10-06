import type { SleepLog, Prisma } from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * Sleep Repository
 * Database operations for sleep tracking
 */

export class SleepRepository extends BaseRepository {
  /**
   * Find sleep log by date
   */
  async findByDate(userId: UserId, date: string): Promise<SleepLog | null> {
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
    userId: UserId,
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
    userId: UserId,
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
    userId: UserId,
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
    userId: UserId,
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
    userId: UserId,
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
  /**
   * Count days the user woke up before a given local `HH:mm`.
   *
   * Added for F1. `buildWorldState` was loading every `SleepLog` across the
   * 730-day history window solely to filter them and take the length. This is the
   * same predicate as a `count()`, so the rows never need to leave the database.
   *
   * `actualWakeTime` is a `HH:mm` string, so a lexicographic `<` is a correct
   * time comparison for zero-padded 24-hour values — the same basis the
   * caller's previous in-memory filter used.
   *
   * `startDate` is **optional, and omitting it means all time** rather than
   * "nothing". `early-riser` declares `timeframe: 'ALL_TIME'` and is described as
   * a lifetime claim, but it was being answered with a 730-day count because the
   * window was the only shape this signature accepted — so a user with more than
   * two years of history was credited only the recent part, and could be sitting
   * one wake-up short of a badge they had in fact earned years ago. Omitting the
   * bound is what lets the criterion mean what it says.
   */
  async countEarlyWakeups(
    userId: UserId,
    startDate: string | undefined,
    endDate: string,
    before: string
  ): Promise<number> {
    try {
      return await this.prisma.sleepLog.count({
        where: {
          userId,
          // A one-sided range rather than a sentinel date: no magic epoch, and
          // the shape says "everything up to endDate".
          date: startDate === undefined ? { lte: endDate } : { gte: startDate, lte: endDate },
          actualWakeTime: { not: null, lt: before },
        },
      });
    } catch (error) {
      this.handleError(error, 'countEarlyWakeups');
    }
  }

  async getLatest(userId: UserId): Promise<SleepLog | null> {
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
    userId: UserId,
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
