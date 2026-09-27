import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { celebrateAchievementSchema } from '@/schemas/achievement.schema';
import { AchievementService } from '@/server/services/achievement.service';

const achievementService = new AchievementService();

/**
 * POST /api/achievements/celebrate
 * Celebrate a streak milestone or an unlocked achievement for the user.
 *
 * The ownership checks and the audit-trail writes live in AchievementService.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = celebrateAchievementSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { milestoneId, achievementId } = validated.data;

    if (milestoneId) {
      const result = await achievementService.celebrateMilestone(
        session.user.id,
        milestoneId
      );
      return NextResponse.json({ success: true, data: result });
    }

    // The schema's refine() guarantees at least one id is present.
    const result = await achievementService.celebrateAchievement(
      session.user.id,
      achievementId as string
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Error celebrating achievement:', error);
    return NextResponse.json(
      { error: 'Failed to celebrate achievement' },
      { status: 500 }
    );
  }
}
