import { GoalStatus } from '@prisma/client';
import type { Goal, GoalProgress, Milestone, Prisma, GoalType, GoalPriority } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Goal Repository
 * Database operations for Goal and related models
 */

export class GoalRepository extends BaseRepository {
  /**
   * Find goal by ID with ownership check
   */
  async findById(goalId: string, userId: string): Promise<Goal | null> {
    try {
      return await this.prisma.goal.findFirst({
        where: { id: goalId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Find goal with all relations
   */
  async findWithRelations(goalId: string, userId: string) {
    try {
      return await this.prisma.goal.findFirst({
        where: { id: goalId, userId },
        include: {
          project: true,
          parentGoal: true,
          subGoals: true,
          milestones: {
            orderBy: { sortOrder: 'asc' },
          },
          progressLogs: {
            orderBy: { date: 'desc' },
            take: 50,
          },
          tags: {
            include: { tag: true },
          },
          _count: {
            select: {
              subGoals: true,
              milestones: true,
              progressLogs: true,
            },
          },
        },
      });
    } catch (error) {
      this.handleError(error, 'findWithRelations');
    }
  }

  /**
   * Find all goals for user
   */
  async findAll(
    userId: string,
    options?: {
      status?: GoalStatus | GoalStatus[];
      type?: GoalType | GoalType[];
      priority?: GoalPriority | GoalPriority[];
      projectId?: string;
      parentGoalId?: string | null;
      overdue?: boolean;
      dueSoon?: boolean;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    }
  ) {
    try {
      const where: Prisma.GoalWhereInput = { userId };

      // Status filter
      if (options?.status) {
        where.status = Array.isArray(options.status)
          ? { in: options.status }
          : options.status;
      }

      // Type filter
      if (options?.type) {
        where.type = Array.isArray(options.type)
          ? { in: options.type }
          : options.type;
      }

      // Priority filter
      if (options?.priority) {
        where.priority = Array.isArray(options.priority)
          ? { in: options.priority }
          : options.priority;
      }

      // Project filter
      if (options?.projectId) {
        where.projectId = options.projectId;
      }

      // Parent goal filter
      if (options?.parentGoalId !== undefined) {
        where.parentGoalId = options.parentGoalId;
      }

      // Overdue filter
      if (options?.overdue) {
        where.endDate = { lt: new Date() };
        where.status = GoalStatus.ACTIVE;
      }

      // Due soon filter (within 7 days)
      if (options?.dueSoon) {
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
        where.endDate = {
          gte: new Date(),
          lte: sevenDaysFromNow,
        };
        where.status = GoalStatus.ACTIVE;
      }

      return await this.prisma.goal.findMany({
        where,
        include: {
          project: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
          tags: {
            include: {
              tag: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                },
              },
            },
          },
          milestones: {
            select: {
              id: true,
              completedAt: true,
            },
          },
          _count: {
            select: {
              subGoals: true,
              milestones: true,
            },
          },
        },
        orderBy: this.buildOrderQuery(options?.sortBy || 'endDate', options?.sortOrder || 'asc'),
        ...this.buildPaginationQuery(options?.limit, options?.offset),
      });
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  /**
   * Create goal
   */
  async create(data: Prisma.GoalCreateInput): Promise<Goal> {
    try {
      return await this.prisma.goal.create({ data });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Update goal
   */
  async update(
    goalId: string,
    userId: string,
    data: Prisma.GoalUpdateInput
  ): Promise<Goal> {
    try {
      return await this.prisma.goal.update({
        where: { id: goalId, userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete goal
   */
  async delete(goalId: string, userId: string): Promise<Goal> {
    try {
      return await this.prisma.goal.delete({
        where: { id: goalId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  /**
   * Update goal progress
   */
  async updateProgress(
    goalId: string,
    userId: string,
    currentValue: number
  ): Promise<Goal> {
    try {
      return await this.prisma.goal.update({
        where: { id: goalId, userId },
        data: { currentValue },
      });
    } catch (error) {
      this.handleError(error, 'updateProgress');
    }
  }

  /**
   * Complete goal
   */
  async complete(goalId: string, userId: string): Promise<Goal> {
    try {
      return await this.prisma.goal.update({
        where: { id: goalId, userId },
        data: {
          status: GoalStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      this.handleError(error, 'complete');
    }
  }

  // ============================================================================
  // Goal Progress Logs
  // ============================================================================

  /**
   * Add progress log
   */
  async addProgressLog(
    data: Prisma.GoalProgressCreateInput
  ): Promise<GoalProgress> {
    try {
      return await this.prisma.goalProgress.create({ data });
    } catch (error) {
      this.handleError(error, 'addProgressLog');
    }
  }

  /**
   * Get progress history
   */
  async getProgressHistory(
    goalId: string,
    limit?: number
  ): Promise<GoalProgress[]> {
    try {
      return await this.prisma.goalProgress.findMany({
        where: { goalId },
        orderBy: { date: 'desc' },
        take: limit || 100,
      });
    } catch (error) {
      this.handleError(error, 'getProgressHistory');
    }
  }

  // ============================================================================
  // Milestones
  // ============================================================================

  /**
   * Create milestone
   */
  async createMilestone(
    data: Prisma.MilestoneCreateInput
  ): Promise<Milestone> {
    try {
      return await this.prisma.milestone.create({ data });
    } catch (error) {
      this.handleError(error, 'createMilestone');
    }
  }

  /**
   * Update milestone
   */
  async updateMilestone(
    milestoneId: string,
    data: Prisma.MilestoneUpdateInput
  ): Promise<Milestone> {
    try {
      return await this.prisma.milestone.update({
        where: { id: milestoneId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'updateMilestone');
    }
  }

  /**
   * Delete milestone
   */
  async deleteMilestone(milestoneId: string): Promise<void> {
    try {
      await this.prisma.milestone.delete({
        where: { id: milestoneId },
      });
    } catch (error) {
      this.handleError(error, 'deleteMilestone');
    }
  }

  /**
   * Complete milestone
   */
  async completeMilestone(milestoneId: string): Promise<Milestone> {
    try {
      return await this.prisma.milestone.update({
        where: { id: milestoneId },
        data: { completedAt: new Date() },
      });
    } catch (error) {
      this.handleError(error, 'completeMilestone');
    }
  }

  /**
   * Get milestones for goal
   */
  async getMilestones(goalId: string): Promise<Milestone[]> {
    try {
      return await this.prisma.milestone.findMany({
        where: { goalId },
        orderBy: { sortOrder: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'getMilestones');
    }
  }

  // ============================================================================
  // Analytics
  // ============================================================================

  /**
   * Count goals by status
   */
  async countByStatus(userId: string): Promise<Record<GoalStatus, number>> {
    try {
      const counts = await this.prisma.goal.groupBy({
        by: ['status'],
        where: { userId },
        _count: true,
      });

      const result = {} as Record<GoalStatus, number>;
      for (const { status, _count } of counts) {
        result[status] = _count;
      }

      return result;
    } catch (error) {
      this.handleError(error, 'countByStatus');
    }
  }

  /**
   * Get goals ending soon
   */
  async getEndingSoon(userId: string, days: number = 7): Promise<Goal[]> {
    try {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + days);

      return await this.prisma.goal.findMany({
        where: {
          userId,
          status: GoalStatus.ACTIVE,
          endDate: {
            gte: new Date(),
            lte: endDate,
          },
        },
        orderBy: { endDate: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'getEndingSoon');
    }
  }
}