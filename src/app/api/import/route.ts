import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { importService } from '@/server/services/import.service';
import { importPayloadSchema } from '@/lib/validation/import.schema';
import { userIdFromSession } from '@/types/ids';

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
 *   - delegates persistence to ImportService, which owns the Prisma client
 *     handle the importer needs and reports imported/skipped counts;
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

    const result = await importService.importUserData(
      userIdFromSession(session),
      validated.data
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Import failed:', error);
    return NextResponse.json(
      { error: 'Failed to import data', details: String(error) },
      { status: 500 }
    );
  }
}
