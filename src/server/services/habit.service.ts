import type { Prisma, HabitLog } from '@/generated/prisma';
import { format, parseISO, subDays } from 'date-fns';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import { ValidationError } from '@/lib/errors/app-error';
import type { HabitWithRelations, CreateHabitInput, UpdateHabitInput, LogHabitInput } from '@/types/habit';
import { HABIT_TIER_CONFIG } from '@/constants/habit-tiers';
import { calculateHabitEligibility } from '@/lib/habits/eligibility';
import { calculateStreak, recordStreakMilestone } from '@/lib/streaks/calculate-streak';
import { AuditRepository } from '@/server/repositories/audit.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { ScoringService } from './scoring.service';
import { AchievementService } from './achievement.service';
import { automationService } from './automation.service';
import type { UserId } from '@/types/ids';

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
    userId: UserId,
    filters: Parameters<HabitRepository['findAll']>[1] = {}
  ) {
    return this.habitRepository.findAll(userId, filters);
  }

  /**
   * How many habits match the same filters `listHabits` was given.
   *
   * Exists so the route can report a real total. It previously returned
   * `meta.total = habits.length`, i.e. the length of the *page*: a client that
   * trusted it to decide "have I loaded everything?" stopped at exactly `limit`
   * records and believed it had the whole set, which is the same silent
   * truncation the high `limit` was meant to hide.
   */
  /**
   * A single habit with its day-type, tag and category relations, or `null`.
   *
   * Returns `null` rather than throwing so the route can answer 404 for a habit
   * that does not belong to the caller without inspecting an error type.
   */
  async getHabitWithRelations(habitId: string, userId: UserId) {
    return this.habitRepository.findWithRelations(habitId, userId);
  }

  async countHabits(
    userId: UserId,
    filters: Parameters<HabitRepository['findAll']>[1] = {}
  ) {
    return this.habitRepository.countAll(userId, filters);
  }


  /**
   * Today's eligible habits with their completion state.
   *
   * Owns the assembly that used to live in the route: list active habits, join
   * the date's logs, evaluate eligibility for each, then keep only the eligible
   * ones. Ad-hoc inclusions (added manually for the date) come back flagged
   * with `source: 'MANUAL'`.
   */
  async getHabitsForDate(userId: UserId, date: string) {
    const [habits, logs] = await Promise.all([
      this.habitRepository.findAll(userId, { status: 'ACTIVE' }),
      this.habitRepository.findLogsByDate(userId, date),
    ]);

    const logMap = new Map(logs.map((log) => [log.habitId, log]));

    /**
     * Resolved once and threaded into every eligibility check.
     *
     * `calculateHabitEligibility` needs the user's timezone for the frequency
     * schedule and the resolved day type for day-type restrictions. Letting it
     * fetch those itself meant one `UserSettings` read per habit — 11 habits on
     * /today meant 11 identical settings queries on the hottest read in the
     * app. The habit row itself is still fetched per habit, which is pre-existing.
     */
    const timezone =
      (await new UserRepository()
        .getSettings(userId)
        .then((s) => s?.timezone || DEFAULT_TZ)
        .catch(() => DEFAULT_TZ)) ?? DEFAULT_TZ;

    const evaluated = await Promise.all(
      habits.map(async (habit) => {
        const eligibility = await calculateHabitEligibility(habit.id, userId, date, timezone);

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
    userId: UserId,
    input: CreateHabitInput
  ): Promise<HabitWithRelations> {
    // Validate input
    if (!input.name?.trim()) {
      throw new ValidationError('Habit name is required');
    }

    if (input.name.length > 100) {
      throw new ValidationError('Habit name must be 100 characters or less');
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
    userId: UserId,
    habitId: string,
    input: UpdateHabitInput
  ): Promise<HabitWithRelations> {
    // Verify ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new ValidationError('Habit not found');
    }

    // Validate name if provided
    if (input.name && input.name.length > 100) {
      throw new ValidationError('Habit name must be 100 characters or less');
    }

    const { appliesEveryDay, dayTypeIds, tagIds, ...updateData } = input;

    // Update habit.
    //
    // Every key is tested with `!== undefined`, never truthiness. A `&&` guard
    // silently drops `null`, so the Edit modal's "clear the reminder" and
    // "clear the colour" sent `{ reminderTime: null }`, the service skipped the
    // key, the PATCH answered 200, and the field came back on the next load.
    // `undefined` still means "not mentioned, leave it alone" -- that is what
    // `JSON.stringify` dropping undefined keys and `z.partial()` both rely on.
    await this.habitRepository.update(habitId, userId, {
      ...(updateData.name !== undefined && { name: updateData.name }),
      ...(updateData.description !== undefined && { description: updateData.description }),
      ...(updateData.tier !== undefined && { tier: updateData.tier }),
      ...(updateData.status !== undefined && { status: updateData.status }),
      ...(updateData.categoryId !== undefined && {
        category: updateData.categoryId
          ? { connect: { id: updateData.categoryId } }
          : { disconnect: true },
      }),
      ...(updateData.color !== undefined && { color: updateData.color }),
      ...(updateData.icon !== undefined && { icon: updateData.icon }),
      ...(updateData.frequencyType !== undefined && { frequencyType: updateData.frequencyType }),
      ...(updateData.frequencyValue !== undefined && { frequencyValue: updateData.frequencyValue }),
      ...(updateData.targetCount !== undefined && { targetCount: updateData.targetCount }),
      // Declared on `createHabitSchema`, so they are legal input here, but they
      // were never forwarded. Editing them answered 200 and reverted.
      //
      // `startDate` is `NOT NULL` with a `@default(now())`, so Prisma's
      // `HabitUpdateInput` types it as `Date | string` with no `null` and
      // "clearing" it is not expressible; only a real value is forwarded.
      // `endDate` is nullable, so `null` genuinely clears it.
      ...(updateData.startDate && { startDate: new Date(updateData.startDate) }),
      ...(updateData.endDate !== undefined && {
        endDate: updateData.endDate ? new Date(updateData.endDate) : null,
      }),
      ...(updateData.points !== undefined && { points: updateData.points }),
      ...(updateData.estimatedDuration !== undefined && { estimatedDuration: updateData.estimatedDuration }),
      ...(updateData.difficulty !== undefined && { difficulty: updateData.difficulty }),
      ...(updateData.reminderTime !== undefined && { reminderTime: updateData.reminderTime }),
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
    userId: UserId,
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
      throw new ValidationError('Habit not found');
    }

    // Check if habit is eligible for this date
    const eligibility = await calculateHabitEligibility(habitId, userId, date);
    if (!eligibility.isEligible) {
      /*
       * Both `COMPLETED` and `MISSED` are refused for a day the habit was never
       * scheduled on. `COMPLETED` is the obvious one and was always checked.
       * `MISSED` was not, and that is the damaging case: `/habits` un-ticking a
       * habit writes `MISSED`, so a user with a `MONTHLY_TARGET` habit, or a
       * habit past its `endDate`, or one restricted to "Weekend", could record a
       * miss on an arbitrary day. That row is then counted as a scheduled day
       * that was not completed by both `getHabitHealth` (which derives
       * `expectedDays` from the logs themselves) and the daily score, so one
       * stray un-tick permanently depressed the habit's 28-day rate and its
       * streak.
       *
       * `SKIPPED`, `PARTIAL` and `NOT_APPLICABLE` are still allowed: those are
       * exactly the statuses that describe a day the habit did not apply to,
       * and the `/today` skip flow depends on being able to record them.
       */
      if (status === 'COMPLETED' || status === 'MISSED') {
        throw new ValidationError(`Habit is not eligible for ${date}: ${eligibility.reason}`);
      }
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
            // Dated to the log's own day. It previously fell back to
            // `new Date().toISOString()`, so back-filling an older day recorded
            // the milestone against today and it vanished from the day it
            // happened in every date-bucketed query.
            await recordStreakMilestone(
              userId,
              updated.newMilestone,
              habit.tier.toLowerCase(),
              date
            );
          }
        }
      }
    }

    // Trigger score recalculation for the date
    await new ScoringService().calculateDailyScore(userId, date);

    // Fire `HABIT_COMPLETED` automations. Previously nothing evaluated
    // automation rules, so enabling one had no effect. Fire-and-forget like the
    // achievement check: an automation must not fail the habit log.
    //
    // Only on COMPLETED — a MISSED or PARTIAL log is not a completion, and
    // firing on every log would spam tasks for users who mark things skipped.
    if (status === 'COMPLETED') {
      automationService
        .handleEvent(userId, { type: 'HABIT_COMPLETED', habitId, date })
        .catch((err: unknown) => {
          console.error('Failed to run automations after habit log:', err);
        });
    }

    // Trigger achievement checks asynchronously (don't block the request)
    new AchievementService().checkForUnlocks(userId).catch(err => {
      console.error('Failed to check achievements after habit log:', err);
    });


    return {
      log,
      streakUpdated,
      newStreak,
    };
  }

  /**
   * Attach or clear a habit-log note without changing completion state.
   *
   * The Notes panel used to POST `/log` with `status: 'COMPLETED'`, so saving
   * a note marked the habit done and advanced the streak — and on a day the
   * habit was not scheduled, the eligibility guard rejected the COMPLETED
   * status, so the note could not be saved at all. A note is metadata about the
   * day, not evidence the habit was completed, so it gets its own path.
   */
  async setNote(
    userId: UserId,
    habitId: string,
    date: string,
    note: string | null
  ): Promise<HabitLog> {
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new ValidationError('Habit not found');
    }
    return this.habitRepository.setLogNote(habitId, userId, date, note);
  }

  /**
   * Archive habit
   */
  async archiveHabit(
    userId: UserId,
    habitId: string,
    reason?: string
  ): Promise<void> {
    // Verify ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new ValidationError('Habit not found');
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

  }

  /**
   * Restore an archived habit.
   *
   * Without this, archiving was irreversible: there was no restore endpoint,
   * service method or UI control anywhere, so a mis-click hid a habit and its
   * entire log history with no way back except hard deletion. The habit
   * returns to `ACTIVE` — a habit that was `PAUSED` before being archived
   * cannot be recovered as `PAUSED`, because the previous status is not stored.
   */
  async restoreHabit(userId: UserId, habitId: string) {
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new ValidationError('Habit not found');
    }

    if (habit.status !== 'ARCHIVED') {
      // Not an error worth failing the request over, but say so, because a
      // client double-submitting a restore would otherwise look like it worked.
      return habit;
    }

    await this.habitRepository.updateStatus(habitId, userId, 'ACTIVE');

    await this.auditRepository.create({
      userId,
      action: 'HABIT_RESTORED',
      entityType: 'HABIT',
      entityId: habitId,
    });

    return this.habitRepository.findById(habitId, userId);
  }

  /**
   * Pause habit
   */
  async pauseHabit(
    userId: UserId,
    habitId: string,
    reason?: string,
    resumeDate?: string
  ): Promise<void> {
    // Verify ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new ValidationError('Habit not found');
    }

    // Update status
    await this.habitRepository.updateStatus(habitId, userId, 'PAUSED');

    // Create override if resumeDate provided
    if (resumeDate) {
      /*
        The override's start date is bucketed to a CALENDAR day, so it has to be
        the user's today. This was `new Date().toISOString().split('T')[0]`, which
        is UTC: for a user at UTC+5:30 it wrote *yesterday* for much of the day,
        and the habit's own PAUSE override then started before the pause did. The
        symptom is "it unpaused a day early", which reads as a scheduling bug
        rather than a timezone one.
      */
      const settings = await new UserRepository().getSettings(userId).catch(() => null);
      const today = getTodayString(settings?.timezone || DEFAULT_TZ);
      await this.habitRepository.createOverride({
        habit: { connect: { id: habitId } },
        user: { connect: { id: userId } },
        type: 'PAUSE',
        startDate: today,
        endDate: resumeDate,
        reason,
      } as Prisma.HabitOverrideCreateInput);
    }

  }

  /**
   * Resume habit
   */
  async resumeHabit(userId: UserId, habitId: string): Promise<void> {
    // Verify ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new ValidationError('Habit not found');
    }

    if (habit.status !== 'PAUSED') {
      throw new ValidationError('Habit is not paused');
    }

    // Update status
    await this.habitRepository.updateStatus(habitId, userId, 'ACTIVE');

    // Clear pause overrides
    await this.habitRepository.deleteOverridesByType(habitId, 'PAUSE');

  }

  /**
   * All habit logs for a user on a single date, across every habit.
   *
   * `findAll` returns `_count: { select: { logs: true } }` — a *count*, not the
   * log rows — so the client could never reconstruct completion state from the
   * habits payload. `AppContext` previously read `raw.logs` off that payload,
   * which is always `undefined`, leaving `habitLogs` permanently empty and
   * every habit checkbox rendering as "not done" after a refresh. This is the
   * read path that answers the question the client was actually asking.
   */
  async getLogsForDate(userId: UserId, date: string) {
    return this.habitRepository.findLogsByUserRange(userId, date, date);
  }

  /**
   * Habit-log rows for an arbitrary window, across every habit. Used by the
   * dashboard health widget and the /habits list so both read one source.
   */
  async getLogsInRange(userId: UserId, startDate: string, endDate: string) {
    return this.habitRepository.findLogsByUserRange(userId, startDate, endDate);
  }

  /**
   * Aggregate habit health across the user's active habits over a recent
   * window. Real data only: completion rate is completed / (completed +
   * missed + skipped) within the window, classified into healthy / at-risk /
   * unhealthy. Habits with no logs in the window report "no data".
   */
  async getHabitHealth(userId: UserId, windowDays = 28) {
    // The window's *end* decides which logs count, so it has to be the user's
    // today. It was pinned to `DEFAULT_TZ`, which meant the last day of the
    // 28-day window was a different calendar day than the one the user logs
    // against — for anyone east or west of UTC the most recent day was
    // systematically included or excluded.
    const settings = await new UserRepository()
      .getSettings(userId)
      .catch(() => null);
    const timezone = settings?.timezone || DEFAULT_TZ;
    const endDate = getTodayString(timezone);
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
    userId: UserId,
    habitId: string,
    date: string
  ): Promise<void> {
    // Verify ownership + active status
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new ValidationError('Habit not found');
    }
    if (habit.status !== 'ACTIVE') {
      throw new ValidationError('Only active habits can be added to today');
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

  }

  /**
   * Remove a manual ad-hoc inclusion for a date. Only clears the RESCHEDULE
   * override that added the habit; the habit itself is untouched.
   */
  async removeHabitFromToday(
    userId: UserId,
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

  }

  /**
   * Skip habit for date
   */
  async skipHabit(
    userId: UserId,
    habitId: string,
    date: string,
    reason?: string
  ): Promise<void> {
    // Verify ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new ValidationError('Habit not found');
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

  }

  /**
   * Delete habit
   */
  async deleteHabit(userId: UserId, habitId: string): Promise<void> {
    // Verify ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new ValidationError('Habit not found');
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

  }

  /**
   * Delete habit
   */
  async getHabitAnalytics(
    userId: UserId,
    habitId: string,
    startDate: string,
    endDate: string
  ) {
    // Verify ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new ValidationError('Habit not found');
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
