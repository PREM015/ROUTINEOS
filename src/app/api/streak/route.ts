import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { buildDefaultStreak } from '@/lib/feature-helpers';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const streak = await prisma.streak.findUnique({ where: { userId: session.user.id } });

    return NextResponse.json({
      success: true,
      data: streak ?? buildDefaultStreak({ userId: session.user.id }),
    });
  } catch (error) {
    console.error('GET /api/streak error:', error);
    return NextResponse.json({ error: 'Failed to load streak' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const payload = {
      currentStreak: Number(body?.currentStreak ?? 0),
      longestStreak: Number(body?.longestStreak ?? 0),
      coreStreak: Number(body?.coreStreak ?? 0),
      growthStreak: Number(body?.growthStreak ?? 0),
      minimumDayStreak: Number(body?.minimumDayStreak ?? 0),
      streakStartDate: typeof body?.streakStartDate === 'string' ? body.streakStartDate : null,
      lastCompletedDate: typeof body?.lastCompletedDate === 'string' ? body.lastCompletedDate : null,
      totalCompletedDays: Number(body?.totalCompletedDays ?? 0),
      totalMinimumDays: Number(body?.totalMinimumDays ?? 0),
      totalRestDays: Number(body?.totalRestDays ?? 0),
    };

    const streak = await prisma.streak.upsert({
      where: { userId: session.user.id },
      update: payload,
      create: {
        userId: session.user.id,
        ...payload,
      },
    });

    return NextResponse.json({ success: true, data: streak });
  } catch (error) {
    console.error('PUT /api/streak error:', error);
    return NextResponse.json({ error: 'Failed to save streak' }, { status: 500 });
  }
}
