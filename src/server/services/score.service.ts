import { scoreRepository } from '../repositories/score.repository';
// Assuming calculateCoreScore is exported from @/config/scoring
import { calculateCoreScore } from '@/config/scoring';

export class ScoreService {
  async calculateAndSaveScore(userId: string, date: string, metrics: any) {
    const scoreValue = calculateCoreScore(metrics);
    return scoreRepository.upsert(userId, date, { totalScore: scoreValue, metrics });
  }

  async setDayMode(userId: string, date: string, mode: string) {
    return scoreRepository.upsert(userId, date, { mode });
  }

  async getScoreForDate(userId: string, date: string) {
    return scoreRepository.findByUserAndDate(userId, date);
  }

  async getScoreHistory(userId: string, startDate: string, endDate: string) {
    return scoreRepository.findByUserAndRange(userId, startDate, endDate);
  }

  async finalizeScore(userId: string, date: string) {
    return scoreRepository.finalize(userId, date);
  }
}

export const scoreService = new ScoreService();
