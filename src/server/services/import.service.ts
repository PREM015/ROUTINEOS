import prisma from '@/lib/prisma';
import { importHabits, importGoals } from '@/server/data/importer';
import type { z } from 'zod';
import type { importPayloadSchema } from '@/lib/validation/import.schema';
import type { UserId } from '@/types/ids';

/**
 * Import Service
 *
 * Owns the Prisma client handle that the importer functions require.
 *
 * The importer in `server/data/importer.ts` accepts a `PrismaClient` so it can
 * be reused outside a request. Previously the API route imported the singleton
 * itself and passed it in, which put database access in the route layer. The
 * route now just validates and delegates.
 */

/** Collections the importer does not persist. */
const UNSUPPORTED_COLLECTIONS = [
  'projects',
  'tasks',
  'journalEntries',
  'sleepLogs',
] as const;

export type ImportPayload = z.infer<typeof importPayloadSchema>;

export class ImportService {
  /**
   * Apply an import payload.
   *
   * Import is entity-merge, never wipe: nothing is ever deleted. Returns the
   * number of rows actually written and the number of entries that were
   * accepted by validation but not persisted (because the importer does not
   * materialise those collections) — counted from the payload, never
   * fabricated.
   */
  async importUserData(
    userId: UserId,
    payload: ImportPayload
  ): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    imported += await importHabits(userId, payload.habits ?? [], prisma);
    imported += await importGoals(userId, payload.goals ?? [], prisma);

    const skipped = UNSUPPORTED_COLLECTIONS.reduce((total, key) => {
      const entries = payload[key];
      return total + (Array.isArray(entries) ? entries.length : 0);
    }, 0);

    return { imported, skipped };
  }
}

export const importService = new ImportService();
