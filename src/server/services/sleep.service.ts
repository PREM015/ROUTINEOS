import { sleepRepository } from '../repositories/sleep.repository';

export class SleepService {
  async logSleep(userId: string, data: any) {
    return sleepRepository.create({ userId, ...data });
  }

  async updateSleep(id: string, data: any) {
    return sleepRepository.update(id, data);
  }

  async getSleepStats(userId: string, startDate: string, endDate: string) {
    const logs = await sleepRepository.findByUserAndRange(userId, startDate, endDate);
    if (!logs.length) return null;
    
    const avgDuration = logs.reduce((acc, l) => acc + l.duration, 0) / logs.length;
    return { avgDuration, logsCount: logs.length };
  }

  async detectConflicts(userId: string, sleepStart: string, sleepEnd: string) {
    // Conflict detection logic
    return [];
  }

  async calculateDebt(userId: string) {
    const logs = await sleepRepository.findByUserAndRange(userId, 
      new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(), 
      new Date().toISOString()
    );
    const target = 8 * 60; // 8 hours in minutes
    let debt = 0;
    logs.forEach(l => {
      if (l.duration < target) {
        debt += (target - l.duration);
      }
    });
    return debt;
  }
}

export const sleepService = new SleepService();
