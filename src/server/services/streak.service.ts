import { streakRepository } from '../repositories/streak.repository';

export class StreakService {
  async updateStreak(userId: string, isActive: boolean) {
    if (isActive) {
      return streakRepository.incrementStreak(userId);
    } else {
      return streakRepository.resetStreak(userId);
    }
  }

  async checkMilestones(userId: string) {
    const streak = await streakRepository.findByUserId(userId);
    if (!streak) return;

    const milestones = [7, 30, 100, 365];
    for (const m of milestones) {
      if (streak.currentStreak === m) {
        await streakRepository.createMilestone(userId, { type: 'STREAK', value: m });
      }
    }
  }

  async getStreakStats(userId: string) {
    const streak = await streakRepository.findByUserId(userId);
    const milestones = await streakRepository.findMilestones(userId);
    return { ...streak, milestones };
  }

  async recalculateStreak(userId: string) {
    // Recompute streak logic based on history (placeholder)
    return streakRepository.findByUserId(userId);
  }
}

export const streakService = new StreakService();
