import { ScoreRepository } from '../repositories/score.repository';
import { calculateCoreScore } from '@/config/scoring';

export class ScoreService {
  async calculateAndSaveScore(userId: string, date: string, metrics: any) {
    const scoreValue = calculateCoreScore(metrics);
    return new ScoreRepository().upsertScore(userId, date, {
      totalScore: scoreValue,
    });
  }

  async setDayMode(userId: string, date: string, mode: 'MINIMUM_DAY' | 'REST_DAY' | null) {
    const data =
      mode === 'MINIMUM_DAY'
        ? { isMinimumDay: true }
        : mode === 'REST_DAY'
          ? { isRestDay: true }
          : {};
    return new ScoreRepository().upsertScore(userId, date, data);
  }

  async getScoreForDate(userId: string, date: string) {
    return new ScoreRepository().findByDate(userId, date);
  }

  async getScoreHistory(userId: string, startDate: string, endDate: string) {
    return new ScoreRepository().findByRange(userId, startDate, endDate);
  }

  async finalizeScore(userId: string, date: string) {
    return new ScoreRepository().findByDate(userId, date);
  }
}

export const scoreService = new ScoreService();