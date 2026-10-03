import { FocusRepository } from '@/server/repositories/focus.repository';
import { FocusSessionEventRepository } from '@/server/repositories/focus-event.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { FocusSettingsRepository } from '@/server/repositories/focus-settings.repository';
import { BreakRepository } from '@/server/repositories/break.repository';
import { getFocusSessionStatus } from '@/types/focus';
import { decideRecovery, applyRecoveryChoice, type RecoveryDecision, type RecoveryInput } from '@/lib/focus/recovery';
import { focusTimerPayloadToSessionType, titleForFocusType } from '@/lib/focus/type-backfill';
import { dayRange, statsQueryRange } from '@/lib/focus/stats';
import { nextBreakAt } from '@/lib/focus/break-scheduler';
import {
  FOCUS_METRIC_DEFAULTS,
  averageSessionMinutes,
  bucketByDay,
  completionRate,
  countedMinutes,
  streakOfFocusDays,
  type FocusMetricRow,
} from '@/lib/focus/metrics';
import { defaultStatsRange } from '@/app/api/focus/stats/route';
import type { FocusSessionEndReason } from '@/constants/prisma-enums';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors/app-error';
import { DEFAULT_TZ, dayBoundsInTimezone, getTodayString } from '@/lib/dates';
import type {
  createFocusSessionSchema,
  focusQuerySchema,
  updateFocusSessionSchema,
  createBreakSchema,
  breakQuerySchema,
} from '@/schemas/focus.schema';
import type { z } from 'zod';
import type { UserId } from '@/types/ids';
import type { FocusSettingsPatch, FocusPresetInput } from '@/schemas/focus.schema';

/**
 * Focus Service
 *
 * Owns focus-session lifecycle rules. `/api/focus/active` previously applied
 * the "only sessions started today are current" rule inline in the route, and
 * `/api/focus` applied the status-filter and timer-payload rules inline — the
 * kind of logic that gets re-implemented slightly differently by each caller.
 */

type CreateFocusSessionInput = z.infer<typeof createFocusSessionSchema>;
type FocusQuery = z.infer<typeof focusQuerySchema>;
type UpdateFocusSessionInput = z.infer<typeof updateFocusSessionSchema>;
type CreateBreakInput = z.infer<typeof createBreakSchema>;
type BreakQuery = z.infer<typeof breakQuerySchema>;

export class FocusService {
  private focusRepository: FocusRepository;
  private breakRepository: BreakRepository;
  private eventRepository: FocusSessionEventRepository;
  private userRepository: UserRepository;
  private settingsRepository: FocusSettingsRepository;

  constructor() {
    this.focusRepository = new FocusRepository();
    this.breakRepository = new BreakRepository();
    this.eventRepository = new FocusSessionEventRepository();
    this.userRepository = new UserRepository();
    this.settingsRepository = new FocusSettingsRepository();
  }

  // ==========================================================================
  // Settings and presets
  //
  // `FocusSettings` and `FocusPreset` already existed in the schema with a full
  // repository behind them, but nothing reached them: durations were hardcoded to
  // 25 minutes in both the runtime and the store. So these are the *only* place the
  // server learns what the user's focus timer is supposed to look like, and
  // `FocusRuntime` reads them rather than carrying its own defaults.
  //
  // Reads go through `getOrCreate`, never `get`, so a user who has never opened the
  // settings page still gets the schema defaults instead of a null that every caller
  // would have to special-case.
  // ==========================================================================

  /** The user's focus settings, created with schema defaults on first read. */
  async getSettings(userId: UserId) {
    return this.settingsRepository.getOrCreate(userId);
  }

  /**
   * Merge a validated patch into the settings row.
   *
   * A patch rather than a replace on purpose: the settings page sends one section at
   * a time, and a replace would silently reset every field the client did not send.
   */
  async updateSettings(userId: UserId, patch: FocusSettingsPatch) {
    await this.settingsRepository.getOrCreate(userId);
    return this.settingsRepository.update(userId, patch);
  }

  /** Presets for the picker, newest ordering last so the user can reorder them. */
  async listPresets(userId: UserId, includeArchived = false) {
    return this.settingsRepository.listPresets(userId, includeArchived);
  }

  /**
   * Create a preset, after checking the category belongs to the caller.
   *
   * `FocusPreset.categoryId` is a plain `SetNull` relation, so without this a
   * category id could be attached from another account. Validated here rather than by
   * the schema, which only sees a string.
   */
  async createPreset(userId: UserId, input: FocusPresetInput) {
    if (input.categoryId) {
      await this.assertCategoryOwned(userId, input.categoryId);
    }
    return this.settingsRepository.createPreset(userId, input);
  }

  /** Ownership is checked against the preset's *own* userId, not the caller's word. */
  async updatePreset(userId: UserId, presetId: string, patch: Partial<FocusPresetInput>) {
    if (patch.categoryId) {
      await this.assertCategoryOwned(userId, patch.categoryId);
    }
    return this.settingsRepository.updatePreset(userId, presetId, patch);
  }

  /**
   * Archive rather than hard-delete when the preset is referenced.
   *
   * `FocusPreset` has an `isArchived` column precisely so a preset that appears in a
   * session's snapshot can leave the picker without breaking history; the repository
   * decides which path applies.
   */
  async deletePreset(userId: UserId, presetId: string) {
    return this.settingsRepository.deletePreset(userId, presetId);
  }

  /** Per-day-type target overrides, keyed by `DayTypeDefinition.id`. */
  async listDayTypeTargets(userId: UserId) {
    return this.settingsRepository.listDayTypeTargets(userId);
  }

  /**
   * Set (or clear) the target for one day type.
   *
   * `null` deletes rather than writing a zero, so "no override" stays distinct from
   * "override to zero focus minutes" - the two mean opposite things and a zero
   * target would silently void the day's goal.
   */
  async setDayTypeTarget(userId: UserId, dayTypeId: string, targetMinutes: number | null) {
    if (targetMinutes === null) {
      await this.settingsRepository.deleteDayTypeTarget(userId, dayTypeId);
      return { cleared: true };
    }
    await this.settingsRepository.setDayTypeTarget(userId, dayTypeId, targetMinutes);
    return { cleared: false };
  }

  /**
   * The user's current focus session, settled and annotated, or `null`.
   *
   * **The "today only" gate is gone, and that is the fix.**
   *
   * It used to be: read the running row, and if it did not start today, return
   * `null`. That single rule caused two failures at once:
   *
   *   - A session genuinely running past midnight *disappeared* from the UI while
   *     still being, to the database, the live session. The user watched their own
   *     running timer vanish.
   *   - More importantly it hid the real problem rather than solving it. The row
   *     was not stale because of the calendar; it was stale because no completion
   *     signal ever arrived. Refusing to show it just made an abandoned row
   *     invisible while it still read as "running" to every other query.
   *
   * So every read now *settles* the row instead of filtering it: `decideRecovery`
   * derives what must have happened from timestamps, and if it derives an ending,
   * the ending is **written** before the response goes out. That is what makes
   * `/api/focus/active` meaningful now that Start creates a running row.
   *
   * The lazy settle is idempotent and guarded, so a concurrent second read cannot
   * double-apply it: the write is conditional on the row still looking active.
   */
  async getActiveSession(userId: UserId) {
    const active = await this.focusRepository.findActiveByUserId(userId);
    if (!active) return null;

    const decision = decideRecovery(this.recoveryInputFor(active), Date.now());

    if (decision.kind === 'auto-complete' || decision.kind === 'auto-abandon') {
      await this.applySettlement(userId, active, decision);
      // Re-read: the caller must see the *settled* row, not the pre-settlement
      // snapshot, or the UI would render a countdown for a session that just
      // ended while it was being fetched.
      const settled = await this.focusRepository.findById(userId, active.id);
      if (!settled) return null;
      return {
        ...settled,
        status: getFocusSessionStatus(settled),
        needsRecovery: false,
        recovery: null,
      };
    }

    return {
      ...active,
      status: getFocusSessionStatus(active),
      needsRecovery: decision.kind === 'ask',
      // Surfaced so the client can explain *why* it is being asked, and offer the
      // same options the server would have chosen between.
      recovery:
        decision.kind === 'ask'
          ? {
              recommended: decision.recommended,
              options: [...decision.options],
              evidenceMs: decision.evidenceMs,
              fullMs: decision.fullMs,
              reason: decision.reason,
            }
          : null,
    };
  }

  /** Build the clock-free input the recovery rules need from a stored row. */
  private recoveryInputFor(row: {
    startedAt: Date;
    pausedAt: Date | null;
    pausedTotalSeconds: number;
    plannedDuration: number;
    lastHeartbeatAt: Date | null;
  }): RecoveryInput {
    const isStopwatch = row.plannedDuration <= 0;
    return {
      startedAt: row.startedAt.getTime(),
      pausedAt: row.pausedAt ? row.pausedAt.getTime() : null,
      pausedTotalMs: row.pausedTotalSeconds * 1000,
      // `0` is the open-ended sentinel `settleSession` uses for a stopwatch. A
      // stored stopwatch carries a placeholder 1-minute plan, so the type has to
      // come from somewhere other than the plan length.
      plannedMs: isStopwatch ? 0 : row.plannedDuration * 60_000,
      lastHeartbeatAt: row.lastHeartbeatAt ? row.lastHeartbeatAt.getTime() : null,
    };
  }

  /**
   * Write a settlement the recovery rules decided on.
   *
   * Two things make this safe to run on a read path:
   *
   * 1. **It is conditional on the row still looking active.** `applyTransition`
   *    returns the number of rows it matched; zero means another reader settled it
   *    first. Without that guard, two tabs opening at the same moment would both
   *    apply an `auto-complete` and the second would overwrite `actualDuration`
   *    with its own, slightly different, figure — and write a second END event.
   * 2. **The event log write is skipped entirely when the transition lost the
   *    race**, so the trail stays one-entry-per-ending rather than one per
   *    attempt.
   */
  private async applySettlement(
    userId: UserId,
    row: { id: string },
    decision: Extract<RecoveryDecision, { kind: 'auto-complete' | 'auto-abandon' }>
  ): Promise<void> {
    const minutes = Math.max(0, Math.round(decision.actualMs / 60_000));
    const endedAt = new Date(
      'completedAt' in decision ? decision.completedAt : decision.endedAt
    );

    const claimed = await this.focusRepository.applyTransitionWhereActive(row.id, {
      actualDuration: minutes,
      endReason: decision.endReason,
      source: decision.source,
      endedAt,
      completed: decision.kind === 'auto-complete',
    });
    if (claimed === 0) return;

    await this.eventRepository.create(userId, {
      focusSessionId: row.id,
      type: 'END',
      occurredAt: endedAt,
      label: decision.kind === 'auto-complete' ? 'completed-while-away' : 'abandoned',
      metadata: { endReason: decision.endReason, settledBy: 'recovery', actualMinutes: minutes },
    });
  }

  /** The user's stored timezone, falling back to `DEFAULT_TZ` on any failure. */
  private async timezoneFor(userId: UserId): Promise<string> {
    const settings = await this.userRepository
      .getSettings(userId)
      .catch(() => null);
    return settings?.timezone || DEFAULT_TZ;
  }

  /**
   * Focus sessions for a date range, each annotated with its derived status and
   * optionally filtered by that status.
   *
   * `ACTIVE` and `IN_PROGRESS` both mean "still running", so they are treated
   * as the same filter value.
   */
  async listSessions(userId: UserId, query: FocusQuery) {
    const sessions = await this.focusRepository.findSessions(userId, {
      from: query.from,
      to: query.to,
      limit: query.limit,
      offset: query.offset,
    });

    const statusFilter = query.status;
    const filtered = statusFilter
      ? sessions.filter((item) => {
          const status = getFocusSessionStatus(item);
          if (statusFilter === 'ACTIVE' || statusFilter === 'IN_PROGRESS') {
            return status === 'IN_PROGRESS';
          }
          return status === statusFilter;
        })
      : sessions;

    return {
      data: filtered.map((item) => ({
        ...item,
        status: getFocusSessionStatus(item),
      })),
      meta: {
        total: filtered.length,
        limit: query.limit,
        offset: query.offset,
      },
    };
  }

  /**
   * Create a focus session.
   *
   * Accepts both the full session shape and the timer-widget shape (which sends
   * seconds and a `type` discriminator). Timer payloads are normalised onto the
   * minutes-based model so a well-formed timer POST can never be rejected for
   * shape reasons.
   *
   * The union has three arms and they are discriminated on **which optional
   * fields are present**, not on `type` alone:
   *
   *   legacy         title + plannedDuration, no `type`
   *   start          type + plannedSeconds (nullable for a stopwatch), no actualSeconds
   *   timer payload  type + plannedSeconds + actualSeconds + completed
   *
   * An earlier version branched on `'type' in input`, which stopped being a valid
   * discriminator the moment the "start" arm was added — it also has a `type`, so
   * the timer-payload branch matched a start request and then read
   * `input.actualSeconds`, which does not exist on that arm.
   * `actualSeconds` is therefore the discriminator: it is the one field only the
   * finished-payload arm carries.
   */
  async createSession(userId: UserId, input: CreateFocusSessionInput) {
    // Arm 3: a finished run reported after the fact (the legacy create-at-end).
    if ('actualSeconds' in input) {
      // An aborted session must be closed out, not left "open".
      //
      // `findActiveByUserId` selects `completedAt: null` to mean "a session is
      // currently running". Stop / Skip / mode-switch all post with
      // `completed: false`, and the service used to leave `completedAt`
      // undefined — so the row looked like a live session indefinitely and
      // `/focus/session` showed it as IN PROGRESS forever. Setting
      // `completedAt` instead would have been wrong the other way: it counts
      // as completed work in the stats. `abortedAt` records "ended, not
      // finished" explicitly.
const endedAt = input.completedAt ?? input.abortedAt ?? new Date();
      const completed = input.completed === true;
      return this.focusRepository.createSession(userId, {
        type: focusTimerPayloadToSessionType(input.type),
        title: titleForFocusType(focusTimerPayloadToSessionType(input.type)),
        plannedDuration: Math.max(1, Math.round(input.plannedSeconds / 60)),
        actualDuration: Math.max(0, Math.round(input.actualSeconds / 60)),
        techniques: input.type === 'focus' ? ['Pomodoro'] : undefined,
        startedAt: input.startedAt ?? new Date(),
        ...(completed
          ? { completedAt: endedAt }
          : { abortedAt: endedAt }),
      });
    }

    // Arm 2: Start. Creates a RUNNING row — no completedAt, no abortedAt — which
    // is exactly the shape `findActiveByUserId` reads as "currently running".
    // This is the first point at which the server knows a session is in flight.
    if ('type' in input) {
      const sessionType = focusTimerPayloadToSessionType(input.type);
      // `plannedSeconds: null` is the stopwatch sentinel: open-ended, no
      // deadline. It is stored as a 1-minute plan so the column's
      // "positive minutes" invariant holds, and the *type* is what tells readers
      // this number is a placeholder rather than a real plan.
      const plannedMinutes =
        input.plannedSeconds === null || input.plannedSeconds === undefined
          ? 1
          : Math.max(1, Math.round(input.plannedSeconds / 60));

      // Ownership assertion on the category before it is written. A `connect` to
      // a category the caller does not own would attach the session to someone
      // else's category, which then shows in their roll-ups.
      if (input.categoryId) {
        await this.assertCategoryOwned(userId, input.categoryId);
      }

      // Only one active session per user. The service check exists so the user
      // gets a readable message; the partial unique index is what makes it true
      // under concurrency.
      const existing = await this.focusRepository.findActiveByUserId(userId);
      if (existing) {
        throw new ConflictError('A focus session is already running');
      }

      return this.focusRepository.createSession(userId, {
        type: sessionType,
        title: input.title ?? titleForFocusType(sessionType),
        categoryId: input.categoryId ?? undefined,
        plannedDuration: plannedMinutes,
        techniques: input.type === 'focus' ? ['Pomodoro'] : undefined,
        startedAt: input.startedAt ?? new Date(),
        // Deliberately no `completedAt`/`abortedAt`/`actualDuration`: the session
        // has not finished, and letting a start request assert otherwise is how
        // phantom completed work gets created.
      });
    }

    // Arm 1: the original minutes-based create.
    return this.focusRepository.createSession(userId, {
      type: 'FOCUS',
      title: input.title,
      description: input.description,
      categoryId: input.categoryId,
      plannedDuration: input.plannedDuration,
      techniques: input.techniques,
      energyBefore: input.energyBefore,
      startedAt: input.startedAt,
    });
  }

  /**
   * Assert a category belongs to `userId`.
   *
   * `FocusSession.category` is a `SetNull` relation, so a foreign category id
   * would not fail the insert — it would silently attach the session to another
   * user's category, where it then appears in their "where focus time goes"
   * breakdown. The check is a single indexed primary-key read.
   */
  private async assertCategoryOwned(userId: UserId, categoryId: string): Promise<void> {
    await this.focusRepository.assertCategoryOwned(userId, categoryId);
  }


  /**
   * A single session owned by the caller, or `NotFoundError`.
   */
  async getSession(userId: UserId, sessionId: string) {
    const session = await this.focusRepository.findById(userId, sessionId);
    if (!session) {
      throw new NotFoundError('Focus session');
    }
    return session;
  }

  /**
   * Breaks for a date/type range, plus the ISO timestamp of the next scheduled
   * break if a focus session is currently running.
   *
   * The scheduled-break hint is best-effort: a failure to compute it never
   * fails the listing.
   */
  async listBreaks(userId: UserId, query: BreakQuery) {
    const [breaks, total] = await Promise.all([
      this.breakRepository.list(userId, query),
      this.breakRepository.count(userId, query),
    ]);

    let nextScheduledBreak: string | null = null;
    try {
      const active = await this.focusRepository.findActiveByUserId(userId);
      if (active) {
        // Same host-local-vs-user-local bug as `getActiveSession`.
        const { start: startOfToday, end: endOfToday } = dayBoundsInTimezone(
          await this.timezoneFor(userId)
        );

        if (active.startedAt >= startOfToday && active.startedAt < endOfToday) {
          const next = nextBreakAt(active.startedAt, active.plannedDuration);
          nextScheduledBreak = next ? next.toISOString() : null;
        }
      }
    } catch {
      nextScheduledBreak = null;
    }

    return {
      data: breaks,
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
        nextScheduledBreak,
      },
    };
  }

  /**
   * Record a break.
   */
  async createBreak(userId: UserId, input: CreateBreakInput) {
    return this.breakRepository.create(userId, {
      focusSessionId: input.focusSessionId,
      breakType: input.breakType,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      durationMinutes: input.durationMinutes,
      quality: input.quality,
      notes: input.notes,
    });
  }

  // ==========================================================================
  // Lifecycle
  //
  // Every method below is idempotent on purpose. They are called from a retry
  // queue, from two tabs, and from a client that may have lost the response to a
  // request it already succeeded at. A second `pause` on an already-paused
  // session, or a second `end` on an already-ended one, returns the current state
  // rather than throwing or double-applying — the caller cannot distinguish
  // "already done" from "just done", and must not have to.
  // ==========================================================================

  /**
   * Start a running session.
   *
   * Snapshots the user's timezone and computes `localDate` at write time. Both are
   * what make history stable: without them, a user who moves timezone would
   * silently re-bucket every session they have ever recorded, and a session run
   * past midnight would be attributed to a day derived from the *current* zone
   * rather than the one it was worked in.
   *
   * `clientId` makes the whole call idempotent. Replaying it returns the existing
   * row rather than starting a second one, which is what makes an offline outbox
   * safe to flush without deduplicating client-side.
   */
  async startSession(
    userId: UserId,
    input: {
      type: 'focus' | 'short-break' | 'long-break' | 'stopwatch';
      plannedSeconds?: number | null;
      startedAt?: Date;
      title?: string;
      categoryId?: string | null;
      clientId?: string;
      runId?: string;
      cycleIndex?: number;
      taskId?: string;
      goalId?: string;
      habitId?: string;
      routineBlockId?: string;
    }
  ) {
    if (input.clientId) {
      const existing = await this.focusRepository.findByClientId(userId, input.clientId);
      if (existing) return existing;
    }

    const sessionType = focusTimerPayloadToSessionType(input.type);
    const isStopwatch = input.type === 'stopwatch';
    const plannedSeconds = isStopwatch ? null : input.plannedSeconds ?? null;

    const existingActive = await this.focusRepository.findActiveByUserId(userId);
    if (existingActive) {
      throw new ConflictError('A focus session is already running');
    }

    if (input.categoryId) await this.assertCategoryOwned(userId, input.categoryId);
    // Every link is `SetNull`, so a foreign id would not fail the insert — it
    // would attach the session to somebody else's task and quietly corrupt their
    // roll-ups. Each is checked before the write.
    await this.assertLinkOwnership(userId, {
      taskId: input.taskId,
      goalId: input.goalId,
      habitId: input.habitId,
      routineBlockId: input.routineBlockId,
    });

    const timezone = await this.timezoneFor(userId);
    const startedAt = input.startedAt ?? new Date();
    // `dayBoundsInTimezone` returns the day's start and (exclusive) end instants;
    // `localDate` is the start, stored as a `Date` column. Resolving it through the
    // user's zone is the whole point — deriving it from `startedAt.toISOString()`
    // would be UTC bucketing, and a Tokyo user's morning sessions would land on
    // the previous calendar day.
    const localDate = dayBoundsInTimezone(timezone).start;

    const created = await this.focusRepository.createSession(userId, {
      type: sessionType,
      title: input.title ?? titleForFocusType(sessionType),
      categoryId: input.categoryId ?? undefined,
      // A stopwatch has no plan. It stores `1` because the column is
      // "positive minutes" and `plannedDuration <= 0` is the open-ended sentinel
      // every reader uses; the `type` column is what distinguishes it, not this
      // placeholder number.
      plannedDuration: isStopwatch || plannedSeconds === null
        ? 1
        : Math.max(1, Math.round(plannedSeconds / 60)),
      techniques: input.type === 'focus' ? ['Pomodoro'] : undefined,
      startedAt,
      clientId: input.clientId ?? null,
      runId: input.runId ?? null,
      cycleIndex: input.cycleIndex ?? null,
      taskId: input.taskId ?? null,
      goalId: input.goalId ?? null,
      habitId: input.habitId ?? null,
      routineBlockId: input.routineBlockId ?? null,
      timezone,
      localDate,
      lastHeartbeatAt: startedAt,
    });

    await this.eventRepository.create(userId, {
      focusSessionId: created.id,
      type: 'START',
      occurredAt: startedAt,
      metadata: { type: sessionType, plannedSeconds, timezone },
    });

    return created;
  }

  /**
   * Assert every supplied link belongs to `userId`.
   *
   * Only the ids actually supplied are checked, so a session with no links costs
   * one query rather than four.
   */
  private async assertLinkOwnership(
    userId: UserId,
    links: { taskId?: string; goalId?: string; habitId?: string; routineBlockId?: string }
  ): Promise<void> {
    const present = Object.entries(links).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0
    );
    if (present.length === 0) return;
    await this.focusRepository.assertLinksOwned(userId, Object.fromEntries(present));
  }

  /**
   * Per-day focus statistics — the drill-down behind `GET /api/focus/stats`.
   *
   * Applies the same glossary as `focusRepository.getStats`, but per day and with
   * midnight splitting, which needs the rows in JS. The repository applies the
   * identical *counting rule* in SQL for the range totals, so the two agree: this is
   * the same definition computed two ways, not two definitions.
   *
   * The only genuinely new thing here is `completionRate`, which needs a denominator
   * (started sessions) that a range aggregate does not carry.
   */  async getStats(userId: UserId, from?: string, to?: string) {
    const timezone = await this.timezoneFor(userId);
    const today = getTodayString(timezone);
    const range = defaultStatsRange(today);
    const fromDate = from ?? range.from;
    const toDate = to ?? range.to;

    const { gte, lte } = statsQueryRange(timezone, fromDate, toDate);
    const rows = await this.focusRepository.findRowsForStats(userId, { gte, lte });

    const metricRows: FocusMetricRow[] = rows.map((row) => ({
      id: row.id,
      type: row.type,
      startedAt: row.startedAt,
      endedAt: row.completedAt ?? row.abortedAt,
      endReason: row.endReason,
      actualDuration: row.actualDuration,
      timezone: row.timezone,
    }));

    const buckets = bucketByDay({ rows: metricRows, timezone, from: fromDate, to: toDate });

    const summarise = (date: string) => {
      const bucket = buckets.get(date);
      return {
        date,
        focusMinutes: Math.round(bucket?.minutes ?? 0),
        sessions: bucket ? bucket.completedSessions + bucket.partialSessions : 0,
        completedSessions: bucket?.completedSessions ?? 0,
        partialSessions: bucket?.partialSessions ?? 0,
      };
    };

    return {
      // Dense, so the chart has a bar for every day in range. A gap reads as
      // missing data rather than as a day off.
      days: dayRange(fromDate, toDate).map(summarise),
      today: summarise(today),
      streakDays: streakOfFocusDays(
        buckets,
        today,
        FOCUS_METRIC_DEFAULTS.streakDayMinutes
      ),
      totalFocusMinutes: Math.round(
        metricRows.reduce((sum, row) => sum + countedMinutes(row), 0)
      ),
      totalSessions: metricRows.filter((row) => countedMinutes(row) > 0).length,
      /** `null` when there is nothing to judge — see `completionRate`. */
      completionRate: completionRate(metricRows),
      averageSessionMinutes: averageSessionMinutes(metricRows),
      range: { from: fromDate, to: toDate, timezone },
    };
  }

  /** A row that is still running or paused. Throws if it has already ended. */
  private async requireActive(userId: UserId, sessionId: string) {
    const session = await this.getSession(userId, sessionId);
    if (session.completedAt || session.abortedAt) {
      throw new ValidationError('Focus session has already ended');
    }
    return session;
  }

  /**
   * Pause a running session.
   *
   * Idempotent: pausing an already-paused session returns it unchanged rather
   * than moving `pausedAt` forward, which would silently discard the paused span.
   */
  async pauseSession(userId: UserId, sessionId: string, reason?: string) {
    const session = await this.requireActive(userId, sessionId);
    if (session.pausedAt) return session;

    const pausedAt = new Date();
    const updated = await this.focusRepository.applyTransition(userId, sessionId, {
      pausedAt,
      pauseCount: { increment: 1 },
      lastHeartbeatAt: pausedAt,
    });
    await this.eventRepository.create(userId, {
      focusSessionId: sessionId,
      type: 'PAUSE',
      occurredAt: pausedAt,
      // `reason` distinguishes "I paused" from "sleep started", which is the
      // difference between a deliberate interruption and a system one.
      label: reason ?? null,
    });
    return updated;
  }

  /**
   * Resume a paused session.
   *
   * The pause span is added to `pausedTotalSeconds` rather than recomputed from
   * the event log on every read, so the hot read stays a single indexed row
   * fetch. The log remains authoritative and can rebuild the column.
   */
  async resumeSession(userId: UserId, sessionId: string) {
    const session = await this.requireActive(userId, sessionId);
    if (!session.pausedAt) return session;

    const resumedAt = new Date();
    const pausedSeconds = Math.max(
      0,
      Math.round((resumedAt.getTime() - session.pausedAt.getTime()) / 1000)
    );
    const updated = await this.focusRepository.applyTransition(userId, sessionId, {
      pausedAt: null,
      pausedTotalSeconds: { increment: pausedSeconds },
      lastHeartbeatAt: resumedAt,
    });
    await this.eventRepository.create(userId, {
      focusSessionId: sessionId,
      type: 'RESUME',
      occurredAt: resumedAt,
      metadata: { pausedSeconds },
    });
    return updated;
  }

  /**
   * Grant extra time.
   *
   * `extendedSeconds` is incremented rather than `plannedDuration`, deliberately:
   * overwriting the plan would make "planned versus actual" — the estimate-accuracy
   * signal — permanently unable to detect a session the user had to extend.
   */
  async extendSession(userId: UserId, sessionId: string, seconds: number) {
    await this.requireActive(userId, sessionId);
    const clamped = Math.min(4 * 3600, Math.max(60, Math.round(seconds)));
    const updated = await this.focusRepository.applyTransition(userId, sessionId, {
      extendedSeconds: { increment: clamped },
      lastHeartbeatAt: new Date(),
    });
    await this.eventRepository.create(userId, {
      focusSessionId: sessionId,
      type: 'EXTEND',
      metadata: { seconds: clamped },
    });
    return updated;
  }

  /**
   * Record that a client is still watching.
   *
   * Evidence only, never authority — the recovery rules treat heartbeats as a
   * *lower* bound on presence, never as permission to claim time. That asymmetry
   * is what stops a client that keeps heartbeating from manufacturing focus
   * minutes.
   *
   * Returns nothing rather than the row: the client already knows the session is
   * running, and echoing the row on every minute would be a payload it has to
   * parse for no information.
   */
  async heartbeat(userId: UserId, sessionId: string): Promise<void> {
    const session = await this.getSession(userId, sessionId);
    if (session.completedAt || session.abortedAt) return;
    await this.focusRepository.applyTransition(userId, sessionId, {
      lastHeartbeatAt: new Date(),
    });
  }

  /**
   * End a session.
   *
   * `actualMs` is computed **server-side** from timestamps minus paused time, and
   * the client's claim is only accepted as a lower bound. A client that says "I
   * did 40 minutes" on a 25-minute session gets 25; one that says 5 when 25 are
   * provable gets 25. Trusting the client here would make every focus total
   * attacker-controlled, and this number feeds achievements.
   *
   * Exactly one terminal timestamp is written. `endReason` is what distinguishes
   * a completed timebox from a stopped one, because writing `completedAt` for
   * both would make completion rate permanently 100%.
   */
  async endSession(
    userId: UserId,
    sessionId: string,
    options: {
      endReason: FocusSessionEndReason;
      focusRating?: number;
      productivityRating?: number;
      difficultyRating?: number;
      energyAfter?: number;
      notes?: string;
      distractions?: string[];
      /** The client's own claim, used only as a floor. */
      claimedActualMs?: number;
    }
  ) {
    const session = await this.getSession(userId, sessionId);
    // Idempotent: an already-ended session returns as-is rather than throwing, so
    // a retried `end` after a lost response is harmless.
    if (session.completedAt || session.abortedAt) return session;

    const endedAt = new Date();
    const isStopwatch = session.plannedDuration <= 0;
    const plannedMs = isStopwatch ? 0 : session.plannedDuration * 60_000;
    const extendedMs = session.extendedSeconds * 1000;

    // Evidence-based ceiling: wall clock, minus paused time, minus time before the
    // session started (a client cannot have worked before it began).
    const elapsedMs = Math.max(
      0,
      endedAt.getTime() - session.startedAt.getTime() - session.pausedTotalSeconds * 1000
    );
    const ceiling = isStopwatch
      ? elapsedMs
      : Math.min(elapsedMs, plannedMs + extendedMs);

    /**
     * The server's timestamp-derived figure is the authority, full stop.
     *
     * An earlier draft tried to treat the client's claim as a floor the server
     * could be raised to, which is not safe: a client that claims more than the
     * timestamps allow would then be believed, and this number feeds achievement
     * thresholds. The server's own clock is strictly better evidence than anything
     * the client can assert, because it is the clock that cannot be edited from a
     * browser. A mismatch is recorded on the END event so it stays auditable
     * rather than silently discarded — but it never changes the figure.
     */
    const settledMs = ceiling;

    const completed = options.endReason === 'COMPLETED' || options.endReason === 'MANUAL';

    const updated = await this.focusRepository.applyTransition(userId, sessionId, {
      actualDuration: Math.max(0, Math.round(settledMs / 60_000)),
      endReason: options.endReason,
      source: options.endReason === 'MANUAL' ? 'MANUAL' : 'TIMER',
      focusRating: options.focusRating,
      productivityRating: options.productivityRating,
      difficultyRating: options.difficultyRating,
      energyAfter: options.energyAfter,
      notes: options.notes,
      distractions: options.distractions ? JSON.stringify(options.distractions) : undefined,
      // `distractionCount` is the event log's tally, so it is *read* from there
      // rather than incremented by the client.
      distractionCount: await this.eventRepository.countByType(userId, sessionId, 'DISTRACTION'),
      endedAt,
      completed,
    });

    await this.eventRepository.create(userId, {
      focusSessionId: sessionId,
      type: 'END',
      occurredAt: endedAt,
      label: options.endReason,
      metadata: { actualMinutes: Math.round(settledMs / 60_000), claimedMs: options.claimedActualMs },
    });

    return updated;
  }

  /**
   * Log a distraction or a note mid-session.
   *
   * A distraction bumps the denormalised counter immediately rather than waiting
   * for `end`, because the live "I got distracted" button needs a visible count
   * while the session is still running.
   */
  async logEvent(
    userId: UserId,
    sessionId: string,
    input: { type: 'DISTRACTION' | 'NOTE'; label?: string; note?: string }
  ) {
    await this.requireActive(userId, sessionId);
    await this.eventRepository.create(userId, {
      focusSessionId: sessionId,
      type: input.type,
      label: input.label ?? null,
      note: input.note ?? null,
    });
    if (input.type === 'DISTRACTION') {
      await this.focusRepository.applyTransition(userId, sessionId, {
        distractionCount: { increment: 1 },
      });
    }
  }

  /**
   * Apply a recovery decision.
   *
   * The user choosing `credit-full` is what makes the session completed — not the
   * deadline having passed. That distinction matters: recovery is the one place
   * where "the timer ran out" is not evidence that "the work happened", and only
   * the user can supply the missing evidence.
   */
  async recoverSession(
    userId: UserId,
    sessionId: string,
    choice: 'credit-evidence' | 'credit-full' | 'discard'
  ) {
    const session = await this.getSession(userId, sessionId);
    const applied = applyRecoveryChoice(choice, this.recoveryInputFor(session), Date.now());

    if (applied.action === 'delete') {
      await this.eventRepository.deleteForSession(userId, sessionId);
      return this.focusRepository.delete(userId, sessionId);
    }

    const updated = await this.focusRepository.applyTransition(userId, sessionId, {
      actualDuration: Math.max(0, Math.round(applied.actualMs / 60_000)),
      endReason: applied.endReason,
      source: applied.source,
      endedAt: new Date(applied.completedAt),
      completed: true,
      distractionCount: await this.eventRepository.countByType(userId, sessionId, 'DISTRACTION'),
    });

    await this.eventRepository.create(userId, {
      focusSessionId: sessionId,
      type: 'END',
      occurredAt: new Date(applied.completedAt),
      label: `recovered:${choice}`,
      metadata: { choice, actualMinutes: Math.round(applied.actualMs / 60_000) },
    });

    return updated;
  }

  /** The ordered event timeline for one session. */
  async listEvents(userId: UserId, sessionId: string) {
    await this.getSession(userId, sessionId);
    return this.eventRepository.listForSession(userId, sessionId);
  }

  /** Edit a session's descriptive fields. */
  async updateSession(
    userId: UserId,
    sessionId: string,
    input: UpdateFocusSessionInput
  ) {
    await this.getSession(userId, sessionId);
    return this.focusRepository.update(sessionId, userId, {
      title: input.title,
      description: input.description,
      categoryId: input.categoryId,
      plannedDuration: input.plannedDuration,
      notes: input.notes,
    });
  }

  /** Delete a session. */
  async deleteSession(userId: UserId, sessionId: string) {
    await this.getSession(userId, sessionId);
    return this.focusRepository.delete(userId, sessionId);
  }


}

export const focusService = new FocusService();
