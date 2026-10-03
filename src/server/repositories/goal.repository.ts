import { GoalStatus } from '@/generated/prisma';
import type { Goal, GoalProgress, Milestone, Prisma, GoalType, GoalPriority } from '@/generated/prisma';
import { NotFoundError } from '@/lib/errors/app-error';
import { BaseRepository } from './base.repository';

/**
 * Goal Repository
 * Database operations for Goal and related models
 */

/**
 * Filter shape accepted by {@link GoalRepository.findAll} and
 * {@link GoalRepository.countAll}. Shared so the two can never disagree about
 * what a listing contains.
 */
export interface GoalListOptions {
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
   * Every goal beneath `goalId` in the sub-goal tree, as a flat id set.
   *
   * Iterative on purpose. A recursive query is not needed here because the tree
   * is walked one level at a time in memory with an `id in (...)` batch, and —
 * *this is the reason it exists* — the walk has a hard depth cap. If bad data
   * ever produced a cycle, an uncapped walk would never terminate and this
   * method would hang the request instead of returning an answer.
   *
   * Depth is capped at 25 levels. `parentGoalId` has no database-level
   * constraint preventing a cycle (see `GoalService.assertNoParentCycle`), so
   * the cap is the backstop for the case where that guard is ever bypassed by a
   * direct repository call.
   */
  async findDescendantIds(goalId: string, userId: string): Promise<string[]> {
    const MAX_DEPTH = 25;
    const seen = new Set<string>();
    let frontier = [goalId];

    try {
      for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
        const rows = await this.prisma.goal.findMany({
          where: { parentGoalId: { in: frontier }, userId },
          select: { id: true },
        });
        frontier = rows.map((r) => r.id).filter((id) => !seen.has(id));
        for (const id of frontier) seen.add(id);
      }
      return [...seen];
    } catch (error) {
      this.handleError(error, 'findDescendantIds');
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
   * Compose the `where` clause for a goal listing.
   *
   * Extracted so {@link countAll} counts exactly what {@link findAll} returns.
   * The two used to be written separately, and when `overdue`/`dueSoon` started
   * overwriting `status` there was no single place that knew both the filter and
   * the count depended on it.
   */
  private buildWhere(userId: string, options: GoalListOptions = {}): Prisma.GoalWhereInput {
    const where: Prisma.GoalWhereInput = { userId };

    if (options.status) {
      where.status = Array.isArray(options.status) ? { in: options.status } : options.status;
    }

    if (options.type) {
      where.type = Array.isArray(options.type) ? { in: options.type } : options.type;
    }

    if (options.priority) {
      where.priority = Array.isArray(options.priority)
        ? { in: options.priority }
        : options.priority;
    }

    if (options.projectId) {
      where.projectId = options.projectId;
    }

    if (options.parentGoalId !== undefined) {
      where.parentGoalId = options.parentGoalId;
    }

    // `overdue` and `dueSoon` are derived *statuses*, so they both pin the
    // status rather than adding to it — a goal that is already COMPLETED cannot
    // be overdue just because its date passed.
    if (options.overdue) {
      where.endDate = { lt: new Date() };
      where.status = GoalStatus.ACTIVE;
    }

    if (options.dueSoon) {
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      where.endDate = { gte: new Date(), lte: sevenDaysFromNow };
      where.status = GoalStatus.ACTIVE;
    }

    if (options.dayTypeId) {
      where.dayTypeAssignments = { some: { dayTypeId: options.dayTypeId } };
    }

    return where;
  }

  /**
   * Find all goals for user
   */
  async findAll(userId: string, options?: GoalListOptions) {
    try {
      const where = this.buildWhere(userId, options);

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
          /*
            Ids and titles only, and capped.

            The drawer needs to *name* a goal's parent and its children for the
            hierarchy to be legible - "part of Marathon" and "3 sub-goals" are
            informative, a count alone is not. This is deliberately not the full
            rows: progress, dates and units for every child would turn a list
            response into the whole goal table, and the drawer links through to
            each child anyway.

            `take: 12` with the count from `_count` alongside, so the drawer can
            say "4 of 12" rather than silently truncating.
          */
          parentGoal: {
            select: { id: true, title: true },
          },
          subGoals: {
            select: {
              id: true,
              title: true,
              status: true,
              currentValue: true,
              targetValue: true,
            },
            orderBy: { endDate: 'asc' },
            take: 12,
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
   * What deleting a goal would actually take with it.
   *
   * `Task.goalId` and `TimeEntry.goalId` are both nullable with **no
   * `onDelete` clause**, so Postgres refuses the delete outright (Prisma P2003)
   * the moment anything references the goal. Every other child — `GoalProgress`,
   * `Milestone`, `GoalTag`, `GoalDayType`, sub-goal parents — cascades.
   *
   * So the loss is asymmetric: progress history, milestones and tags go; tasks
   * and time entries *block* the delete. This counts both halves so the UI can
   * state them before the user commits, rather than surfacing an opaque database
   * error after they have already agreed to something destructive.
   */
async getDeleteImpact(goalId: string, userId: string): Promise<{
    tasks: number;
    timeEntries: number;
    progressLogs: number;
    milestones: number;
    subGoals: number;
    tags: number;
  }> {
    try {
      const [tasks, timeEntries, progressLogs, milestones, subGoals, tags] =
        await Promise.all([
          this.prisma.task.count({ where: { goalId, project: { userId } } }),
          this.prisma.timeEntry.count({ where: { goalId, userId } }),
          this.prisma.goalProgress.count({ where: { goalId } }),
          this.prisma.milestone.count({ where: { goalId } }),
          this.prisma.goal.count({ where: { parentGoalId: goalId, userId } }),
          this.prisma.goalTag.count({ where: { goalId } }),
        ]);

      return { tasks, timeEntries, progressLogs, milestones, subGoals, tags };
    } catch (error) {
      this.handleError(error, 'getDeleteImpact');
    }
  }

  /**
   * Delete a goal, detaching the children that would otherwise block it.
   *
   * `Task.goalId` and `TimeEntry.goalId` have no `onDelete`, so a goal with
   * either attached could not be deleted at all — the request failed with a
   * bare foreign-key violation and the user had no way forward. Adding
   * `onDelete: SetNull` to the schema would express the same intent, but a
   * migration is a heavier instrument than the situation needs, so the detach is
   * done here.
   *
   * Both writes run in **one transaction**: nulling the links and then deleting
   * the goal are a single act. Without it, a failure between the two would leave
   * orphaned tasks pointing at a goal that still exists — worse than the original
   * error, because it is silent.
   *
   * The linked tasks and time entries are **detached, not deleted**. Deleting a
   * commitment the user actually worked on should not destroy the record that
   * they did that work; the caller surfaces the count before confirming.
   *
   * Ownership is re-checked inside the transaction, so the delete cannot be
   * steered onto another user's goal by a raced id.
   */
  async deleteDetaching(goalId: string, userId: string): Promise<void> {
    try {
      await this.transaction(async (tx) => {
        const owned = await tx.goal.findFirst({
          where: { id: goalId, userId },
          select: { id: true },
        });
        if (!owned) {
          throw new NotFoundError('Goal');
        }

        await tx.task.updateMany({
          where: { goalId },
          data: { goalId: null },
        });
        await tx.timeEntry.updateMany({
          where: { goalId },
          data: { goalId: null },
        });

        await tx.goal.delete({ where: { id: goalId } });
      });
    } catch (error) {
      this.handleError(error, 'deleteDetaching');
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
    limit?: number,
    offset?: number
  ): Promise<GoalProgress[]> {
    try {
      return await this.prisma.goalProgress.findMany({
        where: { goalId },
        orderBy: { date: 'desc' },
        take: limit || 100,
        // Previously absent, so `GET /api/goals/[id]/history` accepted an
        // `offset` query parameter and echoed it back in `meta.offset` while
        // returning the same first page for every request. A client paging
        // through a goal's history got one page forever and no error.
        skip: offset || 0,
      });
    } catch (error) {
      this.handleError(error, 'getProgressHistory');
    }
  }

  /**
   * Every progress row for every goal a user owns, inside an instant range.
   *
   * `weeklySummary` used to call `getProgressHistory(goalId, 100)` once per goal
   * to work out each goal's in-week progress delta — one round trip each, pulling
   * up to 100 rows to keep the handful inside one week. One range query replaces
   * all of it.
   *
   * `from`/`to` are **instants**, not calendar days: `GoalProgress.date` is a
   * `DateTime`, so the caller must pass the zoned boundaries
   * (`fromZonedTime('YYYY-MM-DDT00:00:00', tz)` and friends). Passing date strings
   * here would let Prisma coerce them to UTC midnight and quietly shift which
   * check-ins land in the week for any user not on UTC.
   */
  async findProgressByUserRange(
    userId: string,
    from: Date,
    to: Date
  ): Promise<GoalProgress[]> {
    try {
      return await this.prisma.goalProgress.findMany({
        where: {
          goal: { userId },
          date: { gte: from, lte: to },
        },
        orderBy: { date: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findProgressByUserRange');
    }
  }

  /**
   * Delete every progress log a goal recorded on one calendar day.
   *
   * `GoalProgress` carries only `@@index([goalId, date])` — no uniqueness on the
   * pair — so a day can hold several rows (a check-in and its undo, or several
   * deltas). "Not done on this day" therefore has to mean *no rows at all*, which
   * only a delete can guarantee. The previous implementation wrote a `0` row to
   * undo a check-in, so the day summed to 1 and the goal still read as done.
   *
   * `dayStart` must be the UTC midnight of the day; the window is half-open.
   */
  async deleteProgressLogsForDate(
    goalId: string,
    dayStart: Date
  ): Promise<number> {
    try {
      const end = new Date(dayStart);
      end.setUTCDate(end.getUTCDate() + 1);

      const result = await this.prisma.goalProgress.deleteMany({
        where: { goalId, date: { gte: dayStart, lt: end } },
      });

      return result.count;
    } catch (error) {
      this.handleError(error, 'deleteProgressLogsForDate');
    }
  }

  /**
   * Every progress log a user's goals recorded in a calendar-day range.
   *
   * Backs the consistency heat-strips and streaks on `/goals`. One query for the
   * whole page: the strips need 30 days across *every* goal, and reading them
   * per goal through `getProgressHistory` was one request per row — 15 goals was
   * 15 round trips to draw a grid of squares.
   *
   * `from` is inclusive, `to` exclusive, both as UTC midnights.
   */
  async findProgressLogsInRange(
    userId: string,
    from: Date,
    to: Date
  ): Promise<Array<Pick<GoalProgress, 'goalId' | 'value' | 'date' | 'note'>>> {
    try {
      return await this.prisma.goalProgress.findMany({
        where: {
          goal: { userId },
          date: { gte: from, lt: to },
        },
        select: { goalId: true, value: true, date: true, note: true },
        orderBy: { date: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findProgressLogsInRange');
    }
  }

  /**
   * Total rows matching the same filter {@link findAll} applies, ignoring
   * pagination.
   *
   * `meta.total` on `GET /api/goals` was `goals.length`, i.e. the length of the
   * page that happened to be returned. A client paging with `offset` could not
   * tell "that was the last page" from "there are more", so `/goals` rendered
   * whatever the first 50 rows held and silently dropped the rest.
   */
  async countAll(userId: string, options: Parameters<GoalRepository['findAll']>[1] = {}) {
    try {
      return await this.prisma.goal.count({ where: this.buildWhere(userId, options) });
    } catch (error) {
      this.handleError(error, 'countAll');
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
   *
   * `GoalDayType.userId` is denormalised — it duplicates the goal's owner rather
   * than being derivable from the relation — and it was previously written from
   * the *caller's* id with no check that the day types being referenced are
   * theirs. So a crafted `dayTypeIds` could write join rows stamped with one
   * user's id pointing at another user's `DayTypeDefinition`.
   *
   * The day types are now verified before anything is written, and an id the
   * caller does not own aborts the whole set rather than being skipped: a partial
   * write here leaves a goal scoped to a nonsense subset of day types with no
   * error anywhere.
   */
  async addDayTypeAssignments(
    goalId: string,
    userId: string,
    dayTypeIds: string[]
  ): Promise<void> {
    if (dayTypeIds.length === 0) return;

    // De-duplicate: the schema allows repeats, and a repeated id would otherwise
    // make the count below disagree with the input.
    const unique = [...new Set(dayTypeIds)];

    try {
      const owned = await this.prisma.dayTypeDefinition.findMany({
        where: { id: { in: unique }, userId },
        select: { id: true },
      });
      const ownedIds = new Set(owned.map((row) => row.id));

      const foreign = unique.filter((id) => !ownedIds.has(id));
      if (foreign.length > 0) {
        throw new NotFoundError(`DayType ${foreign[0]}`);
      }

      await this.prisma.goalDayType.createMany({
        data: unique.map((dayTypeId) => ({ goalId, dayTypeId, userId })),
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
   * Create many milestones at once, for one goal.
   *
   * Used by carry-over, which copies a goal's whole plan into the new period.
   * A loop of `createMilestone` would issue one INSERT per step — six round
   * trips to duplicate six rows — and would leave a half-copied goal behind if
   * the fourth insert failed.
   */
  async createMilestones(
    rows: Array<{
      goalId: string;
      title: string;
      description?: string | null;
      targetValue?: number | null;
      dueDate?: Date | null;
      sortOrder: number;
    }>
  ): Promise<number> {
    if (rows.length === 0) return 0;
    try {
      const result = await this.prisma.milestone.createMany({ data: rows });
      return result.count;
    } catch (error) {
      this.handleError(error, 'createMilestones');
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
   * Set a milestone's completion timestamp, or clear it.
   *
   * `null` reopens a completed milestone. That is why this takes a value rather
   * than being `completeMilestone`: a completion marker you can set but never
   * unset is a one-way door, and a user who ticks the wrong checkbox has no way
   * back short of deleting and re-creating the milestone.
   *
   * Ownership is **not** checked here — there is no `userId` to check against on
   * this model. `GoalService.setMilestoneComplete` and `deleteMilestone` verify
   * the goal and the milestone's membership of that goal first; that gate is the
   * reason these two methods are safe to expose.
   */
  async setMilestoneCompleted(
    milestoneId: string,
    completedAt: Date | null
  ): Promise<Milestone> {
    try {
      return await this.prisma.milestone.update({
        where: { id: milestoneId },
        data: { completedAt },
      });
    } catch (error) {
      this.handleError(error, 'setMilestoneCompleted');
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
