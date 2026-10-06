import type { SleepSession, SleepStartSource } from '@/generated/prisma';
import { SleepSessionStatus } from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * Sleep Session Repository
 * Database operations for the SleepSession model (auto-tracked sleep).
 * A user has at most one ACTIVE session; completed sessions persist as
 * historical records. Optional promptKey ties a session to the per-day
 * sleep prompt (unique per user) so auto-starts are idempotent.
 */

export interface CreateSleepSessionInput {
  startedAt: Date;
  source?: SleepStartSource;
  promptKey?: string | null;
}

export class SleepSessionRepository extends BaseRepository {
  /**
   * Find the active (running) sleep session for a user.
   */
  async findActive(userId: UserId): Promise<SleepSession | null> {
    try {
      return await this.prisma.sleepSession.findFirst({
        where: { userId, status: SleepSessionStatus.ACTIVE },
        orderBy: { startedAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findActive');
    }
  }

  /**
   * Find a session created from a given prompt key (idempotency guard).
   */
  async findByPromptKey(
    userId: UserId,
    promptKey: string
  ): Promise<SleepSession | null> {
    try {
      return await this.prisma.sleepSession.findUnique({
        where: { userId_promptKey: { userId, promptKey } },
      });
    } catch (error) {
      this.handleError(error, 'findByPromptKey');
    }
  }

  /**
   * Find the latest sleep session for a user (ended or not).
   */
  async findLatest(userId: UserId): Promise<SleepSession | null> {
    try {
      return await this.prisma.sleepSession.findFirst({
        where: { userId },
        orderBy: { startedAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findLatest');
    }
  }

  /**
   * Find sleep sessions whose start falls within [from, to].
   */
  async findByRange(
    userId: UserId,
    from: Date,
    to: Date
  ): Promise<SleepSession[]> {
    try {
      return await this.prisma.sleepSession.findMany({
        where: {
          userId,
          startedAt: { gte: from, lte: to },
        },
        orderBy: { startedAt: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findByRange');
    }
  }

/**
   * Create a new sleep session.
   */
  async create(
    userId: UserId,
    input: CreateSleepSessionInput
  ): Promise<SleepSession> {
    try {
      return await this.prisma.sleepSession.create({
        data: {
          userId,
          startedAt: input.startedAt,
          source: input.source ?? 'MANUAL' as SleepStartSource,
          promptKey: input.promptKey ?? null,
          status: SleepSessionStatus.ACTIVE,
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Create an ACTIVE session only if the user has none, atomically.
   *
   * The caller's "find active, else create" sequence is a check-then-act race:
   * two concurrent requests (a double-clicked button, or a push-action
   * `respond` arriving alongside a manual start) both observe no active session
   * and both insert. The schema cannot prevent it either — `@@unique([userId,
   * promptKey])` has a **nullable** `promptKey`, and Postgres treats NULLs as
   * distinct in a unique index, so every manual session (`promptKey: null`) is
   * unconstrained.
   *
   * A single conditional `INSERT ... SELECT ... WHERE NOT EXISTS` is one
   * statement, so the database serialises it and exactly one row can win.
   * `count === 0` means somebody else got there first, and their session is
   * returned instead of creating a second.
   */
  async createIfNoneActive(
    userId: UserId,
    input: CreateSleepSessionInput
  ): Promise<{ session: SleepSession; created: boolean }> {
    const startedAt = input.startedAt ?? new Date();
    const source = input.source ?? ('MANUAL' as SleepStartSource);
    const promptKey = input.promptKey ?? null;

    const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "SleepSession" ("id", "userId", "startedAt", "status", "source", "promptKey", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, ${userId}::text, ${startedAt}, 'ACTIVE'::"SleepSessionStatus", ${source}::"SleepStartSource", ${promptKey}, NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM "SleepSession" WHERE "userId" = ${userId}::text AND "status" = 'ACTIVE'::"SleepSessionStatus"
      )
      RETURNING "id"
    `;

    const insertedId = inserted[0]?.id;
    if (insertedId) {
      const session = await this.prisma.sleepSession.findUniqueOrThrow({
        where: { id: insertedId },
      });
      return { session, created: true };
    }

    // Lost the race — adopt the winner rather than duplicating it.
    const existing = await this.findActive(userId);
    if (!existing) {
      throw new Error('Sleep session insert raced and no active session could be read back');
    }
    return { session: existing, created: false };
  }

  /**
   * Resolve a pending prompt into an ACTIVE session in one step. The
   * (userId, promptKey) unique constraint makes competing auto-start and
   * manual responses idempotent — only one session can be created per prompt.
   */
  async createFromPrompt(
    userId: UserId,
    promptKey: string,
    startedAt: Date,
    source: SleepStartSource
  ): Promise<SleepSession | null> {
    try {
      return await this.prisma.sleepSession.create({
        data: {
          userId,
          startedAt,
          source,
          promptKey,
          status: SleepSessionStatus.ACTIVE,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return null;
      }
      this.handleError(error, 'createFromPrompt');
    }
  }

  /**
   * End an active sleep session, filling duration (minutes) and status.
   */
  async end(
    userId: UserId,
    sessionId: string,
    endedAt: Date,
    durationMinutes: number
  ): Promise<SleepSession> {
    try {
      return await this.prisma.sleepSession.update({
        where: { id: sessionId, userId },
        data: {
          endedAt,
          durationMinutes,
          status: SleepSessionStatus.COMPLETED,
        },
      });
    } catch (error) {
      this.handleError(error, 'end');
    }
  }

/**
   * Cancel exactly one ACTIVE session, scoped to its owner.
   *
   * `cancelAllActive` is an `updateMany` over every ACTIVE row, so using it to
   * clear one stranded session also discards a sibling that is legitimately
   * running. Prefer this when a specific session has been identified as stale.
   */
  async cancelSession(sessionId: string, userId: UserId): Promise<number> {
    try {
      const result = await this.prisma.sleepSession.updateMany({
        where: { id: sessionId, userId, status: SleepSessionStatus.ACTIVE },
        data: { status: SleepSessionStatus.CANCELLED },
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'cancelSession');
    }
  }

  /**
   * Cancel all active sessions for a user (safety net / account hygiene).
   */
  async cancelAllActive(userId: UserId): Promise<number> {
    try {
      const result = await this.prisma.sleepSession.updateMany({
        where: { userId, status: SleepSessionStatus.ACTIVE },
        data: { status: SleepSessionStatus.CANCELLED },
      });
      return result.count;
    } catch (error) {
      this.handleError(error, 'cancelAllActive');
    }
  }
}
