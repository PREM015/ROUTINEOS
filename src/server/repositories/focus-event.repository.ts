import type { FocusSessionEvent, FocusEventType, Prisma } from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * Focus Session Event Repository
 *
 * The append-only lifecycle log: START, PAUSE, RESUME, EXTEND, DISTRACTION, NOTE,
 * END and PAUSE_REASON.
 *
 * Why this is a table and not a column or a derived value:
 *
 *   - Paused time cannot be made exact without it. `pausedTotalSeconds` is a
 *     denormalised running total; if it ever drifts, the event log is the record
 *     that can rebuild it.
 *   - "How often am I interrupted, and for how long" is unanswerable from a total.
 *   - Multi-device reconciliation needs an ordered trail. Two devices writing
 *     concurrently produce a merged, timestamped history that shows who did what,
 *     rather than a last-write-wins column that shows only the last writer.
 *
 * Every method here takes `userId` explicitly rather than deriving it from the
 * session, so a caller cannot read or write another user's events by guessing a
 * session id.
 */

export interface CreateFocusEventData {
  focusSessionId: string;
  type: FocusEventType;
  occurredAt?: Date;
  label?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
}

export class FocusSessionEventRepository extends BaseRepository {
  /**
   * Append one event.
   *
   * `userId` is taken from the caller and the session is *not* re-read to derive
   * it: an insert is the cheapest possible write, and this sits on the hot path
   * (every pause, resume and distraction tap). Ownership of the session is
   * asserted by the service before it gets here.
   */
  async create(userId: UserId, data: CreateFocusEventData): Promise<FocusSessionEvent> {
    try {
      return await this.prisma.focusSessionEvent.create({
        data: {
          userId,
          focusSessionId: data.focusSessionId,
          type: data.type,
          occurredAt: data.occurredAt ?? new Date(),
          label: data.label ?? null,
          note: data.note ?? null,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Append several events in one call.
   *
   * Used when a single user action implies several log rows — completing a
   * session writes an END and, when ratings were supplied, a NOTE. `createMany`
   * so the action stays one round trip; a partial write would leave a session with
   * an END and no explanation.
   */
  async createMany(
    userId: UserId,
    events: CreateFocusEventData[]
  ): Promise<number> {
    if (events.length === 0) return 0;
    try {
      const result = await this.prisma.focusSessionEvent.createMany({
        data: events.map((event) => ({
          userId,
          focusSessionId: event.focusSessionId,
          type: event.type,
          occurredAt: event.occurredAt ?? new Date(),
          label: event.label ?? null,
          note: event.note ?? null,
          metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        })),
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'createMany');
    }
  }

  /** The ordered timeline for one session, for the detail sheet. */
  async listForSession(
    userId: UserId,
    focusSessionId: string
  ): Promise<FocusSessionEvent[]> {
    try {
      return await this.prisma.focusSessionEvent.findMany({
        where: { userId, focusSessionId },
        orderBy: { occurredAt: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'listForSession');
    }
  }

  /**
   * Count events of a kind for a session.
   *
   * Used to reconcile the denormalised `distractionCount` and `pauseCount` on the
   * session row against the log that is supposed to be authoritative.
   */
  async countByType(
    userId: UserId,
    focusSessionId: string,
    type: FocusEventType
  ): Promise<number> {
    try {
      return await this.prisma.focusSessionEvent.count({
        where: { userId, focusSessionId, type },
      });
    } catch (error) {
      this.handleError(error, 'countByType');
    }
  }

  /**
   * The most common distraction labels for a user over a window.
   *
   * Grouped in the database rather than by loading every event and counting in JS:
   * a heavy user accumulates one of these per distraction tap, which is exactly
   * the shape of data that turns a naive implementation into a timeout.
   */
  async topLabels(
    userId: UserId,
    type: FocusEventType,
    from: Date,
    limit = 8
  ): Promise<Array<{ label: string; count: number }>> {
    try {
      const grouped = await this.prisma.focusSessionEvent.groupBy({
        by: ['label'],
        where: {
          userId,
          type,
          label: { not: null },
          occurredAt: { gte: from },
        },
        _count: { label: true },
        orderBy: { _count: { label: 'desc' } },
        take: limit,
      });
      return grouped
        .filter((row): row is typeof row & { label: string } => row.label !== null)
        .map((row) => ({ label: row.label, count: row._count.label }));
    } catch (error) {
      this.handleError(error, 'topLabels');
    }
  }

  /** Delete every event for a session. Cascades handle this in the schema too. */
  async deleteForSession(userId: UserId, focusSessionId: string): Promise<number> {
    try {
      const result = await this.prisma.focusSessionEvent.deleteMany({
        where: { userId, focusSessionId },
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'deleteForSession');
    }
  }

  /**
   * Pause spans derived from the log.
   *
   * The source of truth for paused time, used to rebuild `pausedTotalSeconds` if
   * the denormalised column is ever found to disagree with the trail.
   */
  async pauseSpans(
    userId: UserId,
    focusSessionId: string
  ): Promise<Array<{ startedAt: Date; endedAt: Date | null }>> {
    try {
      const events = await this.prisma.focusSessionEvent.findMany({
        where: { userId, focusSessionId, type: { in: ['PAUSE', 'RESUME'] } },
        orderBy: { occurredAt: 'asc' },
        select: { type: true, occurredAt: true },
      });

      const spans: Array<{ startedAt: Date; endedAt: Date | null }> = [];
      let open: Date | null = null;
      for (const event of events) {
        if (event.type === 'PAUSE') {
          // Two pauses with no resume between them means a lost RESUME, not a
          // second pause. Ignoring the later one keeps the span correct instead of
          // recording a zero-length gap and an over-count.
          if (open === null) open = event.occurredAt;
        } else if (open !== null) {
          spans.push({ startedAt: open, endedAt: event.occurredAt });
          open = null;
        }
      }
      // An unclosed trailing span is a pause that was never resumed — which is
      // what an abandoned session looks like.
      if (open !== null) spans.push({ startedAt: open, endedAt: null });
      return spans;
    } catch (error) {
      this.handleError(error, 'pauseSpans');
    }
  }

  /** Total paused seconds implied by the log. */
  async totalPausedSeconds(
    userId: UserId,
    focusSessionId: string,
    openEndedAt?: Date
  ): Promise<number> {
    const spans = await this.pauseSpans(userId, focusSessionId);
    const total = spans.reduce((sum, span) => {
      const end = span.endedAt ?? openEndedAt;
      return end === undefined ? sum : sum + Math.max(0, end.getTime() - span.startedAt.getTime());
    }, 0);
    return Math.round(total / 1000);
  }

  /** Escape hatch for callers that need the raw delegate. */
  protected get client(): Prisma.TransactionClient | typeof this.prisma {
    return this.prisma;
  }
}
