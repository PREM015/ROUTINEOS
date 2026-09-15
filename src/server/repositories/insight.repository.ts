import prisma from '@/lib/prisma';

export class InsightRepository {
  async findLatestByUser(userId: string, limit = 5) {
    return prisma.insight.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findByPeriod(userId: string, startDate: Date, endDate: Date) {
    return prisma.insight.findMany({
      where: {
        userId,
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: any) {
    return prisma.insight.create({ data });
  }

  async markRead(id: string) {
    return prisma.insight.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async dismiss(id: string) {
    return prisma.insight.update({
      where: { id },
      data: { isDismissed: true },
    });
  }
}

export const insightRepository = new InsightRepository();
