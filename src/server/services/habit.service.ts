import type { Prisma, HabitLog, HabitStatus, HabitTier } from '@/generated/prisma';
import { format, parseISO, subDays } from 'date-fns';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import type { HabitWithRelations, CreateHabitInput, UpdateHabitInput, LogHabitInput } from '@/types/habit';
import { HABIT_TIER_CONFIG } from '@/constants/habit-tiers';
import { calculateHabitEligibility } from '@/lib/habits/eligibility';
import { calculateStreak, recordStreakMilestone } from '@/lib/streaks/calculate-streak';
import { AuditRepository } from '@/server/repositories/audit.repository';
import { ScoringService } from './scoring.service';
import { AchievementService } from './achievement.service';
import { invalidateDashboard } from '@/server/cache/dashboard-cache';
import { invalidateAnalyticsCache } from '@/server/cache/analytics-cache';
import { invalidateInsights } from '@/server/cache/insight-cache';

/**
 * Habit Service
 * Business logic for habit management
 */

export class HabitService {
  private habitRepository: HabitRepository;
  private streakRepository: StreakRepository;
  private auditRepository: AuditRepository;

  constructor() {
    this.habitRepository = new HabitRepository();
    this.streakRepository = new StreakRepository();
    this.auditRepository = new AuditRepository();
  }

  /**
   * List habits for a user.
   *
   * The route validates query params with `habitQuerySchema` and hands the
   * parsed filters straight through, so filtering lives in one place.
   */
  async listHabits(
    userId: string,
    filters: Parameters<HabitRepository['findAll']>[1] = {}
  ) {
    return this.habitRepository.findAll(userId, filters);
  }

  /**
   * Filter the user's habits.
   *
   * Owns the composed filter rules that used to live in the route: free-text
   * search over name/description, an "active on this date" window check, and the
   * "has a log at this energy level" filter (resolved with one query, not one
   * lookup per habit).
   */
  async filterHabits(
    userId: string,
    filters: {
      status?: HabitStatus[];
      tier?: HabitTier[];
      categoryId?: string;
      search?: string;
      sortBy?: 'name' | 'createdAt' | 'streak' | 'completionRate';
      sortOrder?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
      includeArchived?: boolean;
      date?: string;
      energy?: number;
    }
  ) {
    let habits = await this.habitRepository.findAll(userId, {
      status: filters.status,
      tier: filters.tier,
      categoryId: filters.categoryId,
      includeArchived: filters.includeArchived,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      limit: filters.limit,
      offset: filters.offset,
    });

    if (filters.search) {
      const q = filters.search.toLowerCase();
      habits = habits.filter(
        (habit) =>
          habit.name.toLowerCase().includes(q) ||
          (habit.description?.toLowerCase().includes(q) ?? false)
      );
    }

    if (filters.date) {
      const target = new Date(`${filters.date}T00:00:00Z`);
      habits = habits.filter((habit) => {
        if (new Date(habit.startDate) > target) return false;
        if (habit.endDate && new Date(habit.endDate) < target) return false;
        return true;
      });
    }

    if (filters.energy !== undefined) {
      const matchingIds = new Set(
        await this.habitRepository.findIdsWithLogEnergy(userId, filters.energy)
      );
      habits = habits.filter((habit) => matchingIds.has(habit.id));
    }

    return habits;
  }

  /**
   * Today's eligible habits with their completion state.
   *
   * Owns the assembly that used to live in the route: list active habits, join
   * the date's logs, evaluate eligibility for each, then keep only the eligible
   * ones. Ad-hoc inclusions (added manually for the date) come back flagged
   * with `source: 'MANUAL'`.
   */
  async getHabitsForDate(userId: string, date: string) {
    const [habits, logs] = await Promise.all([
      this.habitRepository.findAll(userId, { status: 'ACTIVE' }),
      this.habitRepository.findLogsByDate(userId, date),
    ]);

    const logMap = new Map(logs.map((log) => [log.habitId, log]));

    const evaluated = await Promise.all(
      habits.map(async (habit) => {
        const eligibility = await calculateHabitEligibility(habit.id, userId, date);

        return {
          id: habit.id,
          name: habit.name,
          tier: habit.tier,
          color: habit.color,
          icon: habit.icon,
          estimatedDuration: habit.estimatedDuration,
          targetCount: habit.targetCount,
          category: habit.category,
          isEligible: eligibility.isEligible,
          eligibilityReason: eligibility.isEligible ? undefined : eligibility.reason,
          source: eligibility.source,
          log: logMap.get(habit.id) || null,
        };
      })
    );

    return evaluated.filter((habit) => habit.isEligible);
  }

  /**
   * Create new habit
   */
  async createHabit(
    userId: string,
    input: CreateHabitInput
  ): Promise<HabitWithRelations> {
    // Validate input
    if (!input.name?.trim()) {
      throw new Error('Habit name is required');
    }

    if (input.name.length > 100) {
      throw new Error('Habit name must be 100 characters or less');
    }

    // Set default tier weight if not provided
    const points = input.points || HABIT_TIER_CONFIG[input.tier].defaultPoints;

    // Create habit
    const { appliesEveryDay, dayTypeIds, tagIds, ...habitData } = input;
    const habit = await this.habitRepository.create({
      user: { connect: { id: userId } },
      name: habitData.name,
      description: habitData.description,
      tier: habitData.tier,
      status: 'ACTIVE',
      category: habitData.categoryId
        ? { connect: { id: habitData.categoryId } }
        : undefined,
      color: habitData.color,
      icon: habitData.icon,
      frequencyType: habitData.frequencyType,
      frequencyValue: habitData.frequencyValue,
      targetCount: habitData.targetCount,
      startDate: habitData.startDate || new Date(),
      endDate: habitData.endDate,
      reminderTime: habitData.reminderTime,
      reminderEnabled: habitData.reminderEnabled ?? false,
      points,
      estimatedDuration: habitData.estimatedDuration,
      difficulty: habitData.difficulty,
      isPublic: habitData.isPublic ?? false,
      appliesEveryDay: appliesEveryDay ?? true,
    } as Prisma.HabitCreateInput);

    // Add tags if provided
    await this.habitRepository.addTags(habit.id, tagIds ?? []);

    // Create day type assignments if habit is day-specific
    if (appliesEveryDay === false) {
      await this.habitRepository.addDayTypeAssignments(habit.id, dayTypeIds ?? []);
    }

    // Invalidate dashboard cache
    invalidateDashboard(userId);
    invalidateAnalyticsCache(userId);
    invalidateInsights(userId);

    // Return habit with relations
    return (await this.habitRepository.findWithRelations(
      habit.id,
      userId
    )) as HabitWithRelations;
  }

  /**
   * Update existing habit
   */
  async updateHabit(
    userId: string,
    habitId: string,
    input: UpdateHabitInput
  ): Promise<HabitWithRelations> {
    // Verify ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new Error('Habit not found');
    }

    // Validate name if provided
    if (input.name && input.name.length > 100) {
      throw new Error('Habit name must be 100 characters or less');
    }

    const { appliesEveryDay, dayTypeIds, tagIds, ...updateData } = input;

    // Update habit
    await this.habitRepository.update(habitId, userId, {
      ...(updateData.name && { name: updateData.name }),
      ...(updateData.description !== undefined && { description: updateData.description }),
      ...(updateData.tier && { tier: updateData.tier }),
      ...(updateData.status && { status: updateData.status }),
      ...(updateData.categoryId !== undefined && {
        category: updateData.categoryId
          ? { connect: { id: updateData.categoryId } }
          : { disconnect: true },
      }),
      ...(updateData.color && { color: updateData.color }),
      ...(updateData.icon && { icon: updateData.icon }),
      ...(updateData.frequencyType && { frequencyType: updateData.frequencyType }),
      ...(updateData.frequencyValue !== undefined && { frequencyValue: updateData.frequencyValue }),
      ...(updateData.targetCount !== undefined && { targetCount: updateData.targetCount }),
      ...(updateData.reminderTime && { reminderTime: updateData.reminderTime }),
      ...(updateData.reminderEnabled !== undefined && { reminderEnabled: updateData.reminderEnabled }),
      ...(updateData.isPublic !== undefined && { isPublic: updateData.isPublic }),
      ...(appliesEveryDay !== undefined && { appliesEveryDay }),
    });

    // Update tags if provided
    if (tagIds) {
      await this.habitRepository.clearTags(habitId);
      await this.habitRepository.addTags(habitId, tagIds);
    }

    // Update day type assignments if provided
    if (dayTypeIds !== undefined) {
      await this.habitRepository.clearDayTypeAssignments(habitId);
      if (appliesEveryDay === false) {
        await this.habitRepository.addDayTypeAssignments(habitId, dayTypeIds);
      }
    }

    return (await this.habitRepository.findWithRelations(
      habitId,
      userId
    )) as HabitWithRelations;
  }

  /**
   * Log habit completion
   */
  async logHabit(
    userId: string,
    input: LogHabitInput
  ): Promise<{
    log: HabitLog;
    streakUpdated: boolean;
    newStreak?: number;
  }> {
    const { habitId, date, status, completedAt, note } = input;

    // Verify habit ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new Error('Habit not found');
    }

    // Check if habit is eligible for this date
    const eligibility = await calculateHabitEligibility(habitId, userId, date);
    if (!eligibility.isEligible && status === 'COMPLETED') {
      throw new Error(`Habit is not eligible for ${date}: ${eligibility.reason}`);
    }

    // Create or update log
    const log = await this.habitRepository.upsertLog(
      habitId,
      userId,
      date,
      {
        habit: { connect: { id: habitId } },
        user: { connect: { id: userId } },
        date,
        status,
        completedAt,
        note,
        durationMinutes: input.durationMinutes,
        quantity: input.quantity,
        difficulty: input.difficulty,
        energyLevel: input.energyLevel,
        moodBefore: input.moodBefore,
        moodAfter: input.moodAfter,
      } as Prisma.HabitLogCreateInput
    );

    // Update streak if completed
    let streakUpdated = false;
    let newStreak: number | undefined;

    if (status === 'COMPLETED') {
      const streak = await this.streakRepository.findByUserId(userId);
      if (streak) {
        const updated = await calculateStreak(userId, date, habit.tier);
        if (updated.changed) {
          streakUpdated = true;
          newStreak = updated.currentStreak;

          // Check for milestone
          if (updated.newMilestone !== undefined) {
            await recordStreakMilestone(
              userId,
              updated.newMilestone,
              habit.tier.toLowerCase()
            );
          }
        }
      }
    }

    // Trigger score recalculation for the date
    await new ScoringService().calculateDailyScore(userId, date);

    // Trigger achievement checks asynchronously (don't block the request)
    new AchievementService().checkForUnlocks(userId).catch(err => {
      console.error('Failed to check achievements after habit log:', err);
    });

    invalidateDashboard(userId);
    invalidateAnalyticsCache(userId);
    invalidateInsights(userId);

    return {
      log,
      streakUpdated,
      newStreak,
    };
  }

  /**
   * Archive habit
   */
  async archiveHabit(
    userId: string,
    habitId: string,
    reason?: string
  ): Promise<void> {
    // Verify ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new Error('Habit not found');
    }

    await this.habitRepository.archive(habitId, userId);

    // Log audit trail
    await this.auditRepository.create({
      userId,
      action: 'HABIT_ARCHIVED',
      entityType: 'HABIT',
      entityId: habitId,
      metadata: reason ? { reason } : undefined,
    });

    invalidateDashboard(userId);
    invalidateAnalyticsCache(userId);
    invalidateInsights(userId);
  }

  /**
   * Pause habit
   */
  async pauseHabit(
    userId: string,
    habitId: string,
    reason?: string,
    resumeDate?: string
  ): Promise<void> {
    // Verify ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new Error('Habit not found');
    }

    // Update status
    await this.habitRepository.updateStatus(habitId, userId, 'PAUSED');

    // Create override if resumeDate provided
    if (resumeDate) {
      const today = new Date().toISOString().split('T')[0];
      await this.habitRepository.createOverride({
        habit: { connect: { id: habitId } },
        user: { connect: { id: userId } },
        type: 'PAUSE',
        startDate: today,
        endDate: resumeDate,
        reason,
      } as Prisma.HabitOverrideCreateInput);
    }

    invalidateDashboard(userId);
    invalidateAnalyticsCache(userId);
    invalidateInsights(userId);
  }

  /**
   * Resume habit
   */
  async resumeHabit(userId: string, habitId: string): Promise<void> {
    // Verify ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new Error('Habit not found');
    }

    if (habit.status !== 'PAUSED') {
      throw new Error('Habit is not paused');
    }

    // Update status
    await this.habitRepository.updateStatus(habitId, userId, 'ACTIVE');

    // Clear pause overrides
    await this.habitRepository.deleteOverridesByType(habitId, 'PAUSE');

    invalidateDashboard(userId);
    invalidateAnalyticsCache(userId);
    invalidateInsights(userId);
  }

  /**
   * Aggregate habit health across the user's active habits over a recent
   * window. Real data only: completion rate is completed / (completed +
   * missed + skipped) within the window, classified into healthy / at-risk /
   * unhealthy. Habits with no logs in the window report "no data".
   */
  async getHabitHealth(userId: string, windowDays = 28) {
    const endDate = getTodayString(DEFAULT_TZ);
    const startDate = format(subDays(parseISO(endDate), windowDays - 1), 'yyyy-MM-dd');

    const [habits, logs] = await Promise.all([
      this.habitRepository.findAll(userId, { status: 'ACTIVE' }),
      this.habitRepository.findLogsByUserRange(userId, startDate, endDate),
    ]);

    const logsByHabit = new Map<string, HabitLog[]>();
    for (const log of logs) {
      const list = logsByHabit.get(log.habitId) ?? [];
      list.push(log);
      logsByHabit.set(log.habitId, list);
    }

    const rows = habits.map((habit) => {
      const habitLogs = logsByHabit.get(habit.id) ?? [];
      const completedCount = habitLogs.filter(l => l.status === 'COMPLETED').length;
      const missedCount = habitLogs.filter(l => l.status === 'MISSED').length;
      const skippedCount = habitLogs.filter(l => l.status === 'SKIPPED').length;
      const dueCount = completedCount + missedCount + skippedCount;
      const completionRate =
        dueCount > 0 ? Math.round((completedCount / dueCount) * 100) : null;

      let health: 'HEALTHY' | 'AT_RISK' | 'UNHEALTHY' | 'NO_DATA' = 'NO_DATA';
      if (completionRate !== null) {
        health = completionRate >= 75 ? 'HEALTHY' : completionRate >= 40 ? 'AT_RISK' : 'UNHEALTHY';
      }

      return {
        habitId: habit.id,
        name: habit.name,
        tier: habit.tier,
        status: habit.status,
        color: habit.color,
        icon: habit.icon,
        currentStreak: habit.streakCount,
        longestStreak: habit.longestStreak,
        completedCount,
        missedCount,
        skippedCount,
        dueCount,
        completionRate,
        health,
      };
    });

    const rated = rows.filter(r => r.completionRate !== null);
    const overallCompletionRate =
      rated.length > 0
        ? Math.round(
            rated.reduce((sum, r) => sum + (r.completionRate as number), 0) /
              rated.length
          )
        : null;

    return {
      window: { startDate, endDate, days: windowDays },
      summary: {
        totalActive: rows.length,
        withDataCount: rated.length,
        healthyCount: rows.filter(r => r.health === 'HEALTHY').length,
        atRiskCount: rows.filter(r => r.health === 'AT_RISK').length,
        unhealthyCount: rows.filter(r => r.health === 'UNHEALTHY').length,
        overallCompletionRate,
      },
      habits: rows,
    };
  }

  /**
   * Add a habit to a specific date manually (ad-hoc inclusion). Persists a
   * RESCHEDULE override scoped to that date so the habit surfaces in today's
   * list even though it isn't scheduled by frequency.
   */
  async addHabitToToday(
    userId: string,
    habitId: string,
    date: string
  ): Promise<void> {
    // Verify ownership + active status
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new Error('Habit not found');
    }
    if (habit.status !== 'ACTIVE') {
      throw new Error('Only active habits can be added to today');
    }

    const existing = await this.habitRepository.findActiveOverrides(habitId, userId, date);
    const alreadyAdded = existing.some(
      o =>
        o.type === 'RESCHEDULE' &&
        o.startDate <= date &&
        (o.endDate === null || o.endDate === undefined || o.endDate >= date)
    );
    if (alreadyAdded) return;

    await this.habitRepository.createOverride({
      habit: { connect: { id: habitId } },
      user: { connect: { id: userId } },
      type: 'RESCHEDULE',
      startDate: date,
      endDate: date,
      reason: 'Added to today manually',
    } as Prisma.HabitOverrideCreateInput);

    invalidateDashboard(userId);
    invalidateAnalyticsCache(userId);
    invalidateInsights(userId);
  }

  /**
   * Remove a manual ad-hoc inclusion for a date. Only clears the RESCHEDULE
   * override that added the habit; the habit itself is untouched.
   */
  async removeHabitFromToday(
    userId: string,
    habitId: string,
    date: string
  ): Promise<void> {
    const existing = await this.habitRepository.findActiveOverrides(habitId, userId, date);
    const manual = existing.filter(
      o =>
        o.type === 'RESCHEDULE' &&
        o.startDate <= date &&
        (o.endDate === null || o.endDate === undefined || o.endDate >= date)
    );
    for (const override of manual) {
      await this.habitRepository.deleteOverride(override.id, userId);
    }

    invalidateDashboard(userId);
    invalidateAnalyticsCache(userId);
    invalidateInsights(userId);
  }

  /**
   * Skip habit for date
   */
  async skipHabit(
    userId: string,
    habitId: string,
    date: string,
    reason?: string
  ): Promise<void> {
    // Verify ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new Error('Habit not found');
    }

    // Create skip override
    await this.habitRepository.createOverride({
      habit: { connect: { id: habitId } },
      user: { connect: { id: userId } },
      type: 'SKIP_TODAY',
      startDate: date,
      reason,
    } as Prisma.HabitOverrideCreateInput);

    // Log as skipped
    await this.habitRepository.upsertLog(
      habitId,
      userId,
      date,
      {
        habit: { connect: { id: habitId } },
        user: { connect: { id: userId } },
        date,
        status: 'SKIPPED',
      } as Prisma.HabitLogCreateInput
    );

    invalidateDashboard(userId);
    invalidateAnalyticsCache(userId);
    invalidateInsights(userId);
  }

  /**
   * Delete habit
   */
  async deleteHabit(userId: string, habitId: string): Promise<void> {
    // Verify ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new Error('Habit not found');
    }

    // Cascade delete of logs/overrides/tags/day-types is owned by the repository.
    await this.habitRepository.deleteCascade(habitId);

    // Log audit trail
    await this.auditRepository.create({
      userId,
      action: 'HABIT_DELETED',
      entityType: 'HABIT',
      entityId: habitId,
    });

    invalidateDashboard(userId);
    invalidateAnalyticsCache(userId);
    invalidateInsights(userId);
  }

  /**
   * Delete habit
   */
  async getHabitAnalytics(
    userId: string,
    habitId: string,
    startDate: string,
    endDate: string
  ) {
    // Verify ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new Error('Habit not found');
    }

    // Get logs for range
    const logs = await this.habitRepository.findLogsByRange(
      habitId,
      userId,
      startDate,
      endDate
    );

    // Calculate metrics
    const completedCount = logs.filter(l => l.status === 'COMPLETED').length;
    const missedCount = logs.filter(l => l.status === 'MISSED').length;
    const skippedCount = logs.filter(l => l.status === 'SKIPPED').length;
    const totalScheduled = logs.length;

    const completionRate = totalScheduled > 0 ? (completedCount / totalScheduled) * 100 : 0;

    return {
      habitId,
      habitName: habit.name,
      tier: habit.tier,
      period: { startDate, endDate },
      completion: {
        totalDays: totalScheduled,
        completedDays: completedCount,
        missedDays: missedCount,
        skippedDays: skippedCount,
        completionRate: Math.round(completionRate),
      },
      currentStreak: habit.streakCount,
      longestStreak: habit.longestStreak,
      averageDifficulty: logs.length > 0
        ? Math.round(
            logs.filter(l => l.difficulty).reduce((sum, l) => sum + (l.difficulty || 0), 0) /
              logs.filter(l => l.difficulty).length
          )
        : null,
      logs: logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    };
  }
}
