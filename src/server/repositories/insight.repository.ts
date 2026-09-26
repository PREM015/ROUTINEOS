import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export class InsightRepository {
  async findLatestByUser(userId: string, limit = 5) {
    return prisma.aIInsight.findMany({
      where: { userId },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    });
  }

  /** Delete an insight only when it belongs to the user. Returns null on miss. */
  async deleteOwned(userId: string, id: string) {
    return prisma.aIInsight.deleteMany({
      where: { id, userId },
    });
  }

  async findByPeriod(userId: string, startDate: Date, endDate: Date) {
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
