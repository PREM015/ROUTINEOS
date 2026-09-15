import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const [totalUsers, totalHabits, totalGoals] = await Promise.all([
      db.user.count(),
      db.habit.count(),
      db.goal.count(),
    ]);

    return NextResponse.json({
      totalUsers,
      activeToday: 0, // Placeholder
      totalHabits,
      totalGoals,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
