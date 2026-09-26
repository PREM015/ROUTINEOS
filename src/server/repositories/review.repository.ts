import prisma from '@/lib/prisma';

export class ReviewRepository {
  async findByUserId(userId: string) {
    return prisma.weeklyReview.findMany({
      where: { userId },
      orderBy: { weekStart: 'desc' },
    });
  }

  async findByWeek(userId: string, weekStartDate: string) {
    return prisma.weeklyReview.findUnique({
      where: { userId_weekStart: { userId, weekStart: weekStartDate } },
    });
  }

  async findMonthly(userId: string, month: string) {
    return prisma.monthlyReset.findUnique({
      where: { userId_month: { userId, month } },
    });
  }

  async create(data: any) {
    return prisma.weeklyReview.create({ data });
  }

  async update(id: string, data: any) {
    return prisma.weeklyReview.update({ where: { id }, data });
  }
}

export const reviewRepository = new ReviewRepository();
