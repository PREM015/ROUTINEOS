import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dayTypeId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dayTypeId } = await params;

  try {
    // Verify day type belongs to user
    const dayType = await db.dayTypeDefinition.findFirst({
      where: { id: dayTypeId, userId: session.user.id },
    });

    if (!dayType) {
      return NextResponse.json({ error: 'Day type not found' }, { status: 404 });
    }

    // Get habits assigned to this day type (appliesEveryDay: false)
    const habits = await db.habit.findMany({
      where: {
        userId: session.user.id,
        appliesEveryDay: false,
        dayTypeAssignments: {
          some: { dayTypeId },
        },
      },
      include: {
        category: true,
        tags: { include: { tag: true } },
        logs: {
          where: { date: { gte: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: habits });
  } catch (error) {
    console.error('Error fetching habits by day type:', error);
    return NextResponse.json({ error: 'Failed to fetch habits' }, { status: 500 });
  }
}