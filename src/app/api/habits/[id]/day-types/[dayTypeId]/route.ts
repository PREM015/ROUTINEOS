import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; dayTypeId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: habitId, dayTypeId } = await params;

  try {
    // Verify habit ownership
    const habit = await db.habit.findFirst({
      where: { id: habitId, userId: session.user.id },
    });

    if (!habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    // Delete assignment
    await db.habitDayType.deleteMany({
      where: { habitId, dayTypeId },
    });

    // Check if habit still has any day type assignments
    const remaining = await db.habitDayType.count({
      where: { habitId },
    });

    // If no more day type assignments, set appliesEveryDay to true
    if (remaining === 0) {
      await db.habit.update({
        where: { id: habitId },
        data: { appliesEveryDay: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing day type from habit:', error);
    return NextResponse.json({ error: 'Failed to remove day type' }, { status: 500 });
  }
}