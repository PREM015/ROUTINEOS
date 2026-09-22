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

    // Parse query parameters. Every param is optional: a plain GET with no
    // params must validate. Convert null -> undefined so Zod never sees null.
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const tierParam = searchParams.get('tier');
    const categoryParam = searchParams.get('categoryId');
    const searchParam = searchParams.get('search');
    const sortByParam = searchParams.get('sortBy');
    const sortOrderParam = searchParams.get('sortOrder');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const queryData = {
      status: statusParam ? statusParam.split(',').filter(Boolean) : undefined,
      tier: tierParam ? tierParam.split(',').filter(Boolean) : undefined,
      categoryId: categoryParam || undefined,
      search: searchParam || undefined,
      sortBy: (sortByParam || 'createdAt') as 'name' | 'createdAt' | 'streak' | 'completionRate',
      sortOrder: (sortOrderParam || 'desc') as 'asc' | 'desc',
      limit: limitParam ? parseInt(limitParam, 10) : 20,
      offset: offsetParam ? parseInt(offsetParam, 10) : 0,
      includeArchived: searchParams.get('includeArchived') === 'true' ? true : undefined,
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