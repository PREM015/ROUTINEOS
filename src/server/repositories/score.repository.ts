import type { DailyScore, Prisma } from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * Score Repository
 * Database operations for scoring
 */

export class ScoreRepository extends BaseRepository {
  /**
   * Find daily score
   */
  async findByDate(userId: UserId, date: string): Promise<DailyScore | null> {
    try {
      return await this.prisma.dailyScore.findFirst({
        where: { userId, date },
      });
    } catch (error) {
      this.handleError(error, 'findByDate');
    }
  }

  /**
   * Find scores for range
   */
  async findByRange(
    userId: UserId,
    startDate: string,
    endDate: string
  ): Promise<DailyScore[]> {
    try {
      return await this.prisma.dailyScore.findMany({
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
   * The most recent day this user has a computed score for, or `null` if none.
   *
   * `findFirst` rather than `findByRange(start, today)` because "what is the
   * newest row" and "what is in this range" are different questions, and only the
   * first one is being asked here — the freshness chip needs a single date, not
   * every row since the account was created.
   */
  async findLatestDate(userId: UserId): Promise<string | null> {
    try {
      const row = await this.prisma.dailyScore.findFirst({
        where: { userId },
        orderBy: { date: 'desc' },
        select: { date: true },
      });
      return row?.date ?? null;
    } catch (error) {
      this.handleError(error, 'findLatestDate');
    }
  }

  /**
   * Create or update score
   * Uses the unchecked input so `userId` (scalar FK) is never mixed with a
   * `user: { connect }` relation in the same write.
   */
  async upsertScore(
    userId: UserId,
    date: string,
    data: Omit<Prisma.DailyScoreUncheckedCreateInput, 'userId' | 'date'>
  ): Promise<DailyScore> {
    try {
      return await this.prisma.dailyScore.upsert({
        where: { userId_date: { userId, date } },
        create: {
          userId,
          date,
          ...data,
        },
        update: data,
      });
    } catch (error) {
      this.handleError(error, 'upsertScore');
    }
  }

  /**
   * Get average score
   */
  async getAverageScore(
    userId: UserId,
    startDate: string,
    endDate: string
  ): Promise<number> {
    try {
      const result = await this.prisma.dailyScore.aggregate({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
          totalScore: { not: null },
        },
        _avg: { totalScore: true },
      });

      return result._avg.totalScore || 0;
    } catch (error) {
      this.handleError(error, 'getAverageScore');
    }
  }

  /**
   * Count distinct days with any recorded score in the range.
   *
   * Added for F1. `buildWorldState` was computing this as
   * `new Set(scores.filter(...).map(s => s.date)).size`, which meant loading every
   * `DailyScore` row for two years — including the `calculationData` JSON
   * breakdown — purely to take the length of a set. `dailyScore.date` is already
   * one row per day, so a plain `count()` under the same predicate is exactly
   * equivalent and never leaves the database.
   */
  async countActiveDays(
    userId: UserId,
    startDate: string,
    endDate: string
  ): Promise<number> {
    try {
      return await this.prisma.dailyScore.count({
        where: {
          userId,
          date: { gte: startDate, lte: endDate },
          OR: [{ isMinimumDay: true }, { coreScore: { not: null } }],
        },
      });
    } catch (error) {
      this.handleError(error, 'countActiveDays');
    }
  }

  /**
   * Only the dates of qualifying days.
   *
   * Added for F1. `perfectWeeks` buckets perfect days into calendar weeks, so it
   * genuinely needs the individual dates — but nothing else about the rows. This
   * selects the single column it needs instead of a full `DailyScore`, which drops
   * the `calculationData` JSON payload per row. The result set is also far
   * smaller than the full range, since only scores at or above the threshold
   * qualify.
   */
  async findPerfectDayDates(
    userId: UserId,
    startDate: string,
    endDate: string,
    threshold: number
  ): Promise<string[]> {
    try {
      const rows = await this.prisma.dailyScore.findMany({
        where: {
          userId,
          date: { gte: startDate, lte: endDate },
          totalScore: { gte: threshold },
        },
        select: { date: true },
        orderBy: { date: 'asc' },
      });
      return rows.map((r) => r.date);
    } catch (error) {
      this.handleError(error, 'findPerfectDayDates');
    }
  }

  /**
   * Only the dates of days that recorded any score.
   *
   * Added for F1 — the narrow companion to {@link countActiveDays}. `dailyScore.date`
   * is unique per day, so this and that count describe the same set; the split
   * lets a caller that needs the *list* (achievement evaluation) pay for one
   * column instead of a full row, while a caller that needs only the number
   * (the dashboard strip) pays for neither.
   */
  async findActiveDayDates(
    userId: UserId,
    startDate: string,
    endDate: string
  ): Promise<string[]> {
    try {
      const rows = await this.prisma.dailyScore.findMany({
        where: {
          userId,
          date: { gte: startDate, lte: endDate },
          OR: [{ isMinimumDay: true }, { coreScore: { not: null } }],
        },
        select: { date: true },
        orderBy: { date: 'asc' },
      });
      return rows.map((r) => r.date);
    } catch (error) {
      this.handleError(error, 'findActiveDayDates');
    }
  }

  /**
   * Count perfect days
   */
  async countPerfectDays(
    userId: UserId,
    startDate: string,
    endDate: string,
    threshold: number = 95
  ): Promise<number> {
    try {
      return await this.prisma.dailyScore.count({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
          totalScore: { gte: threshold },
        },
      });
    } catch (error) {
      this.handleError(error, 'countPerfectDays');
    }
  }

  /**
   * Get score distribution
   */
  async getDistribution(
    userId: UserId,
    startDate: string,
    endDate: string
  ): Promise<Record<string, number>> {
    try {
      const scores = await this.prisma.dailyScore.findMany({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
          overallGrade: { not: null },
        },
        select: { overallGrade: true },
      });

      const distribution: Record<string, number> = {
        'A+': 0,
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        F: 0,
      };

      for (const { overallGrade } of scores) {
        if (overallGrade && overallGrade in distribution) {
          distribution[overallGrade] = (distribution[overallGrade] ?? 0) + 1;
        }
      }

      return distribution;
    } catch (error) {
      this.handleError(error, 'getDistribution');
    }
  }

  /**
   * Count minimum days
   */
  async countMinimumDays(
    userId: UserId,
    startDate: string,
    endDate: string
  ): Promise<number> {
    try {
      return await this.prisma.dailyScore.count({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
          isMinimumDay: true,
        },
      });
    } catch (error) {
      this.handleError(error, 'countMinimumDays');
    }
  }

  /**
   * Count rest days
   */
  async countRestDays(
    userId: UserId,
    startDate: string,
    endDate: string
  ): Promise<number> {
    try {
      return await this.prisma.dailyScore.count({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
          isRestDay: true,
        },
      });
    } catch (error) {
      this.handleError(error, 'countRestDays');
    }
  }
}
