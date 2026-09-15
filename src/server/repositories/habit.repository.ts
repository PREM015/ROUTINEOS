import prisma from '@/lib/prisma';
import { BaseRepository } from './base.repository';

export class HabitRepository extends BaseRepository<any, any, any> {
  constructor() {
    super(prisma.habit);
  }

  async findByUserId(userId: string) {
    return this.model.findMany({ where: { userId } });
  }

  async findActiveByUserId(userId: string) {
    return this.model.findMany({ where: { userId, status: 'ACTIVE' } });
  }

  async archive(id: string) {
    return this.model.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
  }

  async findByUserAndDate(userId: string, date: string) {
    return prisma.habitLog.findMany({
      where: { userId, date },
      include: { habit: true },
    });
  }

  async getWithLogs(id: string) {
    return this.model.findUnique({
      where: { id },
      include: { logs: true },
    });
  }
}

export const habitRepository = new HabitRepository();
