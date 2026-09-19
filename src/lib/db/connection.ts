/**
 * Database connection accessors and health checks.
 *
 * Wraps the shared Prisma singleton from `@/lib/prisma`. All connection state
 * lives in that singleton; this module only exposes typed views of it.
 */

import prisma from '@/lib/prisma';

export { prisma };

export interface ConnectionInfo {
  /** Database provider derived from the `DATABASE_URL` protocol. */
  provider: string;
  /** Database name parsed from the connection URL (redacted otherwise). */
  database: string | null;
  /** Effective pool size from `DATABASE_POOL_SIZE`, if declared. */
  poolSize: number | null;
  /** Client constructor active by default. */
  activeClient: boolean;
  /** Whether `DATABASE_URL` is present in the environment. */
  hasUrl: boolean;
}

/** Extract the connection URL from the environment (validated scheme). */
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return '';
  return /^[a-z0-9+]+:\/\//i.test(url) ? url : '';
}

/**
 * Return the shared Prisma client singleton. Prefer this over constructing a
 * new `PrismaClient` anywhere else.
 */
export function getPrismaClient(): typeof prisma {
  return prisma;
}

/**
 * Structural info about the current connection. Never exposes credentials.
 */
export function getConnectionInfo(): ConnectionInfo {
  const url = getDatabaseUrl();
  let provider = 'unknown';
  let database: string | null = null;

  if (url) {
    provider = url.split(':')[0] ?? 'unknown';
    try {
      const parsed = new URL(url);
      database = parsed.pathname.replace(/^\//, '') || null;
    } catch {
      database = null;
    }
  }

  const poolSizeRaw = Number(process.env.DATABASE_POOL_SIZE ?? 0);
  const poolSize =
    Number.isFinite(poolSizeRaw) && poolSizeRaw > 0 ? poolSizeRaw : null;

  return {
    provider,
    database,
    poolSize,
    activeClient: true,
    hasUrl: url !== '',
  };
}

/**
 * Whether the database is reachable right now. Runs `SELECT 1` and returns
 * `false` (rather than throwing) when the query fails.
 */
export async function isConnected(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Disconnect the shared Prisma client (releases the connection pool).
 * Safe to call multiple times – Prisma ignores redundant disconnects.
 */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}