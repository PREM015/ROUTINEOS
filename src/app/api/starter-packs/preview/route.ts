import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { StarterPackService } from '@/server/services/starter-pack.service';
import { previewStarterPackSchema } from '@/schemas/habit.schema';
import { handleError } from '@/lib/errors/error-handler';
import type { StarterPackOverride } from '@/server/services/starter-pack.service';

/**
 * POST /api/starter-packs/preview
 *
 * Show what applying a pack would create for **this** user, grouped by tier,
 * before anything is written. Habit names the user already has are flagged
 * `alreadyExists` and will be left untouched — including their target, tier and
 * history.
 *
 * Shares `buildPlan` with the apply route, so the confirmation screen cannot
 * disagree with what actually gets written.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const parsed = previewStarterPackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const preview = await new StarterPackService().previewStarterPack(
      auth.auth.userId,
      undefined,
      (parsed.data.overrides ?? {}) as Record<string, StarterPackOverride>
    );

    return NextResponse.json({ success: true, data: preview });
  } catch (error) {
    return handleError(error);
  }
}
