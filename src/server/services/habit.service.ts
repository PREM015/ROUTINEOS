import type { Prisma, HabitLog, HabitLogStatus } from '@/generated/prisma';
import { format, parseISO, subDays } from 'date-fns';
import { getTodayString, DEFAULT_TZ, calendarDaysBetween, previousCalendarDay } from '@/lib/dates';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { StreakRepository } from '@/server/repositories/streak.repository';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
} from '@/lib/errors/app-error';
import type {
  HabitWithRelations,
  CreateHabitInput,
  UpdateHabitInput,
  LogHabitInput,
} from '@/types/habit';
import type { HabitDirection, HabitTrackingType } from '@/generated/prisma';
import { HABIT_TIER_CONFIG } from '@/constants/habit-tiers';
import { calculateHabitEligibility } from '@/lib/habits/eligibility';
import {
  isValidTarget,
  statusFromReading,
} from '@/lib/habits/completion';
import { calculateStreak, recordStreakMilestone } from '@/lib/streaks/calculate-streak';
import { AuditRepository } from '@/server/repositories/audit.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { ScoringService } from './scoring.service';
import { AchievementService } from './achievement.service';
import { automationService } from './automation.service';
import type { UserId } from '@/types/ids';

/**
 * Consecutive-completion streak for a habit, from a set of completion dates.
 *
 * THE definition of a per-habit streak. `Habit.streakCount` / `longestStreak`
 * are denormalised columns with a repository writer (`updateStreak`) that had
 * **zero callers**, so both stayed at their schema default of 0 while the UI,
 * the AI aggregator, the exporter and analytics all read them. The per-habit
 * flame badge therefore never rendered for anyone.
 *
 * Deriving it from the completion dates instead of trusting the column means
 * the number cannot silently disagree with the logs it describes.
 *
 * Rules:
 *  - Only `COMPLETED` dates count; `MISSED`/`SKIPPED`/`PARTIAL` break the run.
 *  - The streak is anchored at `today`, and a day with no log yet is tolerated
 *    (the user simply has not logged today), matching the grace the user-level
 *    streak gives itself.
 *  - Non-consecutive dates start a new run.
 */
export function deriveHabitStreak(
  completionDates: readonly string[],
  today: string
): { currentStreak: number; longestStreak: number } {
  const completed = [...new Set(completionDates)].sort();

  // Longest run of consecutive dates anywhere in the history.
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const date of completed) {
    run = prev !== null && calendarDaysBetween(prev, date) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = date;
  }

  // Current run: walk back from today, tolerating today itself being unlogged.
  let currentStreak = 0;
  let cursor = today;
  if (!completed.includes(today)) {
    cursor = previousCalendarDay(today);
  }
  const set = new Set(completed);
  while (set.has(cursor)) {
    currentStreak += 1;
    cursor = previousCalendarDay(cursor);
  }

  return { currentStreak, longestStreak: Math.max(longest, currentStreak) };
}

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
   * Does this user already have a habit by this name?
   *
   * Backed by the `@@unique([userId, name])` index, so it is a single indexed
   * lookup. Exposed because "add this catalogue habit" needs to answer it
   * before creating, and the alternative — loading the user's whole habit list
   * and scanning it in JavaScript — turns a constant-time check into a query
   * that grows with their account.
   */
  async findByName(userId: UserId, name: string) {
    return this.habitRepository.findByName(userId, name);
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
          /*
           * The numeric-entry fields.
           *
           * Sent so `/today` can render a number input for a COUNT/DURATION
           * habit instead of a bare checkbox, and compute whether that number
           * already clears the bar before the user submits anything.
           *
           * Read from **this habit row**, which is already scoped to `userId`
           * above — so two people seeing "Daily Steps" on their own dashboards
           * are always looking at their own two targets.
           */
          trackingType: habit.trackingType,
          direction: habit.direction,
          targetValue: habit.targetValue,
          unit: habit.unit,
          timeOfDay: habit.timeOfDay,
          sortOrder: habit.sortOrder,
          parentHabitId: habit.parentHabitId,
          definitionId: habit.definitionId,
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
   * Create new habit.
   *
   * A habit with no `definitionId` is a **custom habit** and is the normal case:
   * nothing about creation requires a catalogue entry, and none of the behaviour
   * below reads one. `definitionId` is provenance for a badge and nothing else,
   * which is why it is stored but never consulted afterwards.
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

    /*
     * The name must be unique per user, not globally.
     *
     * `@@unique([userId, name])` makes the database the final authority, but a
     * raw P2002 would surface as a 500. Two users both having "Daily Steps" is
     * the whole premise of this feature, so the conflict is specifically a
     * *self* conflict and worth a clear 409 — and it is checked here rather than
     * left to the constraint so the message names the habit.
     */
    const duplicate = await this.habitRepository.findByName(userId, input.name);
    if (duplicate) {
      throw new ConflictError(
        `You already have a habit named "${input.name}". Rename it or edit the existing one.`
      );
    }

    // Set default tier weight if not provided
    const points = input.points || HABIT_TIER_CONFIG[input.tier].defaultPoints;

    // Create habit
    const { appliesEveryDay, dayTypeIds, tagIds, ...habitData } = input;

    /*
     * A COUNT/DURATION habit needs a target or `evaluateCompletion` has nothing
     * to compare against and the habit can never complete. Rejected here with a
     * named field rather than failing later as a permanently-unchecked row.
     */
    this.assertTargetIsUsable(habitData);

    /*
     * `parentHabitId` is user-supplied, so it is verified against the caller's
     * own habits before it is written. Without this, a client could file their
     * habit under another user's grouping parent; the FK would accept it and the
     * daily checklist would render a stranger's habit inside this user's group.
     */
    if (habitData.parentHabitId) {
      const parent = await this.habitRepository.findById(
        habitData.parentHabitId,
        userId
      );
      if (!parent) {
        throw new NotFoundError('Parent habit');
      }
    }

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
      definitionId: habitData.definitionId ?? null,
      trackingType: habitData.trackingType ?? 'BOOLEAN',
      direction: habitData.direction ?? 'BUILD',
      targetValue: habitData.targetValue ?? null,
      unit: habitData.unit ?? null,
      timeOfDay: habitData.timeOfDay ?? null,
      sortOrder: habitData.sortOrder ?? 0,
      linkedMetricType: habitData.linkedMetricType ?? null,
      intervalDays: habitData.intervalDays ?? null,
      parentHabitId: habitData.parentHabitId ?? null,
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

    // Return habit with relations
    return (await this.habitRepository.findWithRelations(
      habit.id,
      userId
    )) as HabitWithRelations;
  }

  /**
   * Reject a numeric habit that could never be judged.
   *
   * `AVOID` is exempt on purpose: its rule is "no reading", so a target would be
   * meaningless. A `COUNT`/`DURATION` habit with no target would sit on the
   * checklist forever reading 0%, which is a far more confusing failure than a
   * 400 at creation time.
   */
  private assertTargetIsUsable(habit: {
    trackingType?: HabitTrackingType;
    direction?: HabitDirection;
    targetValue?: number | null;
  }) {
    const trackingType = habit.trackingType ?? 'BOOLEAN';
    if (trackingType === 'BOOLEAN') return;
    if (habit.direction === 'AVOID') return;

    if (!isValidTarget(habit.targetValue ?? null)) {
      throw new ValidationError(
        'A positive target is required for COUNT and DURATION habits'
      );
    }
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
      throw new NotFoundError('Habit');
    }

    // Validate name if provided
    if (input.name && input.name.length > 100) {
      throw new ValidationError('Habit name must be 100 characters or less');
    }

    /*
     * Renaming must not collide with another of *this user's* habits.
     *
     * Checked against the caller only: another user having the same name is not
     * a conflict, and treating it as one would make the catalogue premise
     * impossible.
     */
    if (input.name !== undefined && input.name !== habit.name) {
      const clash = await this.habitRepository.findByName(userId, input.name);
      if (clash) {
        throw new ConflictError(
          `You already have a habit named "${input.name}".`
        );
      }
    }

    const { appliesEveryDay, dayTypeIds, tagIds, ...updateData } = input;

    /*
     * Validate the *resulting* habit, not just the patch.
     *
     * The patch alone is not enough to tell whether the habit is still
     * judgeable: switching `trackingType` from `BOOLEAN` to `COUNT` without
     * sending a target would leave a numeric habit that can never complete, and
     * a check that only looked at `input.targetValue` would wave it through.
     */
    this.assertTargetIsUsable({
      trackingType: updateData.trackingType ?? habit.trackingType,
      direction: updateData.direction ?? habit.direction,
      targetValue:
        updateData.targetValue !== undefined
          ? updateData.targetValue
          : habit.targetValue,
    });

    /*
     * Re-parenting is verified against the caller's own habits, and a habit
     * cannot become its own ancestor — the schema's `onDelete: SetNull` would
     * otherwise let a chain form that `deleteCascade` walks forever.
     */
    if (updateData.parentHabitId !== undefined) {
      if (updateData.parentHabitId === habitId) {
        throw new ValidationError('A habit cannot be its own parent');
      }
      if (updateData.parentHabitId !== null) {
        const parent = await this.habitRepository.findById(
          updateData.parentHabitId,
          userId
        );
        if (!parent) {
          throw new NotFoundError('Parent habit');
        }
      }
    }

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
      ...(updateData.definitionId !== undefined && { definitionId: updateData.definitionId }),
      ...(updateData.trackingType !== undefined && { trackingType: updateData.trackingType }),
      ...(updateData.direction !== undefined && { direction: updateData.direction }),
      ...(updateData.targetValue !== undefined && { targetValue: updateData.targetValue }),
      ...(updateData.unit !== undefined && { unit: updateData.unit }),
      ...(updateData.timeOfDay !== undefined && { timeOfDay: updateData.timeOfDay }),
      ...(updateData.sortOrder !== undefined && { sortOrder: updateData.sortOrder }),
      ...(updateData.linkedMetricType !== undefined && {
        linkedMetricType: updateData.linkedMetricType,
      }),
      ...(updateData.parentHabitId !== undefined && {
        parentHabitId: updateData.parentHabitId,
      }),
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

    /*
     * `intervalDays` is written **after** `frequencyType` and only when the
     * habit actually ends up on an interval schedule.
     *
     * Two reasons it is not in the object above: `frequencyType` and
     * `intervalDays` are set by the same request, and the decision of which to
     * keep depends on the final combination rather than on either key alone. A
     * gap left on a DAILY habit is dead data that looks meaningful in the UI.
     */
    const effectiveFrequencyType =
      updateData.frequencyType ?? habit.frequencyType;
    if (effectiveFrequencyType === 'EVERY_N_DAYS') {
      if (updateData.intervalDays !== undefined) {
        if (
          updateData.intervalDays !== null &&
          updateData.intervalDays < 1
        ) {
          throw new ValidationError('intervalDays must be at least 1');
        }
        await this.habitRepository.update(habitId, userId, {
          intervalDays: updateData.intervalDays,
        });
      } else if (!habit.intervalDays) {
        throw new ValidationError(
          'intervalDays is required for EVERY_N_DAYS habits'
        );
      }
    } else if (updateData.intervalDays !== undefined || habit.intervalDays) {
      await this.habitRepository.update(habitId, userId, { intervalDays: null });
    }

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
   * Log habit completion.
   *
   * Everything here is judged against **this** habit's own
   * `trackingType`/`direction`/`targetValue`. There is no global target and no
   * path by which another user's habit row could be reached: `findById` is
   * keyed on `{ id: habitId, userId }`, so a foreign id fails the lookup before
   * anything is read.
   */
  async logHabit(
    userId: UserId,
    input: LogHabitInput
  ): Promise<{
    log: HabitLog;
    streakUpdated: boolean;
    newStreak?: number;
  }> {
    const { habitId, date, completedAt, note } = input;

    // Verify habit ownership
    const habit = await this.habitRepository.findById(habitId, userId);
    if (!habit) {
      throw new NotFoundError('Habit');
    }

    /*
     * The status actually stored.
     *
     * A numeric habit's status is *derived* from the reading against its own
     * direction, rather than trusted from the client:
     *
     *   BUILD + 12400/15000 -> COMPLETED
     *   BUILD +  8000/15000 -> PARTIAL   (not MISSED: the day was recorded)
     *   LIMIT +  180/200min -> COMPLETED
     *   LIMIT +  340/200min -> PARTIAL
     *   AVOID  + no reading -> COMPLETED (the win condition is the absence)
     *   AVOID  +  2 smokes  -> PARTIAL
     *
     * Without this, a client could post `{ status: 'COMPLETED', quantity: 0 }`
     * and permanently mark 12,000 steps as done. The client's status is honoured
     * only when `statusIsExplicit` is set, which is how a genuine partial day is
     * recorded deliberately.
     */
    const reading = input.quantity ?? null;
    const derived = statusFromReading(
      {
        trackingType: habit.trackingType,
        direction: habit.direction,
        targetValue: habit.targetValue,
      },
      reading
    );

    const status: HabitLogStatus =
      input.statusIsExplicit || derived === null ? input.status : derived;

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

    /*
     * The target snapshot is stamped **at log time**, from the habit row read
     * above — i.e. this user's own target.
     *
     * This is what makes "changing a target never rewrites history" true: a day
     * logged against 8,000 keeps its 8,000, so raising the habit to 15,000
     * tomorrow cannot retroactively turn those completions into misses. A
     * re-log of the same day re-stamps it, which is correct — that day is being
     * re-judged now and should reflect what the user means now.
     */
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
        quantity: reading,
        targetSnapshot: habit.targetValue,
        unitSnapshot: habit.unit,
        difficulty: input.difficulty,
        energyLevel: input.energyLevel,
        moodBefore: input.moodBefore,
        moodAfter: input.moodAfter,
      } as Prisma.HabitLogCreateInput
    );

    // The score must exist before the streak is derived from it.
    //
    // `calculateStreak` reads `DailyScore` for `date` and yesterday; on the
    // FIRST habit completed on a date there is no score row yet, so
    // `todayScore` was null, the `isStreakActiveDay` branch was skipped, and
    // control fell through to "streak broken" — resetting a live streak to 0
    // and then re-incrementing it once per remaining completion. A day with N
    // completions could therefore yield at most N-1, and the first completion
    // actively destroyed the streak. Calculating the score first removes the
    // ordering hazard entirely.
    await new ScoringService().calculateDailyScore(userId, date);

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
      throw new NotFoundError('Habit');
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
      throw new NotFoundError('Habit');
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
      throw new NotFoundError('Habit');
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
      throw new NotFoundError('Habit');
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
      throw new NotFoundError('Habit');
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

    // Per-habit streaks come from the full completion history, not this 28-day
    // window (a streak routinely predates it) and not the `streakCount` column,
    // which nothing ever wrote. Same bulk call for every habit — no N+1.
    const streakWindowStart = format(subDays(parseISO(endDate), 730), 'yyyy-MM-dd');
    const completionDates = await this.habitRepository.findCompletionDatesByHabit(
      userId,
      streakWindowStart,
      endDate
    );

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

      const streak = deriveHabitStreak(completionDates.get(habit.id) ?? [], endDate);

      return {
        habitId: habit.id,
        name: habit.name,
        tier: habit.tier,
        status: habit.status,
        color: habit.color,
        icon: habit.icon,
        currentStreak: streak.currentStreak,
        longestStreak: Math.max(streak.longestStreak, habit.longestStreak ?? 0),
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
      throw new NotFoundError('Habit');
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
      throw new NotFoundError('Habit');
    }

    // Skipping one day must skip exactly one day.
    //
    // `endDate` was left unset, and every reader treats `endDate: null` as
    // *open-ended* — `findActiveOverrides` filters
    // `startDate <= date AND (endDate IS NULL OR endDate >= date)`, and both
    // eligibility implementations (`lib/habits/eligibility.ts`,
    // `lib/habits/contribution-eligibility.ts`) match on `startDate <= date`
    // alone. So a single "skip today" made the habit ineligible on every
    // subsequent date, permanently: it vanished from `/today`, every further
    // COMPLETED/MISSED log 400'd, and its whole history dropped out of the
    // contribution heatmap. There was no way back — no un-skip route, and
    // `resumeHabit` only clears `PAUSE` overrides.
    //
    // `endDate: date` is inclusive under that same query, so it covers the
    // intended single day and nothing more. `lib/habits/skip.ts` already
    // encoded the correct one-day meaning (`o.startDate === date`); this makes
    // the stored row agree with it.
    await this.habitRepository.createOverride({
      habit: { connect: { id: habitId } },
      user: { connect: { id: userId } },
      type: 'SKIP_TODAY',
      startDate: date,
      endDate: date,
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
      throw new NotFoundError('Habit');
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
      throw new NotFoundError('Habit');
    }

    // Get logs for range
    const logs = await this.habitRepository.findLogsByRange(
      habitId,
      userId,
      startDate,
      endDate
    );

    // Calculate metrics.
    const completedCount = logs.filter(l => l.status === 'COMPLETED').length;
    const missedCount = logs.filter(l => l.status === 'MISSED').length;
    const skippedCount = logs.filter(l => l.status === 'SKIPPED').length;
    // The denominator is the days the user was actually *asked* about —
    // completed, missed or deliberately skipped. It used to be `logs.length`,
    // which also swept in `PARTIAL` (written by `setLogNote`) and
    // `NOT_APPLICABLE`, so merely adding a note to a day lowered the reported
    // completion rate. This also makes the definition match `getHabitHealth`
    // three methods above, where two rates for the same habit disagreed.
    const totalScheduled = completedCount + missedCount + skippedCount;

    const completionRate = totalScheduled > 0 ? (completedCount / totalScheduled) * 100 : 0;

    // Derived from real completions rather than the never-written
    // `Habit.streakCount` column.
    const completionDates = logs
      .filter(l => l.status === 'COMPLETED')
      .map(l => l.date);
    // `logs` is ordered ascending, so the last row is the most recent day seen.
    const lastLoggedDate = logs.length > 0 ? logs[logs.length - 1]?.date : undefined;
    const streak = deriveHabitStreak(completionDates, lastLoggedDate ?? startDate);

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
      currentStreak: streak.currentStreak,
      longestStreak: Math.max(streak.longestStreak, habit.longestStreak ?? 0),
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
