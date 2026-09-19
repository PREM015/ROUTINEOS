import { auth } from '@/lib/auth';
import { HabitRepository } from '@/server/repositories/habit.repository';
import { HabitService } from '@/server/services/habit.service';
import { habitQuerySchema, createHabitSchema } from '@/schemas/habit.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/habits
 * Fetch all habits for authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryData = {
      status: searchParams.get('status')?.split(','),
      tier: searchParams.get('tier')?.split(','),
      categoryId: searchParams.get('categoryId'),
      search: searchParams.get('search'),
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortOrder: (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc',
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
      includeArchived: searchParams.get('includeArchived') === 'true',
    };

    // Validate query
    const validated = habitQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const habitRepository = new HabitRepository();
    const habits = await habitRepository.findAll(session.user.id, validated.data);

    return NextResponse.json({
      success: true,
      data: habits,
      meta: {
        total: habits.length,
        limit: validated.data.limit,
        offset: validated.data.offset,
      },
    });
  } catch (error) {
    console.error('Error fetching habits:', error);
    return NextResponse.json(
      { error: 'Failed to fetch habits' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/habits
 * Create new habit
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate input
    const validated = createHabitSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const habitService = new HabitService();
    const habit = await habitService.createHabit(session.user.id, validated.data);

    return NextResponse.json(
      { success: true, data: habit },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating habit:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create habit' },
      { status: 500 }
    );
  }
}