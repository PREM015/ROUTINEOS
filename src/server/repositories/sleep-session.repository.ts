import type { SleepSession, SleepStartSource } from '@prisma/client';
import { SleepSessionStatus } from '@prisma/client';
import { BaseRepository } from './base.repository';

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
  async findActive(userId: string): Promise<SleepSession | null> {
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
    userId: string,
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
  async findLatest(userId: string): Promise<SleepSession | null> {
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
    userId: string,
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
    userId: string,
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
   * Resolve a pending prompt into an ACTIVE session in one step. The
   * (userId, promptKey) unique constraint makes competing auto-start and
   * manual responses idempotent — only one session can be created per prompt.
   */
  async createFromPrompt(
    userId: string,
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
    userId: string,
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
   * Cancel all active sessions for a user (safety net / account hygiene).
   */
  async cancelAllActive(userId: string): Promise<number> {
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