import { scoreService } from './score.service';
import { habitRepository } from '../repositories/habit.repository';
import { streakService } from './streak.service';

export class AnalyticsService {
  async getDailyAnalytics(userId: string, date: string) {
    const score = await scoreService.getScoreForDate(userId, date);
    const habits = await habitRepository.findByUserAndDate(userId, date);
    return { score, habitsCount: habits.length };
  }

  async getWeeklyAnalytics(userId: string, startDate: string, endDate: string) {
    const scores = await scoreService.getScoreHistory(userId, startDate, endDate);
    return { scores };
  }

  async getMonthlyAnalytics(userId: string, month: string) {
    const startDate = `${month}-01`;
    const endDate = `${month}-31`; // Approx
    return this.getWeeklyAnalytics(userId, startDate, endDate);
  }

  async getHabitStats(userId: string) {
    return { active: await habitRepository.findActiveByUserId(userId) };
  }

  async getStreakAnalytics(userId: string) {
    return streakService.getStreakStats(userId);
  }
}

export const analyticsService = new AnalyticsService();
