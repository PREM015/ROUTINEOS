import prisma from '@/lib/prisma';

export class ScoreRepository {
  async findByUserAndDate(userId: string, date: string) {
    return prisma.score.findUnique({
      where: { userId_date: { userId, date } },
    });
  }

  async findByUserAndRange(userId: string, startDate: string, endDate: string) {
    return prisma.score.findMany({
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' },
    });
  }

  async upsert(userId: string, date: string, data: any) {
    return prisma.score.upsert({
      where: { userId_date: { userId, date } },
      update: data,
      create: { userId, date, ...data },
    });
  }

  async finalize(userId: string, date: string) {
    return prisma.score.update({
      where: { userId_date: { userId, date } },
      data: { isFinalized: true },
    });
  }

  async findLatest(userId: string) {
    return prisma.score.findFirst({
      where: { userId, isFinalized: true },
      orderBy: { date: 'desc' },
    });
  }

  async getStreak(userId: string) {
    return prisma.streak.findUnique({
      where: { userId },
    });
  }
}

export const scoreRepository = new ScoreRepository();
