import prisma from '@/lib/prisma';
import type { InsightPeriod, Prisma } from '@/generated/prisma';
import type { UserId } from '@/types/ids';

export class InsightRepository {
  async findLatestByUser(userId: UserId, limit = 5) {
    return prisma.aIInsight.findMany({
      where: { userId },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    });
  }

  /** Delete an insight only when it belongs to the user. Returns null on miss. */
  async deleteOwned(userId: UserId, id: string) {
    return prisma.aIInsight.deleteMany({
      where: { id, userId },
    });
  }

  async findByPeriod(userId: UserId, startDate: Date, endDate: Date) {
    return prisma.aIInsight.findMany({
      where: {
        userId,
        generatedAt: { gte: startDate, lte: endDate },
      },
      orderBy: { generatedAt: 'desc' },
    });
  }

  async create(data: Prisma.AIInsightUncheckedCreateInput) {
    return prisma.aIInsight.create({ data });
  }

  /**
   * Most recent insight for a user, optionally scoped to one period.
   *
   * `startDate`/`endDate` are YYYY-MM-DD calendar strings; the model's own
   * startDate/endDate columns are strings, so they are matched directly.
   */
  async findLatest(
    userId: UserId,
    filter: { period?: InsightPeriod; startDate?: string; endDate?: string } = {}
  ) {
    return prisma.aIInsight.findFirst({
      where: {
        userId,
        ...(filter.period && { period: filter.period }),
        ...(filter.startDate && { startDate: filter.startDate }),
        ...(filter.endDate && { endDate: filter.endDate }),
      },
      orderBy: { generatedAt: 'desc' },
    });
  }

  /**
   * Insights for a user within a generation window, newest first.
   */
  async findHistory(
    userId: UserId,
    startDate: string,
    endDate: string
  ) {
    return prisma.aIInsight.findMany({
      where: { userId, startDate: { gte: startDate }, endDate: { lte: endDate } },
      orderBy: { generatedAt: 'desc' },
    });
  }

  async markRead(id: string) {
    return prisma.aIInsight.update({
      where: { id },
      data: { wasHelpful: true },
    });
  }

  async dismiss(id: string) {
    return prisma.aIInsight.delete({
      where: { id },
    });
  }
}

export const insightRepository = new InsightRepository();

