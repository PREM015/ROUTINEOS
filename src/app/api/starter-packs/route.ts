import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { StarterPackService } from '@/server/services/starter-pack.service';
import { handleError } from '@/lib/errors/error-handler';

/**
 * GET /api/starter-packs
 *
 * The habit packs available to the caller: their own packs plus any system ones.
 *
 * Read-only and parameterless. A pack created by one user is owned by that user
 * and never appears for anyone else, so the list is per-user by construction
 * rather than by a filter applied afterwards.
 */
export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const packs = await new StarterPackService().listPacks(auth.auth.userId);
    return NextResponse.json({ success: true, data: packs });
  } catch (error) {
    return handleError(error);
  }
}
