import type { Prisma, TimeEntry } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Time Entry Repository
 * Database operations for the TimeEntry model
 */

type DateFilter = Date | string;

interface CreateTimeEntryData {
  description: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  projectId?: string;
  habitId?: string;
  goalId?: string;
  billable?: boolean;
  rate?: number;
  tags?: string[];
  isAutomatic?: boolean;
}

interface UpdateTimeEntryData {
  description?: string;
  startTime?: Date;
  endTime?: Date | null;
  duration?: number;
  projectId?: string | null;
  habitId?: string | null;
  goalId?: string | null;
  billable?: boolean;
  rate?: number;
  tags?: string[];
}

interface TimeEntryQueryParams {
  from?: DateFilter;
  to?: DateFilter;
  projectId?: string;
  goalId?: string;
  habitId?: string;
  billable?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

function toDate(value?: DateFilter): Date | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? new Date(value) : value;
}

function computeDuration(startTime: Date, endTime: Date): number {
  return Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 60000));
}

const ENTRY_INCLUDES = {
  project: { select: { id: true, name: true, color: true } },
  habit: { select: { id: true, name: true } },
  goal: { select: { id: true, title: true } },
} satisfies Prisma.TimeEntryInclude;

export class TimeEntryRepository extends BaseRepository {
  /**
   * Create a manual or started time entry for a user
   */
  async create(userId: string, data: CreateTimeEntryData): Promise<TimeEntry> {
    try {
      const startTime = data.startTime ?? new Date();
      let endTime = data.endTime;
      let duration = data.duration;

      if (endTime && duration === undefined && endTime.getTime() >= startTime.getTime()) {
        duration = computeDuration(startTime, endTime);
      } else if (!endTime && duration !== undefined && duration > 0) {
        endTime = new Date(startTime.getTime() + duration * 60000);
      }

      return await this.prisma.timeEntry.create({
        data: {
          userId,
          description: data.description,
          startTime,
          endTime,
          duration,
          projectId: data.projectId,
          habitId: data.habitId,
          goalId: data.goalId,
          billable: data.billable ?? false,
          rate: data.rate,
          tags: data.tags && data.tags.length > 0 ? JSON.stringify(data.tags) : undefined,
          isAutomatic: data.isAutomatic ?? false,
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Find a time entry by ID with an ownership check
   */
  async findById(userId: string, entryId: string) {
    try {
      return await this.prisma.timeEntry.findFirst({
        where: { id: entryId, userId },
        include: ENTRY_INCLUDES,
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Find the currently running (unended) time entry for a user
   */
  async findRunning(userId: string) {
    try {
      return await this.prisma.timeEntry.findFirst({
        where: { userId, endTime: null },
        include: ENTRY_INCLUDES,
        orderBy: { startTime: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findRunning');
    }
  }

  /**
   * Update a time entry owned by the user
   */
  async update(
    userId: string,
    entryId: string,
    data: UpdateTimeEntryData
  ): Promise<TimeEntry> {
    try {
      return await this.prisma.timeEntry.update({
        where: { id: entryId, userId },
        data: {
          description: data.description,
          startTime: data.startTime,
          endTime: data.endTime,
          duration: data.duration,
          projectId: data.projectId,
          habitId: data.habitId,
          goalId: data.goalId,
          billable: data.billable,
          rate: data.rate,
          tags:
            data.tags === undefined ? undefined : JSON.stringify(data.tags),
        },
        include: ENTRY_INCLUDES,
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Stop the running time entry, setting endTime and computed duration.
   * Returns `null` when there is nothing running.
   */
  async stopRunning(userId: string, endTime: Date = new Date()) {
    try {
      const running = await this.findRunning(userId);
      if (!running || !running.startTime) return null;

      const duration = computeDuration(running.startTime, endTime);
      return await this.prisma.timeEntry.update({
        where: { id: running.id, userId },
        data: { endTime, duration },
        include: ENTRY_INCLUDES,
      });
    } catch (error) {
      this.handleError(error, 'stopRunning');
    }
  }

  /**
   * Delete a time entry owned by the user
   */
  async delete(userId: string, entryId: string): Promise<TimeEntry> {
    try {
      return await this.prisma.timeEntry.delete({
        where: { id: entryId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  /**
   * List time entries for a user with optional filters
   */
  async list(userId: string, query: TimeEntryQueryParams = {}) {
    try {
      const where: Prisma.TimeEntryWhereInput = { userId };

      const from = toDate(query.from);
      const to = toDate(query.to);
      if (from || to) {
        where.startTime = {};
        if (from) where.startTime.gte = from;
        if (to) where.startTime.lte = to;
      }

      if (query.projectId) where.projectId = query.projectId;
      if (query.goalId) where.goalId = query.goalId;
      if (query.habitId) where.habitId = query.habitId;
      if (query.billable !== undefined) where.billable = query.billable;
      if (query.search && query.search.length > 0) {
        where.description = { contains: query.search, mode: 'insensitive' };
      }

      return await this.prisma.timeEntry.findMany({
        where,
        include: ENTRY_INCLUDES,
        orderBy: { startTime: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'list');
    }
  }

  /**
   * Count time entries for a user with the same filters as `list`
   */
  async count(userId: string, query: TimeEntryQueryParams = {}): Promise<number> {
    try {
      const where: Prisma.TimeEntryWhereInput = { userId };

      const from = toDate(query.from);
      const to = toDate(query.to);
      if (from || to) {
        where.startTime = {};
        if (from) where.startTime.gte = from;
        if (to) where.startTime.lte = to;
      }

      if (query.projectId) where.projectId = query.projectId;
      if (query.goalId) where.goalId = query.goalId;
      if (query.habitId) where.habitId = query.habitId;
      if (query.billable !== undefined) where.billable = query.billable;
      if (query.search && query.search.length > 0) {
        where.description = { contains: query.search, mode: 'insensitive' };
      }

      return await this.prisma.timeEntry.count({ where });
    } catch (error) {
      this.handleError(error, 'count');
    }
  }
}