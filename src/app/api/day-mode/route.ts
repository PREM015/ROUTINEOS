import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { calculateDailyScore } from '@/lib/scoring/calculate-daily-score';

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(['NORMAL', 'MINIMUM', 'REST']),
  reason: z.string().optional()
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await req.json();
    const parsed = schema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { date, mode, reason } = parsed.data;

    await db.userDay.upsert({
      where: { userId_date: { userId: session.user.id, date } },
      update: { dayMode: mode },
      create: { userId: session.user.id, date, dayMode: mode }
    });

    const newScore = await calculateDailyScore(session.user.id, date, db);

    return NextResponse.json(newScore);
  } catch (error) {
    console.error('[DAY_MODE_POST]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
