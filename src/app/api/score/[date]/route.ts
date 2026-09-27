import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ScoringService } from '@/server/services/scoring.service';

const scoringService = new ScoringService();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { date } = await params;
    const existing = await scoringService.getDailyScore(session.user.id, date);
    const score = existing ?? (await scoringService.calculateDailyScore(session.user.id, date));

    return NextResponse.json(score);
  } catch (error) {
    console.error('[SCORE_DATE_GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
