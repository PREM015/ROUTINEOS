import prisma from '@/lib/prisma';

export class ReflectionRepository {
  async findByUserAndDate(userId: string, date: string) {
    return prisma.reflection.findUnique({
      where: { userId_date: { userId, date } },
    });
  }

  async findByUserAndRange(userId: string, startDate: string, endDate: string) {
    return prisma.reflection.findMany({
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' },
    });
  }

  async create(data: any) {
    return prisma.reflection.create({ data });
  }

  async update(id: string, data: any) {
    return prisma.reflection.update({ where: { id }, data });
  }
}

export const reflectionRepository = new ReflectionRepository();
