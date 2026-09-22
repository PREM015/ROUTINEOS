import prisma from '@/lib/prisma';

export class InsightRepository {
  async findLatestByUser(userId: string, limit = 5) {
    return prisma.aIInsight.findMany({
      where: { userId },
      orderBy: { generatedAt: 'desc' },
      take: limit,
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

  async create(data: any) {
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
