import type { Break, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Break Repository
 * Database operations for the Break model
 */

type DateFilter = Date | string;

interface CreateBreakData {
  focusSessionId?: string;
  startedAt?: Date;
  endedAt?: Date;
  durationMinutes?: number;
  breakType?: string;
  quality?: number;
  notes?: string;
}

interface BreakQueryParams {
  from?: DateFilter;
  to?: DateFilter;
  breakType?: string;
  limit?: number;
  offset?: number;
}

function toDate(value?: DateFilter): Date | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? new Date(value) : value;
}

function buildDateRange(
  from?: DateFilter,
  to?: DateFilter
): Prisma.DateTimeFilter | undefined {
  const fromDate = toDate(from);
  const toDate = toDate(to);
  if (!fromDate && !toDate) return undefined;

  const filter: Prisma.DateTimeFilter = {};
  if (fromDate) filter.gte = fromDate;
  if (toDate) filter.lte = toDate;
  return filter;
}

export class BreakRepository extends BaseRepository {
  /**
   * Create a break for a user, optionally linked to one of their focus sessions
   */
  async create(userId: string, data: CreateBreakData): Promise<Break> {
    try {
      if (data.focusSessionId) {
        const owner = await this.prisma.focusSession.findFirst({
          where: { id: data.focusSessionId, userId },
          select: { id: true },
        });

        if (!owner) {
          return this.handleError(
            new Error(`Focus session ${data.focusSessionId} not found for user`),
            'create'
          );
        }
      }

      const startedAt = data.startedAt ?? new Date();
      let endedAt = data.endedAt;
      let durationMinutes = data.durationMinutes;

      if (endedAt && durationMinutes === undefined) {
        durationMinutes = Math.max(
          0,
          Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)
        );
      } else if (!endedAt && durationMinutes !== undefined && durationMinutes > 0) {
        endedAt = new Date(startedAt.getTime() + durationMinutes * 60000);
      }

      return await this.prisma.break.create({
        data: {
          userId,
          focusSessionId: data.focusSessionId,
          startedAt,
          endedAt,
          durationMinutes,
          breakType: data.breakType,
          quality: data.quality,
          notes: data.notes,
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Find a break by ID with an ownership check
   */
  async findById(userId: string, breakId: string): Promise<Break | null> {
    try {
      return await this.prisma.break.findFirst({
        where: { id: breakId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * List breaks for a user with optional filters
   */
  async list(userId: string, query: BreakQueryParams = {}): Promise<Break[]> {
    try {
      const where: Prisma.BreakWhereInput = { userId };

      const dateRange = buildDateRange(query.from, query.to);
      if (dateRange) where.startedAt = dateRange;
      if (query.breakType) where.breakType = query.breakType;

      return await this.prisma.break.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'list');
    }
  }

  /**
   * Count breaks for a user with optional filters
   */
  async count(userId: string, query: BreakQueryParams = {}): Promise<number> {
    try {
      const where: Prisma.BreakWhereInput = { userId };

      const dateRange = buildDateRange(query.from, query.to);
      if (dateRange) where.startedAt = dateRange;
      if (query.breakType) where.breakType = query.breakType;

      return await this.prisma.break.count({ where });
    } catch (error) {
      this.handleError(error, 'count');
    }
  }
}