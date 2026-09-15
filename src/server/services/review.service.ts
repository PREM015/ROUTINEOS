import { reviewRepository } from '../repositories/review.repository';

export class ReviewService {
  async createWeeklyReview(userId: string, data: any) {
    return reviewRepository.create({ userId, ...data });
  }

  async getWeeklyReview(userId: string, weekStartDate: string) {
    return reviewRepository.findByWeek(userId, weekStartDate);
  }

  async getReviewHistory(userId: string) {
    return reviewRepository.findByUserId(userId);
  }
}

export const reviewService = new ReviewService();
