import type { Streak, StreakMilestone, Prisma } from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * Streak Repository
 * Database operations for streaks
 */

export class StreakRepository extends BaseRepository {
  /**
   * Find user's streak
   */
  async findByUserId(userId: UserId): Promise<Streak | null> {
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
  async create(userId: UserId): Promise<Streak> {
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
    userId: UserId,
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
  /**
   * Increment the current streak.
   *
   * `completedDate` is the day the user actually completed, passed in by the
   * caller. It was `new Date().toISOString().split('T')[0]` — the UTC date —
   * which for any user not on UTC disagreed with the `DailyScore.date` the same
   * completion was recorded against, so the streak's own bookkeeping pointed at
   * a different day than the score it was derived from.
   */
  async incrementCurrentStreak(
    userId: UserId,
    days: number = 1,
    completedDate?: string
  ): Promise<Streak> {
    try {
      return await this.prisma.streak.update({
        where: { userId },
        data: {
          currentStreak: { increment: days },
          lastCompletedDate: completedDate ?? null,
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
  async resetCurrentStreak(userId: UserId): Promise<Streak> {
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
  async addRestDay(userId: UserId): Promise<Streak> {
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
   * Add a minimum day. See `incrementCurrentStreak` on why `completedDate` is
   * passed in rather than derived from `new Date()`.
   */
  async addMinimumDay(userId: UserId, completedDate?: string): Promise<Streak> {
    try {
      return await this.prisma.streak.update({
        where: { userId },
        data: {
          currentStreak: { increment: 1 },
          minimumDayStreak: { increment: 1 },
          totalMinimumDays: { increment: 1 },
          totalCompletedDays: { increment: 1 },
          lastCompletedDate: completedDate ?? null,
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
    userId: UserId,
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
  async getUncelebratedMilestones(userId: UserId): Promise<StreakMilestone[]> {
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
  /**
   * Find a milestone by id, scoped to its owner.
   */
  async findMilestoneById(
    milestoneId: string,
    userId: UserId
  ): Promise<StreakMilestone | null> {
    try {
      return await this.prisma.streakMilestone.findFirst({
        where: { id: milestoneId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findMilestoneById');
    }
  }

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
