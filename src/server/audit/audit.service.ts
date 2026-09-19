import prisma from '@/lib/prisma';
import type { AuditAction } from '@prisma/client';

/**
 * Audit Service
 * Comprehensive activity and security auditing
 */

interface AuditLogInput {
  userId: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  location?: string;
}

export class AuditService {
  /**
   * Log audit event
   */
  async log(input: AuditLogInput): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: input.userId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          location: input.location,
        },
      });
    } catch (error) {
      // Don't throw on audit log failure
      console.error('Failed to create audit log:', error);
    }
  }

  /**
   * Get audit logs for user
   */
  async getUserLogs(
    userId: string,
    options?: {
      action?: AuditAction | AuditAction[];
      entityType?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ) {
    const where: any = { userId };

    if (options?.action) {
      where.action = Array.isArray(options.action)
        ? { in: options.action }
        : options.action;
    }

    if (options?.entityType) {
      where.entityType = options.entityType;
    }

    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = options.startDate;
      if (options.endDate) where.createdAt.lte = options.endDate;
    }

    return await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 100,
      skip: options?.offset || 0,
    });
  }

  /**
   * Get security events
   */
  async getSecurityEvents(userId: string, limit: number = 50) {
    const securityActions: AuditAction[] = [
      'LOGIN_FAILED',
      'LOGIN_SUCCESS',
      'ACCOUNT_LOCKED',
      'PASSWORD_RESET_REQUESTED',
      'PASSWORD_RESET_COMPLETED',
      'LOGOUT_ALL_SESSIONS',
      'EMAIL_VERIFIED',
    ];

    return await prisma.auditLog.findMany({
      where: {
        userId,
        action: { in: securityActions },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Track entity changes
   */
  async getEntityHistory(
    userId: string,
    entityType: string,
    entityId: string
  ) {
    return await prisma.auditLog.findMany({
      where: {
        userId,
        entityType,
        entityId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get failed login attempts
   */
  async getFailedLoginAttempts(
    userId: string,
    since: Date = new Date(Date.now() - 24 * 60 * 60 * 1000)
  ) {
    return await prisma.auditLog.count({
      where: {
        userId,
        action: 'LOGIN_FAILED',
        createdAt: { gte: since },
      },
    });
  }

  /**
   * Bulk log activity
   */
  async logActivity(
    userId: string,
    action: string,
    description?: string,
    metadata?: Record<string, any>
  ) {
    try {
      await prisma.activityLog.create({
        data: {
          userId,
          action,
          description,
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });
    } catch (error) {
      console.error('Failed to create activity log:', error);
    }
  }
}

// Export singleton
export const auditService = new AuditService();