import { StreakRepository } from '../repositories/streak.repository';

const streakRepository = new StreakRepository();

export class StreakService {
  async updateStreak(userId: string, isActive: boolean) {
    if (isActive) {
      return streakRepository.incrementCurrentStreak(userId);
    } else {
      return streakRepository.resetCurrentStreak(userId);
    }
  }

  async checkMilestones(userId: string) {
    const streak = await streakRepository.findByUserId(userId);
    if (!streak) return;

    const milestones = [7, 30, 100, 365];
    for (const m of milestones) {
      if (streak.currentStreak === m) {
        await streakRepository.createMilestone({
          user: { connect: { id: userId } },
          milestoneDays: m,
          streakType: 'STREAK',
          reachedDate: new Date().toISOString(),
        });
      }
    }
  }

  async getStreakStats(userId: string) {
    const streak = await streakRepository.findByUserId(userId);
    return {
      currentStreak: streak?.currentStreak || 0,
      longestStreak: streak?.longestStreak || 0,
      lastCompletedDate: streak?.lastCompletedDate || null,
    };
  }
}

export const streakService = new StreakService();
