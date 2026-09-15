import { AuditAction } from '@/generated/prisma/client';

export { AuditAction }; // Re-export Prisma enum

export interface AuditEvent {
  userId: string;
  action: AuditAction;
  entityType: string;    // ✅ Changed from resourceType
  entityId?: string;     // ✅ Changed from resourceId
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  location?: string;
}

export interface AuditFilters {
  userId?: string;
  action?: AuditAction;
  entityType?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  skip?: number;
  take?: number;
}