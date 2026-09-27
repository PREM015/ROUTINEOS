import { auth } from '@/lib/auth';
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
    const list = (key: string) => searchParams.get(key)?.split(',').filter(Boolean);
    const int = (key: string) => {
      const raw = searchParams.get(key);
      return raw === null ? undefined : parseInt(raw, 10);
    };
    const queryData = {
      status: list('status'),
      tier: list('tier'),
      categoryId: searchParams.get('categoryId') || undefined,
      search: searchParams.get('search') || undefined,
      sortBy: (searchParams.get('sortBy') || 'createdAt') as
        | 'name'
        | 'createdAt'
        | 'streak'
        | 'completionRate',
      sortOrder: (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc',
      limit: int('limit') ?? 20,
      offset: int('offset') ?? 0,
      includeArchived:
        searchParams.get('includeArchived') === 'true' ? true : undefined,
      dayTypeId: searchParams.get('dayTypeId') || undefined,
    };

    // Validate query
    const validated = habitQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const habits = await new HabitService().listHabits(session.user.id, validated.data);

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

    // The service owns day-type assignment, so the route forwards validated
    // input as-is. Writing the assignments here too was a second code path
    // doing the same inserts.
    const habit = await new HabitService().createHabit(session.user.id, {
      ...validated.data,
      appliesEveryDay: validated.data.appliesEveryDay ?? true,
    });

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
