import type { Achievement, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Achievement Repository
 * Database operations for Achievement model
 */

export class AchievementRepository extends BaseRepository {
  /**
   * Find all achievements for a user
   */
  async findByUserId(userId: string): Promise<Achievement[]> {
    try {
      return await this.prisma.achievement.findMany({
        where: { userId },
        orderBy: { unlockedAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findByUserId');
    }
  }

  /**
   * Find all unlocked achievements for a user
   */
  async findUnlocked(userId: string): Promise<Achievement[]> {
    try {
      return await this.prisma.achievement.findMany({
        where: { userId },
        orderBy: { unlockedAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findUnlocked');
    }
  }

  /**
   * Find achievement by ID with ownership check
   */
  async findById(
    userId: string,
    achievementId: string
  ): Promise<Achievement | null> {
    try {
      return await this.prisma.achievement.findFirst({
        where: { id: achievementId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Create a single achievement linked to a user
   */
  async create(
    userId: string,
    data: Omit<Prisma.AchievementCreateInput, 'user'>
  ): Promise<Achievement> {
    try {
      return await this.prisma.achievement.create({
        data: {
          ...data,
          user: { connect: { id: userId } },
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Bulk create achievements for a user
   */
  async createMany(
    userId: string,
    achievements: Array<Omit<Prisma.AchievementCreateManyInput, 'userId'>>
  ): Promise<number> {
    try {
      const result = await this.prisma.achievement.createMany({
        data: achievements.map((achievement) => ({
          ...achievement,
          userId,
        })),
        skipDuplicates: true,
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'createMany');
    }
  }

  /**
   * Check whether a user has unlocked an achievement
   */
  async isUnlocked(
    userId: string,
    achievementId: string
  ): Promise<boolean> {
    try {
      const count = await this.prisma.achievement.count({
        where: { id: achievementId, userId },
      });
      return count > 0;
    } catch (error) {
      this.handleError(error, 'isUnlocked');
    }
  }

  /**
   * Get recently unlocked achievements for a user
   */
  async recentUnlocked(
    userId: string,
    limit?: number
  ): Promise<Achievement[]> {
    try {
      return await this.prisma.achievement.findMany({
        where: { userId },
        orderBy: { unlockedAt: 'desc' },
        ...this.buildPaginationQuery(limit),
      });
    } catch (error) {
      this.handleError(error, 'recentUnlocked');
    }
  }
}