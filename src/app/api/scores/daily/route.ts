import { auth } from '@/lib/auth';
import { ScoreRepository } from '@/server/repositories/score.repository';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/score/[date]
 * Get score for specific date
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { date: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scoreRepository = new ScoreRepository();
    const score = await scoreRepository.findByDate(session.user.id, params.date);

    if (!score) {
      return NextResponse.json({ error: 'Score not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: score,
    });
  } catch (error) {
    console.error('Error fetching score:', error);
    return NextResponse.json(
      { error: 'Failed to fetch score' },
      { status: 500 }
    );
  }
}