import { auth } from '@/lib/auth';
import { AchievementRepository } from '@/server/repositories/achievement.repository';
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';

const listAchievementsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * GET /api/achievements
 * List the authenticated user's unlocked achievements (newest first).
 */
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
        { status: 400 }
      );
    }

    const repository = new AchievementRepository();
    const [achievements, unlocked] = await Promise.all([
      repository.recentUnlocked(
        session.user.id,
        validated.data.limit ?? 50
      ),
      repository.findUnlocked(session.user.id),
    ]);

    return NextResponse.json({
      success: true,
      data: achievements,
      meta: {
        total: unlocked.length,
        limit: validated.data.limit ?? 50,
        offset: validated.data.offset ?? 0,
      },
    });
  } catch (error) {
    console.error('Error fetching achievements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch achievements' },
      { status: 500 }
    );
  }
}