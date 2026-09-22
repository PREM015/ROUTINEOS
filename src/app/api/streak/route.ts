import { auth } from '@/lib/auth';
import { StreakRepository } from '@/server/repositories/streak.repository';
import { NextRequest, NextResponse } from 'next/server';

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

    const streakRepository = new StreakRepository();
    let streak = await streakRepository.findByUserId(session.user.id);

    // Create streak if doesn't exist
    if (!streak) {
      streak = await streakRepository.create(session.user.id);
    }

    // Get uncelebrated milestones
    const milestones = await streakRepository.getUncelebratedMilestones(
      session.user.id
    );

    return NextResponse.json({
      success: true,
      data: {
        ...streak,
        uncelebratedMilestones: milestones,
      },
    });
  } catch (error) {
    console.error('Error fetching streak:', error);
    return NextResponse.json(
      { error: 'Failed to fetch streak' },
      { status: 500 }
    );
  }
}