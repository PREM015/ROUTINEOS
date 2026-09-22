import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { calculateDailyScore } from '@/lib/scoring/calculate-daily-score';

export async function GET(_req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(_req.url);
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

    const existing = await db.dailyScore.findUnique({
      where: { userId_date: { userId: session.user.id, date } }
    });

    const score = existing ?? (await calculateDailyScore(session.user.id, date));

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
    const score = await calculateDailyScore(session.user.id, date);

    return NextResponse.json(score);
  } catch (error) {
    console.error('[SCORE_RECALC]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
