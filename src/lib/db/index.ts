/**
 * Unified database client export
 * Re-exports the Prisma client as 'db' for consistent import patterns
 */
import prisma from '@/lib/prisma';

export const db = prisma;
export default db;