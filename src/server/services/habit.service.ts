import { habitRepository } from '../repositories/habit.repository';

export class HabitService {
  async createHabit(userId: string, data: any) {
    return habitRepository.create({ userId, ...data });
  }

  async updateHabit(id: string, data: any) {
    return habitRepository.update(id, data);
  }

  async deleteHabit(id: string) {
    return habitRepository.delete(id);
  }

  async archiveHabit(id: string) {
    return habitRepository.archive(id);
  }

  async logHabit(userId: string, habitId: string, date: string, data: any) {
    // This typically uses a HabitLogRepository, which we put inside habit.repository
    const prisma = require('@/lib/prisma').default;
    return prisma.habitLog.upsert({
      where: { habitId_date: { habitId, date } },
      update: data,
      create: { userId, habitId, date, ...data },
    });
  }

  async skipHabit(userId: string, habitId: string, date: string, reason?: string) {
    return this.logHabit(userId, habitId, date, { status: 'SKIPPED', notes: reason });
  }

  async pauseHabit(id: string) {
    return habitRepository.update(id, { status: 'PAUSED' });
  }

  async resumeHabit(id: string) {
    return habitRepository.update(id, { status: 'ACTIVE' });
  }

  async getHabitsForDate(userId: string, date: string) {
    // Needs logic to check days of week
    return habitRepository.findActiveByUserId(userId);
  }

  async getHabitStats(id: string) {
    const habit = await habitRepository.getWithLogs(id);
    if (!habit) return null;
    
    const logs = habit.logs || [];
    const completed = logs.filter((l: any) => l.status === 'COMPLETED').length;
    return {
      totalCompletions: completed,
      completionRate: logs.length ? completed / logs.length : 0,
    };
  }
}

export const habitService = new HabitService();
