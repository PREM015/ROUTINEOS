import { auth } from '@/lib/auth';
import { AchievementService } from '@/server/services/achievement.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const showcaseQuerySchema = z.object({
  locked: z.coerce.number().int().min(0).max(40).optional(),
});

/**
 * GET /api/achievements/showcase?locked=12
 *
 * The showcase card's single source: the earned set and the locked set, both
 * derived from ONE world-state snapshot.
 *
 * The card used to make two requests and render the halves side by side, which
 * meant `buildWorldState` (about 10 queries) ran twice for one card and nothing
 * reconciled the two lists. An achievement unlocked between the two calls would
 * appear twice. One snapshot makes that impossible.
 *
 * `category` and `rarity` have been in the definitions registry all along and
 * were simply never sent. They are static config, not new data.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = showcaseQuerySchema.safeParse({
      locked: searchParams.get('locked') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const showcase = await new AchievementService().getShowcase(
      session.user.id,
      parsed.data.locked ?? 12
    );

    return NextResponse.json({ success: true, data: showcase });
  } catch (error) {
    console.error('Error fetching achievement showcase:', error);
    return NextResponse.json(
      { error: 'Failed to fetch achievement showcase' },
      { status: 500 }
    );
  }
}
