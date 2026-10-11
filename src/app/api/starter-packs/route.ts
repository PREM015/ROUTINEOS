import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { StarterPackService } from '@/server/services/starter-pack.service';
import { handleError } from '@/lib/errors/error-handler';

/**
 * GET /api/starter-packs
 *
 * The official habit packs available to every user. Read-only, no parameters:
 * the same list for everyone, by design. There is no per-account variant of a
 * pack — only the *initial* choice may differ, and that is expressed by which
 * pack a user applies, not by hiding packs from other people.
 */
export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const packs = await new StarterPackService().listPacks();
    return NextResponse.json({ success: true, data: packs });
  } catch (error) {
    return handleError(error);
  }
}
