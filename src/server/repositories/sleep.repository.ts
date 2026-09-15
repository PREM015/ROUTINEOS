import prisma from '@/lib/prisma';

export class SleepRepository {
  async findByUserAndDate(userId: string, date: string) {
    return prisma.sleepLog.findUnique({
      where: { userId_date: { userId, date } },
    });
  }

  async findByUserAndRange(userId: string, startDate: string, endDate: string) {
    return prisma.sleepLog.findMany({
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' },
    });
  }

  async create(data: any) {
    return prisma.sleepLog.create({ data });
  }

  async update(id: string, data: any) {
    return prisma.sleepLog.update({ where: { id }, data });
  }

  async delete(id: string) {
    return prisma.sleepLog.delete({ where: { id } });
  }

  async findLatest(userId: string) {
    return prisma.sleepLog.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
    });
  }
}

export const sleepRepository = new SleepRepository();
