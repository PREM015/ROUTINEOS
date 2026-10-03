import { TimeEntryRepository } from '@/server/repositories/time-entry.repository';
import { ConflictError, NotFoundError } from '@/lib/errors/app-error';
import type {
  CreateTimeEntryInput,
  StartTimeEntryInput,
  TimeTrackingQueryParams,
  UpdateTimeEntryInput,
} from '@/schemas/time-tracking.schema';
import type { TimeEntry } from '@/generated/prisma';
import type { UserId } from '@/types/ids';

/**
 * Time Tracking Service
 *
 * Owns the timer lifecycle rules that used to be spread across the four
 * `/api/time-tracking` routes (ERROR.md §1).
 *
 * The one that mattered was in `start`: "you already have a running entry" is a
 * business rule about the *user's* current state, and it lived inside a route
 * handler. Any other caller — a second route, a cron reconciliation job, a
 * future offline-sync path — would have had no way to learn it, and the only
 * expression of the rule was a 409 in a specific file.
 */
export class TimeTrackingService {
  private readonly timeEntryRepository: TimeEntryRepository;

  constructor(timeEntryRepository: TimeEntryRepository = new TimeEntryRepository()) {
    this.timeEntryRepository = timeEntryRepository;
  }

  /** A page of entries plus the total matching count, for the list route's meta. */
  async listForUser(userId: UserId, query: TimeTrackingQueryParams) {
    const [entries, total] = await Promise.all([
      this.timeEntryRepository.list(userId, query),
      this.timeEntryRepository.count(userId, query),
    ]);
    return { entries, total };
  }

  /**
   * Create an explicit entry (not necessarily a running timer).
   *
   * Fields are mapped explicitly rather than spread, because the Zod input types
   * nullable relations as `string | null` while the repository's create data
   * expects `string | undefined`. Spreading would also forward `isAutomatic`,
   * which only the auto-tracking path sets — a client-supplied `isAutomatic:
   * true` would mark a hand-entered entry as machine-generated.
   */
  async create(userId: UserId, input: CreateTimeEntryInput): Promise<TimeEntry> {
    return this.timeEntryRepository.create(userId, {
      description: input.description,
      startTime: input.startTime,
      endTime: input.endTime ?? undefined,
      duration: input.duration,
      projectId: input.projectId ?? undefined,
      habitId: input.habitId ?? undefined,
      goalId: input.goalId ?? undefined,
      billable: input.billable,
      rate: input.rate,
      tags: input.tags,
    });
  }

  /**
   * Start a running timer.
   *
   * Throws `ConflictError` when one is already running. Without this a second
   * start would silently create a second open entry, and the stop route — which
   * closes *the* running entry — would then leave an orphan that never ends and
   * is counted in every duration total forever.
   */
  async start(userId: UserId, input: StartTimeEntryInput): Promise<TimeEntry> {
    const running = await this.timeEntryRepository.findRunning(userId);
    if (running) {
      // The conflicting row is attached so the client can show what is already
      // running, which is what the route has always returned on this 409.
      throw new ConflictError('A time entry is already running', { running });
    }

    return this.timeEntryRepository.create(userId, {
      description: input.description,
      projectId: input.projectId,
      goalId: input.goalId,
      habitId: input.habitId,
      billable: input.billable,
      startTime: input.startTime ?? new Date(),
      rate: input.rate,
      tags: input.tags,
    });
  }

  /**
   * Stop the running timer.
   *
   * `NotFoundError` when nothing is running, which is what the route returned as
   * a 404.
   */
  async stopRunning(userId: UserId): Promise<TimeEntry> {
    const entry = await this.timeEntryRepository.stopRunning(userId);
    if (!entry) {
      throw new NotFoundError('Running time entry');
    }
    return entry;
  }

  /** One entry, or `NotFoundError`. */
  async getForUser(userId: UserId, entryId: string) {
    const entry = await this.timeEntryRepository.findById(userId, entryId);
    if (!entry) {
      throw new NotFoundError('Time entry');
    }
    return entry;
  }

  /**
   * Update an entry.
   *
   * When the caller supplies an `endTime` but no `duration`, the duration is
   * derived from the (possibly unchanged) `startTime`. That derivation was
   * inline in the route, which meant `duration` and `endTime` could disagree
   * whenever a different caller wrote to the same columns — and the two drive
   * different reports, so the error would surface as an inconsistency in totals
   * rather than as a failure.
   *
   * An explicit `duration` always wins: the caller is stating the intended
   * figure, and a timer that was paused has a duration that does not equal
   * `endTime - startTime`.
   */
  async update(
    userId: UserId,
    entryId: string,
    input: UpdateTimeEntryInput
  ): Promise<TimeEntry> {
    const existing = await this.getForUser(userId, entryId);

    let duration = input.duration;
    if (duration === undefined && input.endTime) {
      const startTime = input.startTime ?? existing.startTime;
      if (startTime) {
        duration = Math.max(
          0,
          Math.round((input.endTime.getTime() - startTime.getTime()) / 60000)
        );
      }
    }

    return this.timeEntryRepository.update(userId, entryId, {
      ...input,
      duration,
    });
  }

  /** Delete an entry. Returns the deleted row so the caller can echo it back. */
  async delete(userId: UserId, entryId: string): Promise<TimeEntry> {
    await this.getForUser(userId, entryId);
    return this.timeEntryRepository.delete(userId, entryId);
  }

  /** The user's currently running entry, or `null`. */
  async findRunning(userId: UserId) {
    return this.timeEntryRepository.findRunning(userId);
  }
}

export const timeTrackingService = new TimeTrackingService();
