/**
 * Scheduled data-maintenance operations.
 *
 * Idempotent cleanup jobs for expired tokens, orphaned/deleted-user data, old
 * log rows and soft-deleted accounts. Each function returns the number of rows
 * affected so callers can report/audit the result.
 */

import prisma from '@/lib/prisma';

const MS_PER_DAY = 86_400_000;

/**
 * Delete expired password-reset and email-verification tokens.
 */
export async function cleanupExpiredTokens(): Promise<{
  passwordResetTokens: number;
  emailVerificationTokens: number;
}> {
  const now = new Date();
  const [passwordResetTokens, emailVerificationTokens] = await Promise.all([
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.emailVerificationToken.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
  ]);
  return {
    passwordResetTokens: passwordResetTokens.count,
    emailVerificationTokens: emailVerificationTokens.count,
  };
}

/** Child tables wiped for soft-deleted users (order matters, children first). */
const ORPHAN_TABLES = [
  'passwordResetToken',
  'emailVerificationToken',
  'deviceSession',
  'notificationLog',
  'pushSubscription',
  'attachment',
  'dataExport',
  'auditLog',
  'activityLog',
] as const;

interface DeleteManyDelegate {
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
}

/**
 * Remove data belonging to users already flagged as deleted
 * (`isDeleted: true`). The user rows themselves are removed last, so every
 * associating row is explicitly wiped first (FK-cascade is a backstop).
 */
export async function cleanupOrphanedData(): Promise<{
  deletedUserIds: number;
  deletedRows: number;
}> {
  const users = await prisma.user.findMany({
    where: { isDeleted: true },
    select: { id: true },
    take: 100,
  });
  const ids = users.map((user) => user.id);
  if (ids.length === 0) return { deletedUserIds: 0, deletedRows: 0 };

  const inIds = { in: ids };
  const all = prisma as unknown as Record<string, unknown>;
  let deletedRows = 0;

  for (const table of ORPHAN_TABLES) {
    const delegate = all[table] as DeleteManyDelegate | undefined;
    if (!delegate) continue;
    try {
      deletedRows += (await delegate.deleteMany({ where: { userId: inIds } }))
        .count;
    } catch {
      // Non-critical table; continue the sweep.
    }
  }

  const deleted = await prisma.user.deleteMany({ where: { id: inIds } });
  return { deletedUserIds: deleted.count, deletedRows };
}

/**
 * Delete audit/activity log rows older than a retention window.
 */
export async function cleanupOldLogs(days: number): Promise<{
  auditLogs: number;
  activityLogs: number;
}> {
  const cutoff = new Date(Date.now() - Math.max(0, days) * MS_PER_DAY);
  const [auditLogs, activityLogs] = await Promise.all([
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.activityLog.deleteMany({ where: { timestamp: { lt: cutoff } } }),
  ]);
  return {
    auditLogs: auditLogs.count,
    activityLogs: activityLogs.count,
  };
}

/**
 * Hard-delete accounts that were soft-deleted more than `daysAgo` days.
 */
export async function cleanupSoftDeleted(daysAgo: number): Promise<number> {
  const cutoff = new Date(Date.now() - Math.max(0, daysAgo) * MS_PER_DAY);
  const users = await prisma.user.findMany({
    where: { isDeleted: true, deletedAt: { not: null, lt: cutoff } },
    select: { id: true },
    take: 100,
  });
  const ids = users.map((user) => user.id);
  if (ids.length === 0) return 0;

  const deleted = await prisma.user.deleteMany({
    where: { id: { in: ids } },
  });
  return deleted.count;
}