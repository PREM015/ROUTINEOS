import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ScoringService } from '@/server/services/scoring.service';

const scoringService = new ScoringService();

export async function GET(_req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(_req.url);
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

    const existing = await scoringService.getDailyScore(session.user.id, date);
    const score = existing ?? (await scoringService.calculateDailyScore(session.user.id, date));

    return NextResponse.json(score);
  } catch (error) {
    console.error('[SCORE_GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(_req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Force recalculate today's score
    const date = new Date().toISOString().slice(0, 10);
    const score = await scoringService.calculateDailyScore(session.user.id, date);

    return NextResponse.json(score);
  } catch (error) {
    console.error('[SCORE_RECALC]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
