import prisma from '@/lib/prisma';
import { BaseRepository } from './base.repository';

export class GoalRepository extends BaseRepository<any, any, any> {
  constructor() {
    super(prisma.goal);
  }

  async findByUserId(userId: string) {
    return this.model.findMany({ where: { userId } });
  }

  async findActive(userId: string) {
    return this.model.findMany({ where: { userId, status: 'ACTIVE' } });
  }

  async logProgress(goalId: string, data: any) {
    return prisma.goalProgress.create({
      data: { goalId, ...data },
    });
  }

  async getHistory(goalId: string) {
    return prisma.goalProgress.findMany({
      where: { goalId },
      orderBy: { date: 'desc' },
    });
  }

  async findCarryOverCandidates(userId: string) {
    return this.model.findMany({
      where: {
        userId,
        status: { in: ['ACTIVE', 'PARTIAL'] },
        dueDate: { lt: new Date() },
      },
    });
  }
}

export const goalRepository = new GoalRepository();
