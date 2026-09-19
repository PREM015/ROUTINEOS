import type { AuditLog, ActivityLog, Prisma, AuditAction } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Audit Repository
 * Database operations for audit and activity logs
 */

interface AuditEntryInput {
  userId?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: string | Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  location?: string;
}

interface AuditQueryOptions {
  limit?: number;
  offset?: number;
  action?: AuditAction;
  from?: Date | string;
  to?: Date | string;
}

interface ActivityEntryInput {
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  description?: string;
  metadata?: string | Record<string, unknown>;
  timestamp?: Date;
}

function toAuditDate(value?: Date | string): Date | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? new Date(value) : value;
}

function toAuditMetadata(value?: string | Record<string, unknown>): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export class AuditRepository extends BaseRepository {
  /**
   * Create an audit log entry
   */
  async create(entry: AuditEntryInput): Promise<AuditLog> {
    try {
      if (!entry.userId) {
        throw new Error('userId is required to create an audit log');
      }

      return await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadata: toAuditMetadata(entry.metadata),
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          location: entry.location,
          user: { connect: { id: entry.userId } },
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Find audit logs for a user with optional filters
   */
  async findByUserId(
    userId: string,
    query: AuditQueryOptions = {}
  ): Promise<AuditLog[]> {
    try {
      const where: Prisma.AuditLogWhereInput = { userId };

      if (query.action) {
        where.action = query.action;
      }

      const from = toAuditDate(query.from);
      const to = toAuditDate(query.to);
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = from;
        if (to) where.createdAt.lte = to;
      }

      return await this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findByUserId');
    }
  }

  /**
   * Find all audit logs with optional filters
   */
  async findAll(query: AuditQueryOptions = {}): Promise<AuditLog[]> {
    try {
      const where: Prisma.AuditLogWhereInput = {};

      if (query.action) {
        where.action = query.action;
      }

      const from = toAuditDate(query.from);
      const to = toAuditDate(query.to);
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = from;
        if (to) where.createdAt.lte = to;
      }

      return await this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  /**
   * Count audit logs grouped by action within a date range
   */
  async countByAction(
    from?: Date | string,
    to?: Date | string
  ): Promise<Record<AuditAction, number>> {
    try {
      const where: Prisma.AuditLogWhereInput = {};
      const fromDate = toAuditDate(from);
      const toDate = toAuditDate(to);
      if (fromDate || toDate) {
        where.createdAt = {};
        if (fromDate) where.createdAt.gte = fromDate;
        if (toDate) where.createdAt.lte = toDate;
      }

      const groups = await this.prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: true,
      });

      const result = {} as Record<AuditAction, number>;
      for (const group of groups) {
        result[group.action] = group._count;
      }

      return result;
    } catch (error) {
      this.handleError(error, 'countByAction');
    }
  }

  /**
   * Get most recent audit logs
   */
  async recent(limit?: number): Promise<AuditLog[]> {
    try {
      return await this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        ...this.buildPaginationQuery(limit),
      });
    } catch (error) {
      this.handleError(error, 'recent');
    }
  }

  /**
   * Create an activity log entry
   */
  async createActivity(entry: ActivityEntryInput): Promise<ActivityLog> {
    try {
      return await this.prisma.activityLog.create({
        data: {
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          description: entry.description,
          metadata: toAuditMetadata(entry.metadata),
          timestamp: entry.timestamp,
          user: { connect: { id: entry.userId } },
        },
      });
    } catch (error) {
      this.handleError(error, 'createActivity');
    }
  }

  /**
   * Find activity logs for a user with optional filters
   */
  async findActivityLogs(
    userId: string,
    query: { limit?: number; offset?: number; from?: Date | string; to?: Date | string } = {}
  ): Promise<ActivityLog[]> {
    try {
      const where: Prisma.ActivityLogWhereInput = { userId };

      const from = toAuditDate(query.from);
      const to = toAuditDate(query.to);
      if (from || to) {
        where.timestamp = {};
        if (from) where.timestamp.gte = from;
        if (to) where.timestamp.lte = to;
      }

      return await this.prisma.activityLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findActivityLogs');
    }
  }
}