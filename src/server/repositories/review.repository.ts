import type { MonthlyReset, Prisma, WeeklyReview } from '@/generated/prisma';
import { BaseRepository } from './base.repository';

/**
 * Review Repository
 * Database operations for the periodic review models (weekly review, monthly
 * reset). Both models store their structured payloads as JSON text columns, so
 * the serialisation is owned by the service, not here.
 */
export class ReviewRepository extends BaseRepository {
  // ==========================================================================
  // Weekly reviews
  // ==========================================================================

  /**
   * All of a user's weekly reviews, newest week first.
   */
  async findReviewsByUser(userId: string): Promise<WeeklyReview[]> {
    try {
      return await this.prisma.weeklyReview.findMany({
        where: { userId },
        orderBy: { weekStart: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findReviewsByUser');
    }
  }

  /**
   * The review for a specific week, scoped to its owner.
   */
  async findReviewByWeek(
    userId: string,
    weekStart: string
  ): Promise<WeeklyReview | null> {
    try {
      return await this.prisma.weeklyReview.findUnique({
        where: { userId_weekStart: { userId, weekStart } },
      });
    } catch (error) {
      this.handleError(error, 'findReviewByWeek');
    }
  }

  /**
   * Create or replace the review for a (user, week) pair.
   */
  async upsertReview(
    userId: string,
    weekStart: string,
    create: Omit<Prisma.WeeklyReviewUncheckedCreateInput, 'userId' | 'weekStart'>,
    update: Prisma.WeeklyReviewUncheckedUpdateInput
  ): Promise<WeeklyReview> {
    try {
      return await this.prisma.weeklyReview.upsert({
        where: { userId_weekStart: { userId, weekStart } },
        create: { ...create, userId, weekStart },
        update,
      });
    } catch (error) {
      this.handleError(error, 'upsertReview');
    }
  }

  // ==========================================================================
  // Monthly resets
  // ==========================================================================

  /**
   * The monthly reset for a given YYYY-MM, scoped to its owner.
   */
  async findMonthlyByMonth(
    userId: string,
    month: string
  ): Promise<MonthlyReset | null> {
    try {
      return await this.prisma.monthlyReset.findUnique({
        where: { userId_month: { userId, month } },
      });
    } catch (error) {
      this.handleError(error, 'findMonthlyByMonth');
    }
  }

  /**
   * All of a user's monthly resets, newest month first.
   */
  async findResetsByUser(userId: string): Promise<MonthlyReset[]> {
    try {
      return await this.prisma.monthlyReset.findMany({
        where: { userId },
        orderBy: { month: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findResetsByUser');
    }
  }

  /**
   * Record a monthly reset.
   */
  async createMonthlyReset(
    data: Prisma.MonthlyResetUncheckedCreateInput
  ): Promise<MonthlyReset> {
    try {
      return await this.prisma.monthlyReset.create({ data });
    } catch (error) {
      this.handleError(error, 'createMonthlyReset');
    }
  }
}

export const reviewRepository = new ReviewRepository();
