import { auth } from '@/lib/auth';
import { AchievementService } from '@/server/services/achievement.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * GET /api/achievements/next
 *
 * The achievements the user has not earned yet, closest first, with current
 * progress toward each target.
 *
 * This exists for the dashboard's achievements strip, which shows the next 2-3
 * locked badges with a progress ring. `GET /api/achievements` cannot provide
 * that: it returns only what is *already* unlocked, so there was no way to know
 * what the user was working toward.
 *
 * `GET /api/achievements` remains the right endpoint for the achievements page
 * — but only for what is *earned*. The page's locked tiles also need progress,
 * and it has no other source: it renders the locked set from the shared
 * definition catalogue, which carries no per-user numbers.
 *
 * Hence the cap being 100 rather than 10. The catalogue is 12 definitions, so a
 * page asking for all of them is asking for a dozen rows; the previous `max(10)`
 * would have silently truncated the list and left the tail of locked tiles with
 * no progress again — the same class of bug this endpoint was added to fix.
 */
const nextSchema = z.object({
  count: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const validated = nextSchema.safeParse({
      count: searchParams.get('count') || undefined,
    });
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 },
      );
    }

    const next = await new AchievementService().getNextUnearned(
      session.user.id,
      validated.data.count ?? 3
    );

    return NextResponse.json({ success: true, data: next });
  } catch (error) {
    console.error('Error fetching next achievements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch next achievements' },
      { status: 500 },
    );
  }
}
