import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const assignDayTypesSchema = z.object({
  dayTypeIds: z.array(z.string()).min(1),
});

const appliesEveryDaySchema = z.object({
  appliesEveryDay: z.boolean(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: habitId } = await params;

  try {
    // Verify habit ownership
    const habit = await db.habit.findFirst({
      where: { id: habitId, userId: session.user.id },
    });

    if (!habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    const body = await req.json();
    const data = assignDayTypesSchema.parse(body);

    // Verify all day types belong to user
    const dayTypes = await db.dayTypeDefinition.findMany({
      where: { id: { in: data.dayTypeIds }, userId: session.user.id },
      select: { id: true },
    });

    if (dayTypes.length !== data.dayTypeIds.length) {
      return NextResponse.json({ error: 'One or more day types not found' }, { status: 404 });
    }

    // Create assignments
    await db.habitDayType.createMany({
      data: data.dayTypeIds.map(dayTypeId => ({
        habitId,
        dayTypeId,
      })),
      skipDuplicates: true,
    });

    // If assigning day types, set appliesEveryDay to false
    await db.habit.update({
      where: { id: habitId },
      data: { appliesEveryDay: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.flatten() }, { status: 400 });
    }
    console.error('Error assigning day types to habit:', error);
    return NextResponse.json({ error: 'Failed to assign day types' }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: habitId } = await params;

  try {
    // Verify habit ownership
    const habit = await db.habit.findFirst({
      where: { id: habitId, userId: session.user.id },
      select: { appliesEveryDay: true },
    });

    if (!habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    const assignments = await db.habitDayType.findMany({
      where: { habitId },
      include: { dayType: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        appliesEveryDay: habit.appliesEveryDay,
        dayTypes: assignments.map(a => a.dayType),
      },
    });
  } catch (error) {
    console.error('Error fetching habit day types:', error);
    return NextResponse.json({ error: 'Failed to fetch day types' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: habitId } = await params;

  try {
    // Verify habit ownership
    const habit = await db.habit.findFirst({
      where: { id: habitId, userId: session.user.id },
    });

    if (!habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    const body = await req.json();
    const data = appliesEveryDaySchema.parse(body);

    await db.habit.update({
      where: { id: habitId },
      data: { appliesEveryDay: data.appliesEveryDay },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.flatten() }, { status: 400 });
    }
    console.error('Error updating habit appliesEveryDay:', error);
    return NextResponse.json({ error: 'Failed to update habit' }, { status: 500 });
  }
}