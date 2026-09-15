import { AuditEvent, AuditFilters } from './audit.types';
import type { PrismaClient } from '@/generated/prisma/client';

export async function logAuditEvent(
  event: AuditEvent,
  db: PrismaClient
): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: event.userId,
      action: event.action,
      entityType: event.entityType,     // ✅ Fixed
      entityId: event.entityId,         // ✅ Fixed
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      location: event.location,
    },
  });
}

export async function getAuditLog(
  filters: AuditFilters,  // ✅ Removed unused userId param
  db: PrismaClient
) {
  const where: any = {};
  
  if (filters.userId) where.userId = filters.userId;
  if (filters.action) where.action = filters.action;
  if (filters.entityType) where.entityType = filters.entityType;  // ✅ Fixed
  if (filters.entityId) where.entityId = filters.entityId;        // ✅ Fixed
  
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: filters.skip || 0,
      take: filters.take || 50,
    }),
  ]);

  return { total, logs };
}