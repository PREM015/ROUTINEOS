import type { GoalPriority, GoalStatus, GoalType, Prisma } from '@/generated/prisma';
import { GoalRepository } from '@/server/repositories/goal.repository';
import type { CreateGoalInput, UpdateGoalInput } from '@/types/goal';
import { AchievementService } from './achievement.service';
import { resolveDayTypeForDate } from '@/lib/scheduling/resolve-routine';

/**
 * Goal Service
 * Business logic for goal management
 */

/** Filter options for {@link GoalService.listGoals}. */
export interface ListGoalsFilters {
  status?: GoalStatus[];
  type?: GoalType[];
  priority?: GoalPriority[];
  projectId?: string;
  overdue?: boolean;
  dueSoon?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  dayTypeId?: string;
}

/** Half-open UTC day window for a YYYY-MM-DD date. */
function dayWindow(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export class GoalService {
  private goalRepository: GoalRepository;

  constructor() {
    this.goalRepository = new GoalRepository();
  }

  /**
   * List goals for a user.
   *
   * Owns the filter composition so every caller (the API route, and any future
   * consumer) gets identical filtering instead of each re-deriving it.
   */
  async listGoals(userId: string, filters: ListGoalsFilters = {}) {
    return this.goalRepository.findAll(userId, filters);
  }

  /**
   * Progress-log rows recorded on a given calendar date, with their goals.
   */
  async getProgressLogsForDate(userId: string, date: string) {
    return this.goalRepository.findProgressLogsByDate(userId, date);
  }

  /**
   * Canonical "goals visible for a date" read.
   *
   * The visibility rule lives here, not in the repository: a goal applies on a
   * date when it is ACTIVE, its [startDate, endDate] window contains the date,
   * and it either applies every day or is assigned to the day type resolved for
   * that date. Day-type resolution goes through the single shared resolver, so
   * /today, /dashboard and /goals cannot disagree about which goals apply.
   */
  async getVisibleGoalsForDate(userId: string, date: string) {
    // Shared day-type resolution (RoutineException override first, then natural).
    const resolved = await resolveDayTypeForDate(userId, date);
    const { start, end } = dayWindow(date);

    const appliesEveryDay = await this.goalRepository.findActiveInDateWindow(
      userId,
      start,
      end
    );
    const alwaysVisible = appliesEveryDay.filter((goal) => goal.appliesEveryDay);

    if (!resolved.dayTypeId) {
      return { goals: alwaysVisible, resolved };
    }

    const dayTypeGoals = await this.goalRepository.findActiveByDayTypeId(
      userId,
      resolved.dayTypeId
    );
    const inWindow = dayTypeGoals.filter(
      (goal) => goal.startDate < end && goal.endDate >= start
    );

    // De-duplicate: a goal can satisfy both branches.
    const seen = new Set<string>();
    const goals = [...alwaysVisible, ...inWindow].filter((goal) => {
      if (seen.has(goal.id)) return false;
      seen.add(goal.id);
      return true;
    });

    return { goals, resolved };
  }

  /**
   * Archive a goal by cancelling it.
   *
   * Goals have no ARCHIVED status, so "archiving" a goal means marking it
   * CANCELLED. Exposed as a service method so the bulk endpoint does not have to
   * reach into the repository to express the same intent.
   *
   * `archivedAt` is stamped alongside the status so the column is actually
   * populated, matching how `Habit` and `Project` record the same event. It was
   * previously never written, so "archived before X" and archive-time ordering
   * were impossible.
   */
  async archiveGoal(userId: string, goalId: string) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new Error('Goal not found');
    }

    await this.goalRepository.update(goalId, userId, {
      status: 'CANCELLED',
      archivedAt: new Date(),
    });

    return this.goalRepository.findWithRelations(goalId, userId);
  }

  /**
   * Create new goal
   */
  async createGoal(userId: string, input: CreateGoalInput) {
    // `startDate` / `endDate` are non-null columns, but the schema now allows
    // them to be omitted or explicitly null so the Edit modal can clear a
    // field. Default rather than reject: an omitted date means "starts now,
    // runs a year".
    const startDate = input.startDate ?? new Date();
    const endDate =
      input.endDate ??
      new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);

    if (endDate <= startDate) {
      throw new Error('End date must be after start date');
    }

    const appliesEveryDay = input.appliesEveryDay ?? true;
    const dayTypeIds = appliesEveryDay ? [] : (input.dayTypeIds ?? []);

    // Calculate initial progress percentage
    const goal = await this.goalRepository.create({
      user: { connect: { id: userId } },
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      priority: input.priority ?? 'MEDIUM',
      status: 'ACTIVE',
      targetValue: input.targetValue,
      currentValue: input.currentValue || 0,
      unit: input.unit ?? null,
      startDate,
      endDate,
      appliesEveryDay,
      project: input.projectId
        ? { connect: { id: input.projectId } }
        : undefined,
      parentGoal: input.parentGoalId
        ? { connect: { id: input.parentGoalId } }
        : undefined,
      isPublic: input.isPublic || false,
    } as Prisma.GoalCreateInput);

    // Assign day types (only meaningful when the goal is not every-day)
    await this.goalRepository.addDayTypeAssignments(goal.id, userId, dayTypeIds);

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
    await this.goalRepository.addTags(goal.id, input.tagIds ?? []);


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
      ...(input.priority !== undefined && { priority: input.priority ?? 'MEDIUM' }),
      // Previously unreachable: `updateGoalSchema` did not declare `status`, so
      // the plain `z.object` stripped it and this branch never fired. The Edit
      // modal's Status select appeared to save and reverted on refresh.
      ...(input.status && {
        status: input.status,
        // `archivedAt` mirrors CANCELLED status, so a goal revived through
        // this path must not be left looking archived.
        ...(input.status === 'CANCELLED'
          ? { archivedAt: new Date() }
          : { archivedAt: null }),
      }),
      ...(input.targetValue !== undefined && { targetValue: input.targetValue }),
      ...(input.currentValue !== undefined && { currentValue: input.currentValue }),
      ...(input.unit !== undefined && { unit: input.unit }),
      ...(input.startDate !== undefined && { startDate: input.startDate ?? new Date() }),
      ...(input.endDate !== undefined && { endDate: input.endDate ?? new Date() }),
      ...(input.completedAt !== undefined && { completedAt: input.completedAt }),
      ...(input.projectId !== undefined && {
        project: input.projectId
          ? { connect: { id: input.projectId } }
          : { disconnect: true },
      }),
      ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
      ...(input.appliesEveryDay !== undefined && {
        appliesEveryDay: input.appliesEveryDay,
      }),
    });

    // Replace day-type assignments when they are supplied
    if (input.dayTypeIds) {
      const appliesEveryDay = input.appliesEveryDay ?? true;
      await this.goalRepository.clearDayTypeAssignments(goalId);
      if (!appliesEveryDay) {
        await this.goalRepository.addDayTypeAssignments(
          goalId,
          userId,
          input.dayTypeIds
        );
      }
    }

    // Update tags if provided
    if (input.tagIds) {
      await this.goalRepository.clearTags(goalId);
      await this.goalRepository.addTags(goalId, input.tagIds);
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

      new AchievementService().checkForUnlocks(userId).catch(err => {
        console.error('Failed to check achievements after goal completion:', err);
      });
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

    new AchievementService().checkForUnlocks(userId).catch(err => {
      console.error('Failed to check achievements after goal completion:', err);
    });
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
