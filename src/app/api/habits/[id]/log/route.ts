import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const habitId = id;
    const body = await request.json();
    const { date, status, note } = body; // date: YYYY-MM-DD, status: COMPLETED / MISSED / SKIPPED

    // Upsert the log for idempotency
    const log = await prisma.habitLog.upsert({
      where: {
        userId_habitId_date: {
          userId: session.user.id,
          habitId,
          date
        }
      },
      update: {
        status,
        note,
        completedAt: status === 'COMPLETED' ? new Date() : null
      },
      create: {
        userId: session.user.id,
        habitId,
        date,
        status,
        note,
        completedAt: status === 'COMPLETED' ? new Date() : null
      }
    });

    return NextResponse.json({ success: true, data: log });
  } catch (error) {
    console.error("POST /api/habits/log error:", error);
    return NextResponse.json({ success: false, error: 'Failed to log habit' }, { status: 500 });
  }
}
