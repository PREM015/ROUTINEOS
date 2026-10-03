import type { GoalPriority, GoalStatus, GoalType, Prisma } from '@/generated/prisma';
import { GoalRepository } from '@/server/repositories/goal.repository';
import { TagRepository } from '@/server/repositories/tag.repository';
import { ProjectRepository } from '@/server/repositories/project.repository';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import type { CreateGoalInput, UpdateGoalInput } from '@/types/goal';
import type { milestoneSchema } from '@/schemas/project.schema';
import type { GoalCheckinInput } from '@/schemas/goal.schema';
import { AchievementService } from './achievement.service';
import { AuditService } from '@/server/audit/audit.service';
import { resolveDayTypeForDate } from '@/lib/scheduling/resolve-routine';
import type { UserId } from '@/types/ids';

/** Input for {@link GoalService.addMilestone}, inferred from the shared schema. */
type MilestoneInput = import('zod').infer<typeof milestoneSchema>;

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
  /**
   * Injected so `setTags` can validate tag ownership. It is a repository rather
   * than `TagService` because goal/tag assignment is a write concern, and
   * `TagService` has no method that answers "which of these ids are mine?".
   */
  private tagRepository: TagRepository;
  /**
   * Injected so goal↔project linking can be ownership-checked on the project side.
   */
  private projectRepository: ProjectRepository;

  constructor(
    goalRepository: GoalRepository = new GoalRepository(),
    tagRepository: TagRepository = new TagRepository(),
    projectRepository: ProjectRepository = new ProjectRepository()
  ) {
    this.goalRepository = goalRepository;
    this.tagRepository = tagRepository;
    this.projectRepository = projectRepository;
  }

  /**
   * List goals for a user.
   *
   * Owns the filter composition so every caller (the API route, and any future
   * consumer) gets identical filtering instead of each re-deriving it.
   */
  async listGoals(userId: UserId, filters: ListGoalsFilters = {}) {
    return this.goalRepository.findAll(userId, filters);
  }

  /**
   * How many goals match a filter, ignoring pagination.
   *
   * Exists so a listing can say how many rows there *are*. `GET /api/goals`
   * previously returned `meta.total = goals.length`, i.e. the length of the page
   * that happened to come back — so a client paging with `offset` could not
   * distinguish "that was the last page" from "there are more", and every goal
   * past 50 was invisible with no error anywhere.
   *
   * Takes the same {@link ListGoalsFilters} as {@link listGoals}, minus
   * pagination, and composes the identical `where` clause in the repository, so
   * the total cannot describe a different result set than the rows beside it.
   */
  async countGoals(userId: UserId, filters: ListGoalsFilters = {}) {
    const { limit: _limit, offset: _offset, sortBy: _sortBy, sortOrder: _sortOrder, ...where } = filters;
    return this.goalRepository.countAll(userId, where);
  }

/**
 * Progress-log rows recorded on a given calendar date, with their goals.
 */
  async getProgressLogsForDate(userId: UserId, date: string) {
    return this.goalRepository.findProgressLogsByDate(userId, date);
  }

  /**
 * Every progress row across the caller's goals in a calendar-day range.
   *
   * Backs `/goals`' consistency heat-strips and streaks. The strips are 30 days
   * wide and there is one per goal, so reading them through `getHistory` was
   * one HTTP request per goal to draw a grid of squares — fifteen goals meant
   * fifteen round trips before a single pixel was on screen. This is one query.
   *
   * `from` is inclusive and `to` exclusive, both `YYYY-MM-DD` labels, so a
   * 30-day strip is `[today - 29, tomorrow)`.
   */
  async getProgressRange(userId: UserId, from: string, to: string) {
    return this.goalRepository.findProgressLogsInRange(
      userId,
      new Date(`${from}T00:00:00.000Z`),
      new Date(`${to}T00:00:00.000Z`)
    );
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
  async getVisibleGoalsForDate(userId: UserId, date: string) {
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
  async archiveGoal(userId: UserId, goalId: string) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new NotFoundError('Goal');
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
  async createGoal(userId: UserId, input: CreateGoalInput) {
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

    if (input.parentGoalId) {
      // A new goal is a leaf, so it cannot be its own ancestor and cannot
      // introduce a cycle. Ownership is still checked: `parentGoalId` is a
      // client-supplied cuid, and connecting it unverified would let a caller
      // graft their goal onto somebody else's tree.
      const parent = await this.goalRepository.findById(input.parentGoalId, userId);
      if (!parent) {
        throw new NotFoundError('Parent goal');
      }
      if (parent.status === 'COMPLETED' || parent.status === 'CANCELLED') {
        throw new ValidationError(
          'A completed or archived goal cannot have new sub-goals'
        );
      }
    }

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
  async updateGoal(userId: UserId, goalId: string, input: UpdateGoalInput) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new NotFoundError('Goal');
    }

    if (input.parentGoalId !== undefined) {
      await this.assertValidParent(userId, goalId, input.parentGoalId ?? null);
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
        /*
          `archivedAt` and `completedAt` are each derived from the status, and
          both must be cleared symmetrically.

          `archivedAt` was already handled here, `completedAt` was not — so
          moving a goal from `COMPLETED` back to `ACTIVE` left `completedAt` set
          on a goal that was visibly active again. Anything reading that column as
          "was this finished" (`isOverdue` in the old analytics, the recap) then
          disagreed with the status it was supposed to follow.
        */
        ...(input.status === 'CANCELLED'
          ? { archivedAt: new Date() }
          : { archivedAt: null }),
        ...(input.status === 'COMPLETED'
          ? { completedAt: new Date() }
          : { completedAt: null }),
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
      /*
        Re-parenting. `updateGoalSchema` has always accepted `parentGoalId` and
        this branch is the first thing that actually reads it - so a client that
        sent it was getting a 200 and no change, the same silent-failure shape as
        the missing `status`.

        `null` detaches, so "promote this to a top-level goal" is representable.
      */
      ...(input.parentGoalId !== undefined && {
        parentGoal: input.parentGoalId
          ? { connect: { id: input.parentGoalId } }
          : { disconnect: true },
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
 * Record progress against a goal.
 *
 * ## `mode` decides what `value` means
 *
 * The endpoint previously always treated `value` as a **delta** and added it to
 * `currentValue`. That is right for "I ran 5 km" and catastrophic for "I have
 * done 42 of 100", which silently became 147. Callers had no way to say which
 * they meant, so the slider on `/goals` — which wanted an absolute set — was
 * routed around this endpoint entirely and PATCHed `currentValue` directly
 * instead, leaving **no `GoalProgress` row at all**. Every streak, sparkline and
 * projection computed from the log was therefore blind to it.
 *
 * `mode` makes the distinction explicit:
 *
 * - `'delta'` (default, and the only behaviour before this change) — `value` is
 *   added to `currentValue`.
 * - `'set'` — `currentValue` becomes `value` outright.
 *
 * Either way a `GoalProgress` row is written, so the log is a complete record of
 * what happened to the goal. In `'set'` mode the row stores the *change* rather
 * than the new total, so summing a day's rows still reconstructs the same
 * running total — see `netProgressByDay` in `lib/goals/goal-metrics.ts`.
 *
 * `autoComplete` still promotes the goal to `COMPLETED` once the target is
 * reached, and that is now the *only* path that can complete a goal. A daily
 * check-in cannot reach it.
 */
  async updateProgress(
    userId: UserId,
    goalId: string,
    value: number,
    note?: string,
    autoComplete: boolean = true,
    mode: 'delta' | 'set' = 'delta'
  ) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new NotFoundError('Goal');
    }

    if (!Number.isFinite(value)) {
      throw new ValidationError('Progress value must be a finite number');
    }

    if (mode === 'set' && value < 0) {
      throw new ValidationError('Progress value cannot be negative');
    }

    const newValue =
      mode === 'set' ? value : Math.max(0, goal.currentValue + value);

    // The log records the movement, so summing a day's rows reconstructs the
    // running total regardless of which mode wrote them.
    const delta = newValue - goal.currentValue;

    if (delta !== 0) {
      await this.goalRepository.addProgressLog({
        goal: { connect: { id: goalId } },
        value: delta,
        note,
        date: new Date(),
      } as Prisma.GoalProgressCreateInput);
    }

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
  async completeGoal(userId: UserId, goalId: string, finalValue?: number) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new NotFoundError('Goal');
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
    userId: UserId,
    goalId: string,
    newEndDate: Date,
    adjustProgress: boolean = false
  ) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new NotFoundError('Goal');
    }

    // Mark original as carried over
    await this.goalRepository.update(goalId, userId, {
      status: 'CARRIED_OVER',
    });

    /*
      Milestones are copied to the new goal, and this is load-bearing rather than
      a nicety.

      A carry-over exists because a deadline passed with the goal unfinished, not
      because the goal was wrong. The milestones *are* the plan - "draft the
      proposal", "review with Dana", "ship" - and they are almost always still
      open, because if they were done the goal would be done. Creating the new
      goal without them produced a bare `0 / 100` with no steps, which is exactly
      the goal-shaped thing that gets abandoned again.

      Copied as *open* milestones regardless of their completion state: a goal
      carried over for being late should not carry a pre-ticked final step into
      the new period.
    */
    const milestones = await this.goalRepository.getMilestones(goalId);

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

    // Nested create rather than a follow-up `createMany`: the milestones have to
    // belong to the new goal's row, which does not exist until the goal does.
    // `sortOrder` is carried over so the sequence the user arranged survives.
    if (milestones.length > 0) {
      await this.goalRepository.createMilestones(
        milestones.map((m) => ({
          goalId: newGoal.id,
          title: m.title,
          description: m.description,
          targetValue: m.targetValue,
          dueDate: m.dueDate,
          sortOrder: m.sortOrder,
        }))
      );
    }

    return this.goalRepository.findWithRelations(newGoal.id, userId);
  }

  /**
   * Reject a re-parent that would make the sub-goal tree cyclic.
   *
   * ## Why this is needed rather than left to the UI
   *
   * `Goal.parentGoalId` is a self-relation with `onDelete: SetNull`. Postgres
   * will happily store `A -> B -> C -> A`, and there is no constraint that
   * prevents it. A cycle is not a cosmetic problem:
   *
   * - `findDescendantIds` walks the tree to answer "what breaks if this parent
   *   goes away" — it would loop forever.
   * - Any recursive render of the hierarchy loops forever, in the browser, not
   *   the server. That is a hang the user cannot escape and a support ticket
   *   that looks like nothing at all.
   *
   * So the rule is enforced in the service, where both the ownership check and
   * the shape check live together. A client-side dropdown filter is a
   * convenience; it is not the guarantee.
   *
   * Two distinct rejections, checked in this order:
   * 1. the new parent must exist and belong to the caller;
   * 2. the new parent must not be the goal itself or one of its descendants.
   */
  private async assertValidParent(
    userId: UserId,
    goalId: string,
    parentGoalId: string | null
  ): Promise<void> {
    // `null` is a detach, which cannot make a cycle.
    if (parentGoalId === null) return;

    if (parentGoalId === goalId) {
      throw new ValidationError('A goal cannot be its own parent');
    }

    const parent = await this.goalRepository.findById(parentGoalId, userId);
    if (!parent) {
      throw new NotFoundError('Parent goal');
    }

    const descendants = await this.goalRepository.findDescendantIds(goalId, userId);
    if (descendants.includes(parentGoalId)) {
      throw new ValidationError(
        'That would make the goal its own ancestor — a goal cannot sit above its own sub-goal'
      );
    }
  }

  /**
   * A single goal with its relations, or `null`.
   *
   * Returns `null` rather than throwing, so a route can distinguish "not found"
   * (404) from a genuine failure (500) without the repository call escaping into
   * the handler.
   */
  async getGoal(userId: UserId, goalId: string) {
    return this.goalRepository.findWithRelations(goalId, userId);
  }

  /**
   * Per-day check-off for a DAILY goal.
   *
   * ## A daily goal is ACTIVE for its whole window
   *
   * This used to write `status: 'COMPLETED'` on check-in, which was wrong in
   * three separate ways:
   *
   * 1. `COMPLETED` is terminal in `GOAL_STATUS_CONFIG`, so ticking "Morning
   *    read" on Tuesday removed it from `findActiveInDateWindow` — and therefore
   *    from `/api/goals/today` — for the rest of the year. A daily goal is not
   *    finished on day one; it is finished when its window closes.
   * 2. It flipped the goal back to `ACTIVE` on the next check-out, so the status
   *    tracked "was the last interaction a tick" rather than any real state.
   * 3. It moved the goal out of every `ACTIVE`-scoped query the moment it was
   *    ticked, so the goal silently vanished from the list it was ticked in.
   *
   * "Done today" is now exactly what it says: a `GoalProgress` row exists for
   * today. `currentValue` mirrors that 1/0 as a convenience for the existing
   * widgets, but no consumer is allowed to treat it as the source of truth for
   * "done today" — {@link getProgressLogsForDate} is.
   *
   * ## Undo removes the row rather than writing a zero
   *
   * `GoalProgress` has no `@@unique([goalId, date])`, so a previous undo
   * implementation that appended `value: 0` left the day's rows summing to 1.
   * Every "was it done?" question then answered yes: the goal read as ticked
   * after being unticked, and the toggle inverted its own meaning. An undo is
   * now the absence of a row, which is the only representation that survives
   * being read twice.
   *
   * The date is anchored to midnight UTC rather than parsed as a local time,
   * because it is a calendar label — the goal's day-type and timezone handling
   * happens elsewhere, on the user's zone.
   */
  async checkInDaily(userId: UserId, goalId: string, input: GoalCheckinInput) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new NotFoundError('Goal');
    }

    if (goal.type !== 'DAILY') {
      throw new ValidationError(
        'Daily check-in is only available for DAILY goals'
      );
    }

    const { date, completed } = input;
    const dayStart = new Date(`${date}T00:00:00.000Z`);

    if (!completed) {
      await this.goalRepository.deleteProgressLogsForDate(goalId, dayStart);
      // Mirrors the row's absence so widgets reading `currentValue` agree. The
      // goal stays ACTIVE either way; a check-out never re-opens a goal.
      return this.goalRepository.update(goalId, userId, {
        currentValue: 0,
      });
    }

    await this.goalRepository.addProgressLog({
      goal: { connect: { id: goalId } },
      value: 1,
      note: 'daily-checkin',
      date: dayStart,
    });

    return this.goalRepository.update(goalId, userId, {
      currentValue: 1,
    });
  }

  /**
   * Tags attached to a goal the caller owns.
   */
  async getTags(userId: UserId, goalId: string) {
    const goal = await this.goalRepository.findWithRelations(goalId, userId);
    if (!goal) {
      throw new NotFoundError('Goal');
    }
    return goal.tags;
  }

  /**
   * Replace the full tag set on a goal the caller owns.
   *
   * Every requested tag is verified as belonging to the caller before anything is
   * written, so the goal is never left half-updated against a bad id. That
   * validation used to be one `findById` **per tag** in the route; it is now a
   * single `listForUser` and a set lookup, which matters because this endpoint
   * accepts up to 50 tags and was issuing up to 50 queries to check them.
   */
  async setTags(userId: UserId, goalId: string, requestedTagIds: string[]) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new NotFoundError('Goal');
    }

    // De-duplicated: the schema allows repeats and a repeated id would otherwise
    // create the same join row twice.
    const tagIds = [...new Set(requestedTagIds)];

    const owned = new Set(
      (await this.tagRepository.listForUser(userId)).map((tag) => tag.id)
    );
    const missing = tagIds.find((tagId) => !owned.has(tagId));
    if (missing) {
      throw new NotFoundError(`Tag ${missing}`);
    }

    await this.goalRepository.update(goalId, userId, {
      tags: {
        deleteMany: {},
        create: tagIds.map((tagId) => ({ tagId })),
      },
    } as Prisma.GoalUpdateInput);

    const updated = await this.goalRepository.findWithRelations(goalId, userId);
    return updated?.tags ?? [];
  }

  /**
   * Goals attached to a project the caller owns.
   */
  async getProjectGoals(userId: UserId, projectId: string) {
    const project = await this.projectRepository.findById(userId, projectId);
    if (!project) {
      throw new NotFoundError('Project');
    }
    return this.projectRepository.getGoals(userId, projectId);
  }

  /**
   * Attach one of the caller's goals to one of their projects.
   *
   * Both sides are ownership-checked before the link is written. The previous
   * implementation reached into `GoalRepository` from the route to do the
   * `project: { connect }` write, which is a goal update performed outside the
   * goal service — the one place that decides what a goal update may change.
   */
  async attachToProject(
    userId: UserId,
    projectId: string,
    goalId: string
  ) {
    const project = await this.projectRepository.findById(userId, projectId);
    if (!project) {
      throw new NotFoundError('Project');
    }

    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new NotFoundError('Goal');
    }

    await this.goalRepository.update(goalId, userId, {
      project: { connect: { id: projectId } },
    } as Prisma.GoalUpdateInput);

    return this.projectRepository.getGoals(userId, projectId);
  }

  /**
   * Progress history for a goal the caller owns.
   *
   * Returns the goal's title alongside the rows because the history header shows
   * it, and doing the ownership lookup here means the caller gets the 404 before
   * any history is read.
   */
  async getHistory(userId: UserId, goalId: string, limit: number, offset: number) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new NotFoundError('Goal');
    }

    const history = await this.goalRepository.getProgressHistory(goalId, limit, offset);
    return { history, goalTitle: goal.title };
  }

  /**
   * Milestones for a goal the caller owns.
   *
   * The ownership check is here rather than in the route because `getMilestones`
   * is **not** scoped by user — it takes only a goal id. Calling it directly
   * would return another user's milestones, so the goal lookup that gates it has
   * to be part of the same method or a future caller will skip it.
   */
  async getMilestones(userId: UserId, goalId: string) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new NotFoundError('Goal');
    }
    return this.goalRepository.getMilestones(goalId);
  }

  /**
   * Append a milestone to a goal the caller owns.
   *
   * `sortOrder` is the current milestone count, so milestones render in creation
   * order without the client having to compute a position. This is a read-then-
   * write, so it lives here where the ordering rule is visible; a caller that
   * skipped the read would append a milestone at position 0.
   */
  async addMilestone(userId: UserId, goalId: string, input: MilestoneInput) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new NotFoundError('Goal');
    }

    const existing = await this.goalRepository.getMilestones(goalId);

    return this.goalRepository.createMilestone({
      goal: { connect: { id: goalId } },
      title: input.title,
      description: input.description,
      targetValue: input.targetValue,
      dueDate: input.dueDate,
      sortOrder: existing.length,
    } as Prisma.MilestoneCreateInput);
  }

  /**
   * Mark one of the caller's milestones complete, or reopen it.
   *
   * ## Why this exists rather than a route calling the repository
   *
   * `GoalRepository.completeMilestone` and `deleteMilestone` take **only a
   * milestone id** — no `userId`, no ownership check. They are the two
   * repository methods in this file that could be pointed at another user's row,
   * and they had no callers at all, which is the only reason that was safe.
   *
   * Wiring them to a route directly is what would make it unsafe: a caller could
   * pass any milestone id and have it written. So the ownership gate travels
   * with the milestone id — the goal is loaded first, scoped to the caller, and
   * the milestone is then verified to actually belong to *that* goal rather than
   * merely sharing the table.
   */
  async setMilestoneComplete(
    userId: UserId,
    goalId: string,
    milestoneId: string,
    completed: boolean
  ) {
    await this.assertMilestoneOwned(userId, goalId, milestoneId);

    return this.goalRepository.setMilestoneCompleted(
      milestoneId,
      completed ? new Date() : null
    );
  }

  /** Delete one of the caller's milestones. Same ownership gate as above. */
  async deleteMilestone(userId: UserId, goalId: string, milestoneId: string) {
    await this.assertMilestoneOwned(userId, goalId, milestoneId);
    return this.goalRepository.deleteMilestone(milestoneId);
  }

  /**
   * Assert the goal belongs to the caller **and** the milestone belongs to that
   * goal. Both, because the first alone would let a caller name a milestone under
   * their own goal and act on someone else's id.
   */
  private async assertMilestoneOwned(
    userId: UserId,
    goalId: string,
    milestoneId: string
  ): Promise<void> {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new NotFoundError('Goal');
    }

    const milestones = await this.goalRepository.getMilestones(goalId);
    if (!milestones.some((m) => m.id === milestoneId)) {
      throw new NotFoundError('Milestone');
    }
  }

/**
   * Delete a goal, and say what it costs first.
   *
   * The delete used to fail outright for any goal with a linked task or time
   * entry: both `Task.goalId` and `TimeEntry.goalId` are nullable with no
   * `onDelete`, so Postgres raised a foreign-key violation (Prisma P2003) that
   * surfaced as an opaque banner. The user had agreed to something destructive
   * and was then told nothing useful.
   *
   * Two things changed:
   *
   * 1. {@link getDeleteImpact} reports the split, so the confirmation can name
   *    what is destroyed (progress history, milestones, tags) and what is merely
   *    unlinked (tasks, time entries). Those are very different operations and
   *    the user is entitled to know which one they are choosing.
   * 2. {@link deleteGoal} now detaches the blocking rows inside one transaction
   *    rather than aborting. Tasks survive; only their link is cleared.
   *
   * Archive remains the safe default offered first — this method is the
   * deliberate, informed choice.
   */
  async getDeleteImpact(userId: UserId, goalId: string) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new NotFoundError('Goal');
    }

    const impact = await this.goalRepository.getDeleteImpact(goalId, userId);

    return {
      goalId,
      title: goal.title,
      ...impact,
      /** True when the delete would fail without the detach step. */
      hasBlockingLinks: impact.tasks > 0 || impact.timeEntries > 0,
    };
  }

  async deleteGoal(userId: UserId, goalId: string) {
    const goal = await this.goalRepository.findById(goalId, userId);
    if (!goal) {
      throw new NotFoundError('Goal');
    }

    await this.goalRepository.deleteDetaching(goalId, userId);

    /*
      The audit row this used to skip.

      `deleteGoal` is the most destructive write in the goals domain and it wrote
      nothing, while `ProjectService` and `TaskService` logged the same class of
      event — so goal deletion was not merely over-counted in any `GOAL_*` query,
      it was *under*-counted for this one action. That is the worse direction: a
      trail that silently omits the destructive event is not a trail.

      Fire-and-forget, and deliberately non-throwing: the goal is already gone by
      the time this runs, so failing the request because the audit insert failed
      would report a delete that did not happen. `AuditService.log` swallows its
      own errors for the same reason.
    */
    void new AuditService()
      .log({
        userId,
        action: 'GOAL_DELETED',
        entityType: 'GOAL',
        entityId: goalId,
        metadata: { title: goal.title, type: goal.type },
      })
      .catch((err) => {
        console.error('Failed to audit goal deletion:', err);
      });
  }

  /**
   * Cancel a goal without deleting anything.
   *
   * `Goals` has no `ARCHIVED` status, so archiving means `CANCELLED` plus an
   * `archivedAt` stamp — which is what {@link archiveGoal} does. It is exposed
   * on its own route because it is the action the UI should offer *before*
   * delete: it keeps the whole progress history and reverses in one click.
   */
  async cancelGoal(userId: UserId, goalId: string) {
    return this.archiveGoal(userId, goalId);
  }
}
