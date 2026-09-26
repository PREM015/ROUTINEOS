import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { importHabits, importGoals } from '@/server/data/importer';
import { importPayloadSchema } from '@/lib/validation/import.schema';

const inactive = new Set(['projects', 'tasks', 'journalEntries', 'sleepLogs']);

/**
 * POST /api/import
 *
 * Applies an import payload (the exact shape produced by the export-side
 * `importPayloadSchema` contract, i.e. what a client sends back after
 * parsing a backup JSON). Thin handler — parity with /api/export/request:
 *
 *   - authenticates via the shared auth() session guard;
 *   - validates the whole body with the shared zod schema and rejects with
 *     400 + flattened details on mismatch (never persists unvalidated data);
 *   - delegates persistence to the importer's two real entry points —
 *     `importHabits` + `importGoals` — the only collections the importer
 *     genuinely materializes (upsert by natural key, scoped to the user);
 *   - counts *skipped* from the validated payload itself: the collections
 *     present-but-not-persisted (projects/tasks/journal/sleep) become a real
 *     number, never fabricated, never silently dropped;
 *   - responds with the standard `{ success: true, data }` envelope.
 *
 * Import is entity-merge, never wipe: nothing is ever deleted.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json().catch(() => null);
    const validated = importPayloadSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid import payload', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    let imported = 0;
    imported += await importHabits(
      session.user.id,
      validated.data.habits ?? [],
      prisma
    );
    imported += await importGoals(
      session.user.id,
      validated.data.goals ?? [],
      prisma
    );

    // Collections the importer does not persist, counted from the validated
    // payload so skipped is always a real number.
    const skipped = [...inactive].reduce((total, key) => {
      const entries = validated.data[key as keyof typeof validated.data];
      return total + (Array.isArray(entries) ? entries.length : 0);
    }, 0);

    return NextResponse.json({ success: true, data: { imported, skipped } });
  } catch (error) {
    console.error('Import failed:', error);
    return NextResponse.json(
      { error: 'Failed to import data', details: String(error) },
      { status: 500 }
    );
  }
}
