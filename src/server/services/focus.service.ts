import { FocusRepository } from '@/server/repositories/focus.repository';
import { BreakRepository } from '@/server/repositories/break.repository';
import { getFocusSessionStatus } from '@/types/focus';
import { nextBreakAt } from '@/lib/focus/break-scheduler';
import type { createFocusSessionSchema, focusQuerySchema, createBreakSchema, breakQuerySchema } from '@/schemas/focus.schema';
import type { z } from 'zod';

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
type CreateBreakInput = z.infer<typeof createBreakSchema>;
type BreakQuery = z.infer<typeof breakQuerySchema>;

export class FocusService {
  private focusRepository: FocusRepository;
  private breakRepository: BreakRepository;

  constructor() {
    this.focusRepository = new FocusRepository();
    this.breakRepository = new BreakRepository();
  }

  /**
   * The user's current focus session, or null.
   *
   * A session only counts as current when it started today; a session left
   * running from a previous day is treated as stale.
   */
  async getActiveSession(userId: string, now: Date = new Date()) {
    const active = await this.focusRepository.findActiveByUserId(userId);
    if (!active) return null;

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    if (active.startedAt < startOfToday || active.startedAt >= endOfToday) {
      return null;
    }

    return { ...active, status: getFocusSessionStatus(active) };
  }

  /**
   * Focus sessions for a date range, each annotated with its derived status and
   * optionally filtered by that status.
   *
   * `ACTIVE` and `IN_PROGRESS` both mean "still running", so they are treated
   * as the same filter value.
   */
  async listSessions(userId: string, query: FocusQuery) {
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
   */
  async createSession(userId: string, input: CreateFocusSessionInput) {
    if ('type' in input) {
      const titles: Record<typeof input.type, string> = {
        focus: 'Focus session',
        'short-break': 'Short break',
        'long-break': 'Long break',
        stopwatch: 'Stopwatch session',
      };
      return this.focusRepository.createSession(userId, {
        title: titles[input.type],
        plannedDuration: Math.max(1, Math.round(input.plannedSeconds / 60)),
        actualDuration: Math.max(0, Math.round(input.actualSeconds / 60)),
        techniques: input.type === 'focus' ? ['Pomodoro'] : undefined,
        startedAt: input.startedAt ?? new Date(),
        completedAt:
          input.completed === true ? (input.endedAt ?? new Date()) : undefined,
      });
    }

    return this.focusRepository.createSession(userId, {
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
   * Breaks for a date/type range, plus the ISO timestamp of the next scheduled
   * break if a focus session is currently running.
   *
   * The scheduled-break hint is best-effort: a failure to compute it never
   * fails the listing.
   */
  async listBreaks(userId: string, query: BreakQuery) {
    const [breaks, total] = await Promise.all([
      this.breakRepository.list(userId, query),
      this.breakRepository.count(userId, query),
    ]);

    let nextScheduledBreak: string | null = null;
    try {
      const active = await this.focusRepository.findActiveByUserId(userId);
      if (active) {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1
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
  async createBreak(userId: string, input: CreateBreakInput) {
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
}

export const focusService = new FocusService();
