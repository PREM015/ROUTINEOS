import { auth } from '@/lib/auth';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { HabitService } from '@/server/services/habit.service';
import { updateHabitSchema } from '@/schemas/habit.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/habits/[id]
 * Fetch single habit with details
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const habitRepository = new HabitRepository();
    const habit = await habitRepository.findWithRelations(id, session.user.id);

    if (!habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: habit });
  } catch (error) {
    console.error('Error fetching habit:', error);
    return NextResponse.json(
      { error: 'Failed to fetch habit' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/habits/[id]
 * Update habit
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Validate input
    const validated = updateHabitSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const habitService = new HabitService();
    const habit = await habitService.updateHabit(
      session.user.id,
      id,
      validated.data
    );

    return NextResponse.json({ success: true, data: habit });
  } catch (error) {
    console.error('Error updating habit:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update habit' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/habits/[id]
 * Partial update alias (same validation as PUT).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return PUT(request, { params: Promise.resolve({ id }) });
}

/**
 * DELETE /api/habits/[id]
 * Delete habit
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const habitService = new HabitService();
    await habitService.deleteHabit(session.user.id, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting habit:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete habit' },
      { status: 500 }
    );
  }
}