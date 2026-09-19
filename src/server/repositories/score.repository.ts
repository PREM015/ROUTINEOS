import type { DailyScore, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Score Repository
 * Database operations for scoring
 */

export class ScoreRepository extends BaseRepository {
  /**
   * Find daily score
   */
  async findByDate(userId: string, date: string): Promise<DailyScore | null> {
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
    userId: string,
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
   * Create or update score
   */
  async upsertScore(
    userId: string,
    date: string,
    data: Omit<Prisma.DailyScoreCreateInput, 'userId' | 'date'>
  ): Promise<DailyScore> {
    try {
      return await this.prisma.dailyScore.upsert({
        where: { userId_date: { userId, date } },
        create: {
          userId,
          date,
          ...data,
        } as Prisma.DailyScoreCreateInput,
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
    userId: string,
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
   * Count perfect days
   */
  async countPerfectDays(
    userId: string,
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
    userId: string,
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
          distribution[overallGrade]++;
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
    userId: string,
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
    userId: string,
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