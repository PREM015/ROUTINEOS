import prisma from '@/lib/prisma';

export class StreakRepository {
  async findByUserId(userId: string) {
    return prisma.streak.findUnique({ where: { userId } });
  }

  async upsert(userId: string, data: any) {
    return prisma.streak.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }

  async incrementStreak(userId: string) {
    const streak = await this.findByUserId(userId);
    const newCount = (streak?.currentStreak || 0) + 1;
    const maxCount = Math.max(streak?.longestStreak || 0, newCount);
    
    return prisma.streak.upsert({
      where: { userId },
      update: { currentStreak: newCount, longestStreak: maxCount, lastActivityDate: new Date().toISOString().split('T')[0] },
      create: { userId, currentStreak: 1, longestStreak: 1, lastActivityDate: new Date().toISOString().split('T')[0] },
    });
  }

  async resetStreak(userId: string) {
    return prisma.streak.update({
      where: { userId },
      data: { currentStreak: 0 },
    });
  }

  async findMilestones(userId: string) {
    return prisma.streakMilestone.findMany({ where: { userId }, orderBy: { date: 'desc' } });
  }

  async createMilestone(userId: string, data: any) {
    return prisma.streakMilestone.create({ data: { userId, ...data } });
  }
}

export const streakRepository = new StreakRepository();
