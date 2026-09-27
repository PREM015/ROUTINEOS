import { GoalStatus } from '@/generated/prisma';
import type { Goal, GoalProgress, Milestone, Prisma, GoalType, GoalPriority } from '@/generated/prisma';
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
      dayTypeId?: string;
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

      // Day type filter
      if (options?.dayTypeId) {
        where.dayTypeAssignments = {
          some: { dayTypeId: options.dayTypeId },
        };
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
          dayTypeAssignments: {
            include: { dayType: true },
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

  /**
   * Find progress logs for a specific calendar date (YYYY-MM-DD) across all of
   * the user's goals. `GoalProgress.date` is a DateTime, so the day is matched
   * with a half-open UTC range rather than equality.
   *
   * Ordered newest-first, with `createdAt` as the tiebreak: every row in this
   * result shares the same calendar date, so ordering by `date` alone leaves
   * same-day rows in an unspecified order. Callers that keep only the first row
   * per goal (e.g. "/api/goals/today" resolving a daily check-off) need that
   * first row to genuinely be the most recent one.
   */
  async findProgressLogsByDate(
    userId: string,
    date: string
  ): Promise<GoalProgress[]> {
    try {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(`${date}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);

      return await this.prisma.goalProgress.findMany({
        where: {
          goal: { userId },
          date: { gte: start, lt: end },
        },
        include: {
          goal: {
            select: {
              id: true,
              title: true,
              type: true,
              targetValue: true,
              currentValue: true,
              unit: true,
            },
          },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      });
    } catch (error) {
      this.handleError(error, 'findProgressLogsByDate');
    }
  }

  // ============================================================================
  // Goal <-> Tag
  // ============================================================================

  /**
   * Attach tags to a goal.
   */
  async addTags(goalId: string, tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) return;
    try {
      await this.prisma.goalTag.createMany({
        data: tagIds.map((tagId) => ({ goalId, tagId })),
        skipDuplicates: true,
      });
    } catch (error) {
      this.handleError(error, 'addTags');
    }
  }

  /**
   * Detach every tag from a goal.
   */
  async clearTags(goalId: string): Promise<void> {
    try {
      await this.prisma.goalTag.deleteMany({ where: { goalId } });
    } catch (error) {
      this.handleError(error, 'clearTags');
    }
  }

  // ============================================================================
  // Goal <-> DayType
  // ============================================================================

  /**
   * Assign a goal to a set of day-type definitions.
   */
  async addDayTypeAssignments(
    goalId: string,
    userId: string,
    dayTypeIds: string[]
  ): Promise<void> {
    if (dayTypeIds.length === 0) return;
    try {
      await this.prisma.goalDayType.createMany({
        data: dayTypeIds.map((dayTypeId) => ({ goalId, dayTypeId, userId })),
        skipDuplicates: true,
      });
    } catch (error) {
      this.handleError(error, 'addDayTypeAssignments');
    }
  }

  /**
   * Remove every day-type assignment from a goal.
   */
  async clearDayTypeAssignments(goalId: string): Promise<void> {
    try {
      await this.prisma.goalDayType.deleteMany({ where: { goalId } });
    } catch (error) {
      this.handleError(error, 'clearDayTypeAssignments');
    }
  }

  // ============================================================================
  // Milestones
  // ============================================================================

  /**
   * Composable visibility primitives for goals.
   *
   * These are deliberately *thin* — they build the reusable `where` fragments
   * that the visibility rule is composed from, without deciding the rule
   * itself. The rule ("a goal is visible on a date when it is active, in the
   * date window, and either applies every day or is assigned to the resolved
   * day type") lives in `GoalService.getVisibleGoalsForDate`, so the business
   * decision is testable without a database and is not duplicated per caller.
   */
  async findActiveInDateWindow(
    userId: string,
    start: Date,
    end: Date
  ): Promise<Goal[]> {
    try {
      return await this.prisma.goal.findMany({
        where: {
          userId,
          status: GoalStatus.ACTIVE,
          startDate: { lt: end },
          endDate: { gte: start },
        },
        orderBy: [{ type: 'asc' }, { endDate: 'asc' }],
      });
    } catch (error) {
      this.handleError(error, 'findActiveInDateWindow');
    }
  }

  /**
   * Active goals assigned to a specific day-type definition.
   */
  async findActiveByDayTypeId(
    userId: string,
    dayTypeId: string
  ): Promise<Goal[]> {
    try {
      return await this.prisma.goal.findMany({
        where: {
          userId,
          status: GoalStatus.ACTIVE,
          dayTypeAssignments: { some: { dayTypeId } },
        },
        orderBy: [{ type: 'asc' }, { endDate: 'asc' }],
      });
    } catch (error) {
      this.handleError(error, 'findActiveByDayTypeId');
    }
  }

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

  /**
   * Milestones completed inside [from, to] for the user's goals.
   */
  async findCompletedMilestones(
    userId: string,
    from: Date,
    to: Date
  ): Promise<
    Prisma.MilestoneGetPayload<{
      include: {
        goal: {
          select: {
            id: true;
            title: true;
            project: { select: { id: true, name: true } };
          };
        };
      };
    }>[]
  > {
    try {
      return await this.prisma.milestone.findMany({
        where: {
          completedAt: { not: null, gte: from, lte: to },
          goal: { userId },
        },
        include: {
          goal: {
            select: {
              id: true,
              title: true,
              project: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { completedAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findCompletedMilestones');
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
