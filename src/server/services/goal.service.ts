import { goalRepository } from '../repositories/goal.repository';

export class GoalService {
  async createGoal(userId: string, data: any) {
    return goalRepository.create({ userId, ...data });
  }

  async updateGoal(id: string, data: any) {
    return goalRepository.update(id, data);
  }

  async deleteGoal(id: string) {
    return goalRepository.delete(id);
  }

  async logProgress(goalId: string, data: any) {
    return goalRepository.logProgress(goalId, data);
  }

  async carryOver(goalId: string, newDueDate: string) {
    return this.updateGoal(goalId, { dueDate: new Date(newDueDate), status: 'ACTIVE' });
  }

  async checkExpiredGoals(userId: string) {
    const candidates = await goalRepository.findCarryOverCandidates(userId);
    return candidates;
  }

  async getGoalWithStats(id: string) {
    const goal = await goalRepository.findById(id);
    const history = await goalRepository.getHistory(id);
    return { ...goal, history, progressCount: history.length };
  }
}

export const goalService = new GoalService();
