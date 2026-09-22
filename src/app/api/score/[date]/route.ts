import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { calculateDailyScore } from '@/lib/scoring/calculate-daily-score';

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
    const existing = await db.dailyScore.findUnique({
      where: { userId_date: { userId: session.user.id, date } }
    });

    const score = existing ?? (await calculateDailyScore(session.user.id, date));

    return NextResponse.json(score);
  } catch (error) {
    console.error('[SCORE_DATE_GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
