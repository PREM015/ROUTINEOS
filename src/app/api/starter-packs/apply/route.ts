import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { StarterPackService } from '@/server/services/starter-pack.service';
import { applyStarterPackSchema } from '@/schemas/habit.schema';
import { handleError } from '@/lib/errors/error-handler';
import type { StarterPackOverride } from '@/server/services/starter-pack.service';

/**
 * POST /api/starter-packs/apply
 *
 * Create the pack's habits for the signed-in user.
 *
 * Idempotent by construction, not by bookkeeping: habits are keyed on
 * `(userId, name)` and the insert uses `skipDuplicates`, and there is **no
 * update path in this handler at all**. Running it twice therefore cannot create
 * a duplicate, cannot reset a customised target, and cannot touch a single
 * `HabitLog` — it can only skip.
 *
 * The pack itself is a `userId = null` official `Template`, so this exact
 * endpoint and this exact behaviour are available to every user. Nothing here
 * branches on who is calling.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const parsed = applyStarterPackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await new StarterPackService().applyStarterPack(
      auth.auth.userId,
      parsed.data.templateId,
      (parsed.data.overrides ?? {}) as Record<string, StarterPackOverride>,
      parsed.data.tier2StartDelayDays
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleError(error);
  }
}
