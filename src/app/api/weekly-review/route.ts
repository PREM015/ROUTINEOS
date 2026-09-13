import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { normalizeSummaryPayload } from '@/lib/feature-helpers';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const reviews = await prisma.weeklyReview.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({ success: true, data: reviews });
  } catch (error) {
    console.error('GET /api/weekly-review error:', error);
    return NextResponse.json({ error: 'Failed to load weekly review' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const summary = normalizeSummaryPayload(body ?? {});

    const review = await prisma.weeklyReview.upsert({
      where: {
        userId_weekStart: {
          userId: session.user.id,
          weekStart: summary.weekStart || new Date().toISOString().slice(0, 10),
        },
      },
      update: {
        weekEnd: summary.weekEnd || summary.weekStart,
        answers: JSON.stringify(summary.answers ?? {}),
        overallSatisfaction: summary.overallSatisfaction,
      },
      create: {
        userId: session.user.id,
        weekStart: summary.weekStart || new Date().toISOString().slice(0, 10),
        weekEnd: summary.weekEnd || summary.weekStart || new Date().toISOString().slice(0, 10),
        answers: JSON.stringify(summary.answers ?? {}),
        overallSatisfaction: summary.overallSatisfaction,
      },
    });

    return NextResponse.json({ success: true, data: review });
  } catch (error) {
    console.error('POST /api/weekly-review error:', error);
    return NextResponse.json({ error: 'Failed to save weekly review' }, { status: 500 });
  }
}
