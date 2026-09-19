import type { DailyReflection, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Reflection Repository
 * Database operations for daily reflections
 */

export class ReflectionRepository extends BaseRepository {
  /**
   * Find reflection by date
   */
  async findByDate(userId: string, date: string): Promise<DailyReflection | null> {
    try {
      return await this.prisma.dailyReflection.findFirst({
        where: { userId, date },
      });
    } catch (error) {
      this.handleError(error, 'findByDate');
    }
  }

  /**
   * Find reflections for range
   */
  async findByRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyReflection[]> {
    try {
      return await this.prisma.dailyReflection.findMany({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { date: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findByRange');
    }
  }

  /**
   * Create or update reflection
   */
  async upsertReflection(
    userId: string,
    date: string,
    data: Omit<Prisma.DailyReflectionCreateInput, 'userId' | 'date'>
  ): Promise<DailyReflection> {
    try {
      return await this.prisma.dailyReflection.upsert({
        where: { userId_date: { userId, date } },
        create: {
          userId,
          date,
          ...data,
        } as Prisma.DailyReflectionCreateInput,
        update: data,
      });
    } catch (error) {
      this.handleError(error, 'upsertReflection');
    }
  }

  /**
   * Get average energy
   */
  async getAverageEnergy(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<number> {
    try {
      const result = await this.prisma.dailyReflection.aggregate({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
          energy: { not: null },
        },
        _avg: { energy: true },
      });

      return result._avg.energy || 0;
    } catch (error) {
      this.handleError(error, 'getAverageEnergy');
    }
  }

  /**
   * Get average mood
   */
  async getAverageMood(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<number> {
    try {
      const result = await this.prisma.dailyReflection.aggregate({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
          mood: { not: null },
        },
        _avg: { mood: true },
      });

      return result._avg.mood || 0;
    } catch (error) {
      this.handleError(error, 'getAverageMood');
    }
  }

  /**
   * Get average stress
   */
  async getAverageStress(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<number> {
    try {
      const result = await this.prisma.dailyReflection.aggregate({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
          stress: { not: null },
        },
        _avg: { stress: true },
      });

      return result._avg.stress || 0;
    } catch (error) {
      this.handleError(error, 'getAverageStress');
    }
  }

  /**
   * Count reflections with data
   */
  async countWithData(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<number> {
    try {
      return await this.prisma.dailyReflection.count({
        where: {
          userId,
          date: {
            gte: startDate,
            lte: endDate,
          },
          OR: [
            { reflectionText: { not: null } },
            { biggestWin: { not: null } },
            { energy: { not: null } },
            { mood: { not: null } },
          ],
        },
      });
    } catch (error) {
      this.handleError(error, 'countWithData');
    }
  }
}