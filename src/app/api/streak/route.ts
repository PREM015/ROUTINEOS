import { auth } from '@/lib/auth';
import { AchievementService } from '@/server/services/achievement.service';
import { NextRequest, NextResponse } from 'next/server';

const achievementService = new AchievementService();

/**
 * GET /api/streak
 * Get user's current streak data
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await achievementService.getStreakWithMilestones(session.user.id);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching streak:', error);
    return NextResponse.json(
      { error: 'Failed to fetch streak' },
      { status: 500 }
    );
  }
}
