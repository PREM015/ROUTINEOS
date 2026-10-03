import type { FocusSession, FocusSessionType, FocusSessionEndReason, FocusSessionSource, Break, BreakType, Prisma } from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import { FOCUS_TIME_TYPES } from '@/lib/focus/type-backfill';
import { FOCUS_METRIC_DEFAULTS } from '@/lib/focus/metrics';
import type { UserId } from '@/types/ids';

/**
 * Focus Repository
 * Database operations for FocusSession and Break models
 */

type DateFilter = Date | string;

/**
 * Only these types count as focus time.
 *
 * Re-exported as a Prisma-ready `in` filter so every aggregate in this file
 * shares one definition. Breaks are excluded deliberately: before the `type`
 * column existed, `getStats` filtered on `completedAt != null` alone and the
 * timer wrote a *completed* row for every short and long break, so a 5-minute
 * break was added to every "focus minutes" total in the product.
 */
const FOCUS_TIME_TYPE_FILTER = {
  type: { in: [...FOCUS_TIME_TYPES] },
} satisfies Prisma.FocusSessionWhereInput;

interface CreateFocusSessionData {
  title: string;
  type?: FocusSessionType;
  description?: string;
  categoryId?: string;
  plannedDuration: number;
  actualDuration?: number;
  techniques?: string[];
  energyBefore?: number;
  startedAt?: Date;
  completedAt?: Date;
  /**
   * When the user stopped, skipped or switched mode before the timebox ran out.
   *
   * This field is the *reason* the original bug was possible: the service built
   * it, but the interface here had no such member, so TypeScript accepted the
   * object and Prisma silently wrote nothing. A stopped session then had
   * `completedAt: null, abortedAt: null` — the exact shape
   * `findActiveByUserId` reads as "currently running" — so the app reported it as
   * live forever. Declaring it is the fix; the whole `data` object below is now
   * explicitly typed against this interface so a future field cannot be dropped
   * the same way again.
   */
  abortedAt?: Date | null;
  pausedAt?: Date | null;
  pausedTotalSeconds?: number;
  /** Idempotency key for the offline-replay and double-click paths. */
  clientId?: string | null;
  /** Set at Start so recovery has presence evidence to reason about. */
  lastHeartbeatAt?: Date | null;
  runId?: string | null;
  cycleIndex?: number | null;
  taskId?: string | null;
  goalId?: string | null;
  habitId?: string | null;
  routineBlockId?: string | null;
  /**
   * The user's zone at Start, snapshotted so history does not re-bucket if they
   * later move timezone.
   */
  timezone?: string | null;
  /** `startedAt` as a calendar date in `timezone`. */
  localDate?: Date | null;
}

interface CompleteFocusSessionData {
  actualDuration?: number;
  focusRating?: number;
  productivityRating?: number;
  difficultyRating?: number;
  energyAfter?: number;
  distractions?: string[];
  techniques?: string[];
  notes?: string;
}

interface FocusSessionQueryParams {
  from?: DateFilter;
  to?: DateFilter;
  limit?: number;
  offset?: number;
  /**
   * Stored session type, or one of the *derived* statuses.
   *
   * The derived names are translated into SQL below rather than filtered in JS,
   * because `getFocusSessionStatus` is a function of three nullable columns and
   * expressing it in a `where` clause is what makes `meta.total` correct: the old
   * implementation filtered the already-paginated page, so the total described
   * one page of at most 100 rows, not the result set.
   */
  status?: 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'ABORTED' | 'ACTIVE';
  type?: FocusSessionType;
}

export interface FocusStats {
  totalSessions: number;
  totalFocusMinutes: number;
  averageSessionMinutes: number;
  bestSessionFocusMinutes: number;
}

interface FocusSessionUpdateData {
  title?: string;
  description?: string;
  categoryId?: string | null;
  plannedDuration?: number;
  notes?: string;
}

interface CreateBreakData {
  focusSessionId?: string;
  startedAt?: Date;
  endedAt?: Date;
  durationMinutes?: number;
  /** Closed union, matching `Break.breakType` now that it is an enum. */
  breakType?: BreakType | null;
  quality?: number;
  notes?: string;
}

function toFocusDate(value?: DateFilter): Date | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? new Date(value) : value;
}

export class FocusRepository extends BaseRepository {
  /**
   * Create a focus session
   *
   * The Prisma `data` object is declared as `Prisma.FocusSessionUncheckedCreateInput`
   * so that a field the caller supplies but this method forgets to write is a
   * *type* problem at the call site rather than a silent no-op at runtime. The
   * original method spread a loosely-typed object and omitted `abortedAt`
   * entirely; `CreateFocusSessionData` had no such member, so the service's
   * `abortedAt: new Date()` was accepted by the compiler and thrown away.
   */
  async createSession(
    userId: UserId,
    data: CreateFocusSessionData
  ): Promise<FocusSession> {
    try {
      const row: Prisma.FocusSessionUncheckedCreateInput = {
        userId,
        title: data.title,
        type: data.type,
        description: data.description,
        plannedDuration: data.plannedDuration,
        actualDuration: data.actualDuration,
        startedAt: data.startedAt || new Date(),
        completedAt: data.completedAt,
        abortedAt: data.abortedAt,
        pausedAt: data.pausedAt,
        pausedTotalSeconds: data.pausedTotalSeconds,
        clientId: data.clientId,
        runId: data.runId,
        cycleIndex: data.cycleIndex,
        taskId: data.taskId,
        goalId: data.goalId,
        habitId: data.habitId,
        routineBlockId: data.routineBlockId,
        timezone: data.timezone,
        localDate: data.localDate,
        lastHeartbeatAt: data.lastHeartbeatAt,
        energyBefore: data.energyBefore,
        techniques: data.techniques ? JSON.stringify(data.techniques) : undefined,
        // The scalar, not `category: { connect: … }`: `UncheckedCreateInput`
        // takes foreign keys directly. Mixing the two is the one thing that
        // would make this object un-typeable and lose the guarantee above.
        categoryId: data.categoryId,
      };
      return await this.prisma.focusSession.create({ data: row });
    } catch (error) {
      this.handleError(error, 'createSession');
    }
  }

  /**
   * Settle a row, but only while it still looks active.
   *
   * Returns the number of rows claimed, so a caller on a read path can tell
   * whether it won the race. `updateMany` with the active predicate in its
   * `where` makes the claim atomic — this is a compare-and-set, not a
   * read-then-write, which is what stops two tabs opening simultaneously from
   * both applying an `auto-complete` and the second overwriting the first's
   * `actualDuration`.
   */
  async applyTransitionWhereActive(
    sessionId: string,
    patch: {
      actualDuration: number;
      endReason: FocusSessionEndReason;
      source: FocusSessionSource;
      endedAt: Date;
      completed: boolean;
    }
  ): Promise<number> {
    try {
      const result = await this.prisma.focusSession.updateMany({
        where: { id: sessionId, completedAt: null, abortedAt: null },
        data: {
          actualDuration: patch.actualDuration,
          endReason: patch.endReason,
          source: patch.source,
          ...(patch.completed
            ? { completedAt: patch.endedAt, abortedAt: null }
            : { abortedAt: patch.endedAt, completedAt: null }),
        },
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'applyTransitionWhereActive');
    }
  }

  /**
   * Find a session by its client-generated idempotency key.
   *
   * The replay path: an offline outbox re-sending a Start must not create a second
   * row, and this is the lookup that makes that true without the client having to
   * deduplicate its own queue.
   */
  async findByClientId(userId: UserId, clientId: string): Promise<FocusSession | null> {
    try {
      return await this.prisma.focusSession.findFirst({
        where: { userId, clientId },
      });
    } catch (error) {
      this.handleError(error, 'findByClientId');
    }
  }

  /**
   * Assert a batch of linked entities belongs to `userId`.
   *
   * One round trip for up to four links, because a Start writes all of them at
   * once. Each is checked because every link is `onDelete: SetNull` — which guards
   * against deletion, not against a foreign id — so an unchecked write would
   * attach the session to somebody else's task and quietly corrupt their
   * roll-ups.
   */
  async assertLinksOwned(
    userId: UserId,
    links: { taskId?: string; goalId?: string; habitId?: string; routineBlockId?: string }
  ): Promise<void> {
    const checks: Array<{ label: string; id: string }> = [];
    if (links.taskId) checks.push({ label: 'Task', id: links.taskId });
    if (links.goalId) checks.push({ label: 'Goal', id: links.goalId });
    if (links.habitId) checks.push({ label: 'Habit', id: links.habitId });
    if (links.routineBlockId) checks.push({ label: 'Routine block', id: links.routineBlockId });
    if (checks.length === 0) return;

    try {
      const [tasks, goals, habits, blocks] = await Promise.all([
        links.taskId
          ? this.prisma.task.findFirst({ where: { id: links.taskId, userId }, select: { id: true } })
          : null,
        links.goalId
          ? this.prisma.goal.findFirst({ where: { id: links.goalId, userId }, select: { id: true } })
          : null,
        links.habitId
          ? this.prisma.habit.findFirst({ where: { id: links.habitId, userId }, select: { id: true } })
          : null,
        links.routineBlockId
          ? this.prisma.routineBlock.findFirst({
              where: { id: links.routineBlockId, userId },
              select: { id: true },
            })
          : null,
      ]);

      // `found` is index-aligned with `checks` by construction — each entry is the
      // query for the link at the same position — so the first `null` is the first
      // link that does not belong to the user.
      const found = [tasks, goals, habits, blocks];
      const failedIndex = found.findIndex((result) => result === null);
      if (failedIndex >= 0) {
        const failed = checks[failedIndex];
        if (failed) {
          this.handleError(
            new Error(`${failed.label} ${failed.id} not found for user`),
            'assertLinksOwned'
          );
        }
      }
    } catch (error) {
      this.handleError(error, 'assertLinksOwned');
    }
  }

  /**
   * Assert a category belongs to `userId`.
   *
   * `FocusSession.category` is `onDelete: SetNull`, so writing a foreign
   * category id does **not** fail the insert — it silently attaches the session
   * to another user's category, where it then shows up in their "where focus time
   * goes" breakdown. The relation's `SetNull` protects against deletion, not
   * against a hostile or buggy id, so ownership is checked explicitly.
   *
   * `select: { id: true }` keeps this to the primary-key index.
   */
  async assertCategoryOwned(userId: UserId, categoryId: string): Promise<void> {
    try {
      const found = await this.prisma.category.findFirst({
        where: { id: categoryId, userId },
        select: { id: true },
      });
      if (!found) {
        this.handleError(new Error(`Category ${categoryId} not found for user`), 'assertCategoryOwned');
      }
    } catch (error) {
      this.handleError(error, 'assertCategoryOwned');
    }
  }

  /**
   * Find the genuinely-running focus session for a user.
   *
   * `abortedAt: null` is part of the filter: a session the user stopped or
   * skipped is *ended*, not running, and must not be reported as the live
   * session. Before `abortedAt` existed, such rows were indistinguishable from
   * an in-flight timer.
   *
   * This predicate is mirrored by the `one_active_session_per_user` partial
   * unique index in `prisma/sql/focus-lifecycle.sql`. The two must agree: the
   * index constrains exactly the state this method calls "running".
   */
  async findActiveByUserId(userId: UserId): Promise<FocusSession | null> {
    try {
      return await this.prisma.focusSession.findFirst({
        where: { userId, completedAt: null, abortedAt: null },
        orderBy: { startedAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findActiveByUserId');
    }
  }

  /**
   * Complete a focus session with optional ratings and notes
   */
  async completeSession(
    userId: UserId,
    sessionId: string,
    data: CompleteFocusSessionData
  ): Promise<FocusSession> {
    try {
      const session = await this.findById(userId, sessionId);

      if (!session) {
        this.handleError(
          new Error(`Focus session ${sessionId} not found for user`),
          'completeSession'
        );
      }

      const actualDuration =
        data.actualDuration ??
        Math.round((Date.now() - session.startedAt.getTime()) / 60000);

      return await this.prisma.focusSession.update({
        where: { id: sessionId, userId },
        data: {
          completedAt: new Date(),
          actualDuration,
          focusRating: data.focusRating,
          productivityRating: data.productivityRating,
          difficultyRating: data.difficultyRating,
          energyAfter: data.energyAfter,
          distractions: data.distractions
            ? JSON.stringify(data.distractions)
            : undefined,
          techniques: data.techniques
            ? JSON.stringify(data.techniques)
            : undefined,
          notes: data.notes,
        },
      });
    } catch (error) {
      this.handleError(error, 'completeSession');
    }
  }

  /**
   * Find a focus session with category and breaks
   */
  async findById(userId: UserId, sessionId: string) {
    try {
      return await this.prisma.focusSession.findFirst({
        where: { id: sessionId, userId },
        include: {
          category: true,
          breaks: {
            orderBy: { startedAt: 'asc' },
          },
        },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Translate a derived status into a SQL predicate.
   *
   * `getFocusSessionStatus` is a pure function of `completedAt`/`abortedAt`/
   * `pausedAt`, and the three are mutually exclusive by construction, so each
   * status is a two-column predicate. Expressing them here — instead of
   * filtering the returned page in JS — is what makes `meta.total` correct and
   * what makes `limit`/`offset` mean what the caller thinks they mean.
   */
  private statusWhere(
    status: FocusSessionQueryParams['status']
  ): Prisma.FocusSessionWhereInput | undefined {
    switch (status) {
      case undefined:
        return undefined;
      // "ACTIVE" and "IN_PROGRESS" are the same predicate; the API accepts both
      // spellings and used to treat them as equivalent in JS after pagination.
      case 'IN_PROGRESS':
      case 'ACTIVE':
        return { completedAt: null, abortedAt: null, pausedAt: null };
      case 'PAUSED':
        return { completedAt: null, abortedAt: null, pausedAt: { not: null } };
      case 'COMPLETED':
        return { completedAt: { not: null } };
      case 'ABORTED':
        return { completedAt: null, abortedAt: { not: null } };
    }
  }

  /** Build the `where` clause shared by `findSessions` and `countSessions`. */
  private buildSessionsWhere(
    userId: UserId,
    query: FocusSessionQueryParams
  ): Prisma.FocusSessionWhereInput {
    const where: Prisma.FocusSessionWhereInput = { userId };

    const from = toFocusDate(query.from);
    const to = toFocusDate(query.to);
    if (from || to) {
      where.startedAt = {};
      if (from) where.startedAt.gte = from;
      if (to) where.startedAt.lte = to;
    }

    if (query.type) where.type = query.type;

    const statusClause = this.statusWhere(query.status);
    if (statusClause) Object.assign(where, statusClause);

    return where;
  }

  private sessionsInclude() {
    return {
      category: { select: { id: true, name: true, color: true } },
      /*
       * The three context links, selected by id and title only.
       *
       * They are here so the history list can say *what a session was for*, which is
       * the entire point of linking one. Only the label columns are taken - pulling the
       * whole Task/Goal/Habit rows would drag their relations along with them and turn
       * a 20-row page into several hundred.
       *
       * Nullable because every link is `onDelete: SetNull`: deleting the task a session
       * pointed at leaves the session, not the reverse, so "linked then unlinked" is a
       * normal state the UI has to render rather than an error.
       */
      task: { select: { id: true, title: true, status: true } },
      goal: { select: { id: true, title: true, status: true } },
      habit: { select: { id: true, name: true, status: true } },
      _count: { select: { breaks: true } },
    } as const;
  }

  /**
   * Find focus sessions for a user with optional filters
   */
  async findSessions(userId: UserId, query: FocusSessionQueryParams = {}) {
    try {
      return await this.prisma.focusSession.findMany({
        where: this.buildSessionsWhere(userId, query),
        include: this.sessionsInclude(),
        orderBy: { startedAt: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findSessions');
    }
  }

  /**
   * Count the sessions a filtered listing would return, ignoring pagination.
   *
   * This is a separate query rather than `data.length` because the latter
   * describes one page. It shares `buildSessionsWhere` with `findSessions`, so
   * the count and the page can never be describing different result sets.
   */
  async countSessions(userId: UserId, query: FocusSessionQueryParams = {}): Promise<number> {
    try {
      return await this.prisma.focusSession.count({
        where: this.buildSessionsWhere(userId, query),
      });
    } catch (error) {
      this.handleError(error, 'countSessions');
    }
  }

  /**
   * Update a focus session
   */
  async update(
    sessionId: string,
    userId: UserId,
    data: FocusSessionUpdateData
  ): Promise<FocusSession> {
    try {
      return await this.prisma.focusSession.update({
        where: { id: sessionId, userId },
        data: {
          title: data.title,
          description: data.description,
          plannedDuration: data.plannedDuration,
          notes: data.notes,
          category:
            data.categoryId === undefined
              ? undefined
              : data.categoryId === null
                ? { disconnect: true }
                : { connect: { id: data.categoryId } },
        },
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete a focus session owned by the user
   */
  async delete(userId: UserId, sessionId: string): Promise<FocusSession> {
    try {
      return await this.prisma.focusSession.delete({
        where: { id: sessionId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  /**
   * Count completed focus sessions for a user, optionally only those started
   * at or after a given instant.
   *
   * `type: { in: FOCUS_TIME_TYPES }` is the behaviour change: this count is the
   * `focusSessions` world-state total behind the *Focus Champion* achievement,
   * and it used to include every completed break.
   */
  async countCompletedSessions(
    userId: UserId,
    startedAfter?: Date,
    types: readonly FocusSessionType[] = FOCUS_TIME_TYPES
  ): Promise<number> {
    try {
      return await this.prisma.focusSession.count({
        where: {
          userId,
          completedAt: { not: null },
          type: { in: [...types] },
          ...(startedAfter && { startedAt: { gte: startedAfter } }),
        },
      });
    } catch (error) {
      this.handleError(error, 'countCompletedSessions');
    }
  }

  /**
   * Start instants of every completed focus session, all-time.
   *
   * The "Night Owl" criterion is a *local clock hour* test ("started at 20:00 or
   * later in the user's own timezone"), and neither `count` nor a `where` clause
   * can express that: the column is UTC and Postgres' `EXTRACT(HOUR …)` would
   * read it as UTC no matter what the user set. So the rows come back — one
   * `DateTime` column, no `actualDuration` JSON, no relations — and the caller
   * applies `isLateEvening` per row.
   *
   * Breaks are excluded for the same reason every other aggregate excludes them:
   * a 5-minute break is not a late-evening focus session.
   */
  async findCompletedSessionStarts(
    userId: UserId,
    types: readonly FocusSessionType[] = FOCUS_TIME_TYPES
  ): Promise<Date[]> {
    try {
      const rows = await this.prisma.focusSession.findMany({
        where: { userId, completedAt: { not: null }, type: { in: [...types] } },
        select: { startedAt: true },
      });
      return rows.map((row) => row.startedAt);
    } catch (error) {
      this.handleError(error, 'findCompletedSessionStarts');
    }
  }

  /**
   * Aggregate focus stats for a range, on the shared glossary's definitions.
   *
   * This is the single number every consumer reads: achievements, `/analytics`, the
   * dashboard radar, and the monthly and yearly recaps. Six call sites, one
   * predicate — which is the only reason they can be trusted to agree.
   *
   * ## The counting rule, and why it is SQL and not JS
   *
   * `FOCUS_METRIC_DEFAULTS` counts a session when it completed with any positive
   * duration, **or** ended early with at least `minimumCountedMinutes`. An earlier
   * version of this comment claimed that rule could not be expressed in a `where`
   * clause, because it keys on `endReason`. It can:
   *
   *   completed -> `completedAt IS NOT NULL AND actualDuration > 0`
   *   partial   -> `abortedAt IS NOT NULL AND actualDuration >= minimum`
   *
   * `endReason` is a *derived convenience* over those same two timestamp columns
   * (`getFocusSessionStatus` reads them as a pair, and so does the
   * `one_active_session_per_user` partial index). Using the timestamps directly
   * keeps this a single aggregate instead of a full row fetch.
   *
   * The floor is the substantive part. Counting every partial would let a streak or
   * an achievement be manufactured by starting and stopping repeatedly; counting none
   * would hide 22 real minutes because a session was incomplete.
   *
   * ## What is deliberately *not* here
   *
   * Rows with no terminal timestamp at all. They are neither completed nor aborted,
   * so the glossary's "unknown" case applies and they contribute nothing — which is
   * the honest answer, and why the backfill leaves their `endReason` null rather
   * than guessing.
   */
  async getStats(
    userId: UserId,
    from?: DateFilter,
    to?: DateFilter
  ): Promise<FocusStats> {
    try {
      const minimum = FOCUS_METRIC_DEFAULTS.minimumCountedMinutes;

      const where: Prisma.FocusSessionWhereInput = {
        userId,
        actualDuration: { not: null },
        ...FOCUS_TIME_TYPE_FILTER,
        // The counting rule, expressed once. `OR` rather than two aggregates,
        // because `_count`/`_sum`/`_avg`/`_max` all take this same clause and
        // running them separately would let the four figures describe different
        // populations.
        OR: [
          { completedAt: { not: null }, actualDuration: { gt: 0 } },
          { abortedAt: { not: null }, actualDuration: { gte: minimum } },
        ],
      };

      const fromDate = toFocusDate(from);
      const toDate = toFocusDate(to);
      if (fromDate || toDate) {
        where.startedAt = {};
        if (fromDate) where.startedAt.gte = fromDate;
        if (toDate) where.startedAt.lte = toDate;
      }

      const result = await this.prisma.focusSession.aggregate({
        where,
        _count: true,
        _sum: { actualDuration: true },
        _avg: { actualDuration: true },
        _max: { actualDuration: true },
      });

      return {
        totalSessions: result._count,
        totalFocusMinutes: result._sum.actualDuration || 0,
        averageSessionMinutes: Math.round(result._avg.actualDuration || 0),
        bestSessionFocusMinutes: result._max.actualDuration || 0,
      };
    } catch (error) {
      this.handleError(error, 'getStats');
    }
  }

  /**
   * Rows for the `/api/focus/stats` bucketing.
   *
   * Only the five columns the pure bucketing function reads are selected, and
   * non-focus types are excluded in SQL rather than in the bucketing loop, so a
   * year of history does not ship every break row to be discarded in JS.
   *
   * Aborted rows are *kept*: the stats view reports "completed vs aborted" per
   * day, and dropping them here would make that count always zero.
   */
  async findRowsForStats(
    userId: UserId,
    range: { gte: Date; lte: Date },
    types: readonly FocusSessionType[] = FOCUS_TIME_TYPES
  ) {
    try {
      return await this.prisma.focusSession.findMany({
        where: {
          userId,
          actualDuration: { not: null },
          startedAt: { gte: range.gte, lte: range.lte },
          type: { in: [...types] },
        },
        select: {
          id: true,
          type: true,
          startedAt: true,
          completedAt: true,
          abortedAt: true,
          actualDuration: true,
          // Both are read by the glossary: `endReason` decides completed-vs-partial,
          // and `timezone` is the session's snapshot, so history does not re-bucket
          // when the user moves.
          endReason: true,
          timezone: true,
        },
        orderBy: { startedAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findRowsForStats');
    }
  }

  /**
   * Apply a lifecycle transition to a row the caller owns.
   *
   * Takes a **domain-shaped** patch and translates it here, rather than accepting a
   * raw Prisma update. That indirection is not ceremony — it is what lets the
   * service say `endedAt` + `completed: true` and have this method decide that
   * means "`completedAt` set, `abortedAt` null".
   *
   * Encoding "exactly one terminal timestamp" in one place is the whole point.
   * `completedAt` and `abortedAt` are mutually exclusive everywhere else by
   * construction — the active-session lookup tests them as a pair, and so does the
   * `one_active_session_per_user` partial index — so a caller able to set them
   * independently could produce a row that nothing can classify.
   */
  async applyTransition(
    userId: UserId,
    sessionId: string,
    patch: {
      actualDuration?: number;
      endReason?: FocusSessionEndReason;
      source?: FocusSessionSource;
      focusRating?: number;
      productivityRating?: number;
      difficultyRating?: number;
      energyAfter?: number;
      notes?: string;
      distractions?: string;
      pausedAt?: Date | null;
      pausedTotalSeconds?: number | { increment: number };
      pauseCount?: number | { increment: number };
      extendedSeconds?: number | { increment: number };
      /**
       * Denormalised counts accept an atomic `increment` as well as an absolute
       * value. The increment form matters: the live "I got distracted" button
       * fires while the session is running, and read-modify-write on a counter
       * that two tabs may both tap in the same tick would lose an increment.
       */
      distractionCount?: number | { increment: number };
      lastHeartbeatAt?: Date;
      endedAt?: Date;
      completed?: boolean;
    }
  ): Promise<FocusSession> {
    try {
      const { endedAt, completed, distractions, ...rest } = patch;

      const data: Prisma.FocusSessionUncheckedUpdateInput = {
        ...rest,
        distractions: distractions ?? undefined,
        ...(endedAt === undefined
          ? {}
          : completed
            ? { completedAt: endedAt, abortedAt: null }
            : { abortedAt: endedAt, completedAt: null }),
      };

      return await this.prisma.focusSession.update({
        where: { id: sessionId, userId },
        data,
      });
    } catch (error) {
      this.handleError(error, 'applyTransition');
    }
  }

  /**
   * Create a break (optionally linked to a focus session)
   */
  async createBreak(userId: UserId, data: CreateBreakData): Promise<Break> {
    try {
      if (data.focusSessionId) {
        const owner = await this.prisma.focusSession.findFirst({
          where: { id: data.focusSessionId, userId },
        });

        if (!owner) {
          this.handleError(
            new Error(`Focus session ${data.focusSessionId} not found for user`),
            'createBreak'
          );
        }
      }

      return await this.prisma.break.create({
        data: {
          userId,
          focusSessionId: data.focusSessionId,
          startedAt: data.startedAt || new Date(),
          endedAt: data.endedAt,
          durationMinutes: data.durationMinutes,
          breakType: data.breakType,
          quality: data.quality,
          notes: data.notes,
        },
      });
    } catch (error) {
      this.handleError(error, 'createBreak');
    }
  }

  /**
   * Find a break by ID with ownership check
   */
  async findBreakById(userId: UserId, breakId: string) {
    try {
      return await this.prisma.break.findFirst({
        where: { id: breakId, userId },
        include: {
          focusSession: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });
    } catch (error) {
      this.handleError(error, 'findBreakById');
    }
  }

  /**
   * List breaks for a user in a date range
   */
  async listBreaks(
    userId: UserId,
    from?: DateFilter,
    to?: DateFilter
  ): Promise<Break[]> {
    try {
      const where: Prisma.BreakWhereInput = { userId };

      const fromDate = toFocusDate(from);
      const toDate = toFocusDate(to);
      if (fromDate || toDate) {
        where.startedAt = {};
        if (fromDate) where.startedAt.gte = fromDate;
        if (toDate) where.startedAt.lte = toDate;
      }

      return await this.prisma.break.findMany({
        where,
        orderBy: { startedAt: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'listBreaks');
    }
  }
}
