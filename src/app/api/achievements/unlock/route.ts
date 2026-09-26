import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { achievementService } from '@/server/services/achievement.service';

/**
 * POST /api/achievements/unlock
 * Evaluate which achievements newly qualify for the user and unlock them.
 *
 * Delegates to AchievementService; unlocks are evaluated against real user
 * data (session-scoped), never client-supplied values.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const unlocked = await achievementService.checkForUnlocks(session.user.id);

    return NextResponse.json({
      success: true,
      data: {
        count: unlocked.length,
        unlocked,
      },
    });
  } catch (error) {
    console.error('Error unlocking achievements:', error);
    return NextResponse.json(
      { error: 'Failed to unlock achievements' },
      { status: 500 }
    );
  }
}