import type { Prisma } from '@prisma/client';
import { GoalRepository } from '@/server/repositories/goal.repository';
import type { CreateGoalInput, UpdateGoalInput } from '@/types/goal';

/**
 * Goal Service
 * Business logic for goal management
 */

export class GoalService {
  private goalRepository: GoalRepository;

  constructor() {
    this.goalRepository = new GoalRepository();
  }

  /**
   * Create new goal
   */
  async createGoal(userId: string, input: CreateGoalInput) {
    // Validate dates
    if (new Date(input.endDate) <= new Date(input.startDate)) {
      throw new Error('End date must be after start date');
    }

    // Calculate initial progress percentage
    const goal = await this.goalRepository.create({
      user: { connect: { id: userId } },
      title: input.title,
      description: input.description,
      type: input.type,
      priority: input.priority || 'MEDIUM',
      status: 'ACTIVE',
      targetValue: input.targetValue,
      currentValue: input.currentValue || 0,
      unit: input.unit,
      startDate: input.startDate,
      endDate: input.endDate,
      project: input.projectId
        ? { connect: { id: input.projectId } }
        : undefined,
      parentGoal: input.parentGoalId
        ? { connect: { id: input.parentGoalId } }
        : undefined,
      isPublic: input.isPublic || false,
    } as Prisma.GoalCreateInput);

    // Create milestones if provided
    if (input.milestones && input.milestones.length > 0) {
      await Promise.all(
        input.milestones.map((milestone, index) =>
          this.goalRepository.createMilestone({
            goal: { connect: { id: goal.id } },
            title: milestone.title,
            description: milestone.description,
            targetValue: milestone.targetValue,
            dueDate: milestone.dueDate,
            sortOrder: index,
          } as Prisma.MilestoneCreateInput)
        )
      );
    }

    // Add tags if provided
    if (input.tagIds && input.tagIds.length > 0) {
      await Promise.all(
        input.tagIds.map(tagId =>
          this.goalRepository.prisma.goalTag.create({
            data: { goalId: goal.id, tagId },
          })
        )
      );
    }

    return this.goalRepository.findWithRelations(goal.id, userId);
  }

  /**
   * Update goal
   */
  async updateGoal(userId: string, goalId: string, input: UpdateGoalInput) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new Error('Goal not found');
    }

    await this.goalRepository.update(goalId, userId, {
      ...(input.title && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.type && { type: input.type }),
      ...(input.priority && { priority: input.priority }),
      ...(input.status && { status: input.status }),
      ...(input.targetValue !== undefined && { targetValue: input.targetValue }),
      ...(input.currentValue !== undefined && { currentValue: input.currentValue }),
      ...(input.unit !== undefined && { unit: input.unit }),
      ...(input.startDate && { startDate: input.startDate }),
      ...(input.endDate && { endDate: input.endDate }),
      ...(input.projectId !== undefined && {
        project: input.projectId
          ? { connect: { id: input.projectId } }
          : { disconnect: true },
      }),
      ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
    });

    // Update tags if provided
    if (input.tagIds) {
      await this.goalRepository.prisma.goalTag.deleteMany({
        where: { goalId },
      });

      if (input.tagIds.length > 0) {
        await Promise.all(
          input.tagIds.map(tagId =>
            this.goalRepository.prisma.goalTag.create({
              data: { goalId, tagId },
            })
          )
        );
      }
    }

    return this.goalRepository.findWithRelations(goalId, userId);
  }

  /**
   * Update goal progress
   */
  async updateProgress(
    userId: string,
    goalId: string,
    value: number,
    note?: string,
    autoComplete: boolean = true
  ) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new Error('Goal not found');
    }

    // Add progress log
    await this.goalRepository.addProgressLog({
      goal: { connect: { id: goalId } },
      value,
      note,
      date: new Date(),
    } as Prisma.GoalProgressCreateInput);

    // Update current value
    const newValue = goal.currentValue + value;
    await this.goalRepository.updateProgress(goalId, userId, newValue);

    // Check if goal should be completed
    let completed = false;
    if (autoComplete && newValue >= goal.targetValue) {
      await this.goalRepository.complete(goalId, userId);
      completed = true;

      // TODO: Trigger achievement
    }

    return {
      goal: await this.goalRepository.findWithRelations(goalId, userId),
      completed,
    };
  }

  /**
   * Complete goal
   */
  async completeGoal(userId: string, goalId: string, finalValue?: number) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new Error('Goal not found');
    }

    if (finalValue !== undefined) {
      await this.goalRepository.updateProgress(goalId, userId, finalValue);
    }

    await this.goalRepository.complete(goalId, userId);

    // TODO: Check for achievements
    // TODO: Trigger notification

    return this.goalRepository.findWithRelations(goalId, userId);
  }

  /**
   * Carry over goal to next period
   */
  async carryOverGoal(
    userId: string,
    goalId: string,
    newEndDate: Date,
    adjustProgress: boolean = false
  ) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new Error('Goal not found');
    }

    // Mark original as carried over
    await this.goalRepository.update(goalId, userId, {
      status: 'CARRIED_OVER',
    });

    // Create new goal
    const newGoal = await this.goalRepository.create({
      user: { connect: { id: userId } },
      title: goal.title,
      description: goal.description,
      type: goal.type,
      priority: goal.priority,
      status: 'ACTIVE',
      targetValue: goal.targetValue,
      currentValue: adjustProgress ? goal.currentValue : 0,
      unit: goal.unit,
      startDate: new Date(),
      endDate: newEndDate,
      carriedOverFrom: goalId,
      project: goal.projectId
        ? { connect: { id: goal.projectId } }
        : undefined,
    } as Prisma.GoalCreateInput);

    return this.goalRepository.findWithRelations(newGoal.id, userId);
  }

  /**
   * Get goal analytics
   */
  async getGoalAnalytics(userId: string, goalId: string) {
    const goal = await this.goalRepository.findWithRelations(goalId, userId);
    if (!goal) {
      throw new Error('Goal not found');
    }

    const now = new Date();
    const start = new Date(goal.startDate);
    const end = new Date(goal.endDate);

    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const elapsedDays = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const remainingDays = Math.max(0, totalDays - elapsedDays);

    const progressPercentage = (goal.currentValue / goal.targetValue) * 100;
    const remainingValue = goal.targetValue - goal.currentValue;

    // Calculate velocity (progress per day)
    const velocity = elapsedDays > 0 ? goal.currentValue / elapsedDays : 0;

    // Calculate required daily progress to meet goal
    const requiredDailyProgress = remainingDays > 0 ? remainingValue / remainingDays : 0;

    // Determine if on track
    const onTrack = velocity >= requiredDailyProgress;

    // Project completion date
    let projectedCompletion: Date | null = null;
    if (velocity > 0) {
      const daysToComplete = remainingValue / velocity;
      projectedCompletion = new Date(now.getTime() + daysToComplete * 24 * 60 * 60 * 1000);
    }

    // Get progress history
    const progressHistory = await this.goalRepository.getProgressHistory(goalId, 30);

    // Find best day
    const bestDay = progressHistory.reduce(
      (best, current) => (current.value > (best?.value || 0) ? current : best),
      progressHistory[0] || null
    );

    return {
      goalId,
      totalProgress: goal.currentValue,
      progressPercentage: Math.min(100, progressPercentage),
      remainingValue,
      daysElapsed: Math.max(0, elapsedDays),
      daysTotal: totalDays,
      daysRemaining: remainingDays,
      isOverdue: now > end && goal.status === 'ACTIVE',
      velocity,
      projectedCompletion,
      onTrack,
      requiredDailyProgress,
      averageDailyProgress: velocity,
      bestDay: bestDay
        ? {
            date: bestDay.date.toISOString().split('T')[0],
            value: bestDay.value,
          }
        : null,
      recentTrend: calculateTrend(progressHistory),
    };
  }

  /**
   * Delete goal
   */
  async deleteGoal(userId: string, goalId: string) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new Error('Goal not found');
    }

    await this.goalRepository.delete(goalId, userId);

    // TODO: Audit log
  }
}

function calculateTrend(
  history: Array<{ date: Date; value: number }>
): 'IMPROVING' | 'DECLINING' | 'STABLE' | 'NO_DATA' {
  if (history.length < 3) return 'NO_DATA';

  const recent = history.slice(0, 3);
  const older = history.slice(3, 6);

  if (older.length === 0) return 'NO_DATA';

  const recentAvg = recent.reduce((sum, h) => sum + h.value, 0) / recent.length;
  const olderAvg = older.reduce((sum, h) => sum + h.value, 0) / older.length;

  const diff = recentAvg - olderAvg;

  if (Math.abs(diff) < 0.1) return 'STABLE';
  return diff > 0 ? 'IMPROVING' : 'DECLINING';
}