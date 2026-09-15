import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { recalculateStreak } from '@/lib/streaks/calculate-streak';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const streak = await recalculateStreak(session.user.id, db);
    return NextResponse.json(streak);
  } catch (error) {
    console.error('[STREAK_GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const streak = await recalculateStreak(session.user.id, db);
    
    // In a full implementation, you might save this back to a user profile or streak table
    // For now we just return the newly calculated state

    return NextResponse.json(streak);
  } catch (error) {
    console.error('[STREAK_POST]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
