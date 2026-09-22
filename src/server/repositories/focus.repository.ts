import type { FocusSession, Break, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Focus Repository
 * Database operations for FocusSession and Break models
 */

type DateFilter = Date | string;

interface CreateFocusSessionData {
  title: string;
  description?: string;
  categoryId?: string;
  plannedDuration: number;
  actualDuration?: number;
  techniques?: string[];
  energyBefore?: number;
  startedAt?: Date;
  completedAt?: Date;
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
  breakType?: string;
  quality?: number;
  notes?: string;
}

interface FocusStats {
  totalSessions: number;
  totalFocusMinutes: number;
  averageSessionMinutes: number;
  bestSessionFocusMinutes: number;
}

function toFocusDate(value?: DateFilter): Date | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? new Date(value) : value;
}

export class FocusRepository extends BaseRepository {
  /**
   * Create a focus session
   */
  async createSession(
    userId: string,
    data: CreateFocusSessionData
  ): Promise<FocusSession> {
    try {
      return await this.prisma.focusSession.create({
        data: {
          title: data.title,
          description: data.description,
          plannedDuration: data.plannedDuration,
          actualDuration: data.actualDuration,
          startedAt: data.startedAt || new Date(),
          completedAt: data.completedAt,
          energyBefore: data.energyBefore,
          techniques: data.techniques
            ? JSON.stringify(data.techniques)
            : undefined,
          category: data.categoryId
            ? { connect: { id: data.categoryId } }
            : undefined,
          user: { connect: { id: userId } },
        },
      });
    } catch (error) {
      this.handleError(error, 'createSession');
    }
  }

  /**
   * Find the active focus session for a user
   */
  async findActiveByUserId(userId: string): Promise<FocusSession | null> {
    try {
      return await this.prisma.focusSession.findFirst({
        where: { userId, completedAt: null },
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
    userId: string,
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
  async findById(userId: string, sessionId: string) {
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
   * Find focus sessions for a user with optional filters
   */
  async findSessions(
    userId: string,
    query: FocusSessionQueryParams = {}
  ) {
    try {
      const where: Prisma.FocusSessionWhereInput = { userId };

      const from = toFocusDate(query.from);
      const to = toFocusDate(query.to);
      if (from || to) {
        where.startedAt = {};
        if (from) where.startedAt.gte = from;
        if (to) where.startedAt.lte = to;
      }

      return await this.prisma.focusSession.findMany({
        where,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
          _count: {
            select: {
              breaks: true,
            },
          },
        },
        orderBy: { startedAt: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findSessions');
    }
  }

  /**
   * Update a focus session
   */
  async update(
    sessionId: string,
    userId: string,
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
  async delete(userId: string, sessionId: string): Promise<FocusSession> {
    try {
      return await this.prisma.focusSession.delete({
        where: { id: sessionId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  /**
   * Get aggregate focus stats for a user in a date range
   */
  async getStats(
    userId: string,
    from?: DateFilter,
    to?: DateFilter
  ): Promise<FocusStats> {
    try {
      const where: Prisma.FocusSessionWhereInput = {
        userId,
        completedAt: { not: null },
        actualDuration: { not: null },
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
   * Create a break (optionally linked to a focus session)
   */
  async createBreak(userId: string, data: CreateBreakData): Promise<Break> {
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
  async findBreakById(userId: string, breakId: string) {
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
    userId: string,
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