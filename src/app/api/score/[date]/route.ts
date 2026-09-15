import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { calculateDailyScore } from '@/lib/scoring/calculate-daily-score';

export async function GET(
  req: Request,
  { params }: { params: { date: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const date = params.date;
    let score = await db.dailyScore.findUnique({
      where: { userId_date: { userId: session.user.id, date } }
    });

    if (!score) {
      score = await calculateDailyScore(session.user.id, date, db);
    }

    return NextResponse.json(score);
  } catch (error) {
    console.error('[SCORE_DATE_GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
