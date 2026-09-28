import { auth } from '@/lib/auth';
import { AchievementService } from '@/server/services/achievement.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Achievements Route
 * GET /api/achievements
 *
 * Thin handler: pagination validation and the paired "recent + total" queries
 * live in `AchievementService`.
 */

const listAchievementsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const validated = listAchievementsSchema.safeParse({
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    });
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 },
      );
    }

    const limit = validated.data.limit ?? 50;
    const { achievements, total } = await new AchievementService().listRecent(
      session.user.id,
      limit,
    );

    return NextResponse.json({
      success: true,
      data: achievements,
      meta: { total, limit, offset: validated.data.offset ?? 0 },
    });
  } catch (error) {
    console.error('Error fetching achievements:', error);
    return NextResponse.json({ error: 'Failed to fetch achievements' }, { status: 500 });
  }
}
