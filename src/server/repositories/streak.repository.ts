import type { Streak, StreakMilestone, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Streak Repository
 * Database operations for streaks
 */

export class StreakRepository extends BaseRepository {
  /**
   * Find user's streak
   */
  async findByUserId(userId: string): Promise<Streak | null> {
    try {
      return await this.prisma.streak.findFirst({
        where: { userId },
      });
    } catch (error) {
      this.handleError(error, 'findByUserId');
    }
  }

  /**
   * Create streak
   */
  async create(userId: string): Promise<Streak> {
    try {
      return await this.prisma.streak.create({
        data: { userId },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Update streak
   */
  async update(
    userId: string,
    data: Prisma.StreakUpdateInput
  ): Promise<Streak> {
    try {
      return await this.prisma.streak.update({
        where: { userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Increment current streak
   */
  async incrementCurrentStreak(
    userId: string,
    days: number = 1
  ): Promise<Streak> {
    try {
      return await this.prisma.streak.update({
        where: { userId },
        data: {
          currentStreak: { increment: days },
          lastCompletedDate: new Date().toISOString().split('T')[0],
          totalCompletedDays: { increment: 1 },
        },
      });
    } catch (error) {
      this.handleError(error, 'incrementCurrentStreak');
    }
  }

  /**
   * Reset current streak
   */
  async resetCurrentStreak(userId: string): Promise<Streak> {
    try {
      return await this.prisma.streak.update({
        where: { userId },
        data: { currentStreak: 0 },
      });
    } catch (error) {
      this.handleError(error, 'resetCurrentStreak');
    }
  }

  /**
   * Add rest day
   */
  async addRestDay(userId: string): Promise<Streak> {
    try {
      return await this.prisma.streak.update({
        where: { userId },
        data: {
          totalRestDays: { increment: 1 },
        },
      });
    } catch (error) {
      this.handleError(error, 'addRestDay');
    }
  }

  /**
   * Add minimum day
   */
  async addMinimumDay(userId: string): Promise<Streak> {
    try {
      return await this.prisma.streak.update({
        where: { userId },
        data: {
          currentStreak: { increment: 1 },
          minimumDayStreak: { increment: 1 },
          totalMinimumDays: { increment: 1 },
          totalCompletedDays: { increment: 1 },
          lastCompletedDate: new Date().toISOString().split('T')[0],
        },
      });
    } catch (error) {
      this.handleError(error, 'addMinimumDay');
    }
  }

  // ============================================================================
  // Streak Milestones
  // ============================================================================

  /**
   * Create milestone
   */
  async createMilestone(
    data: Prisma.StreakMilestoneCreateInput
  ): Promise<StreakMilestone> {
    try {
      return await this.prisma.streakMilestone.create({ data });
    } catch (error) {
      this.handleError(error, 'createMilestone');
    }
  }

  /**
   * Find milestone
   */
  async findMilestone(
    userId: string,
    milestoneDays: number,
    streakType: string
  ): Promise<StreakMilestone | null> {
    try {
      return await this.prisma.streakMilestone.findFirst({
        where: { userId, milestoneDays, streakType },
      });
    } catch (error) {
      this.handleError(error, 'findMilestone');
    }
  }

  /**
   * Get uncelebrated milestones
   */
  async getUncelebratedMilestones(userId: string): Promise<StreakMilestone[]> {
    try {
      return await this.prisma.streakMilestone.findMany({
        where: { userId, celebrated: false },
        orderBy: { milestoneDays: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'getUncelebratedMilestones');
    }
  }

  /**
   * Mark milestone celebrated
   */
  async celebrateMilestone(milestoneId: string): Promise<StreakMilestone> {
    try {
      return await this.prisma.streakMilestone.update({
        where: { id: milestoneId },
        data: { celebrated: true },
      });
    } catch (error) {
      this.handleError(error, 'celebrateMilestone');
    }
  }
}