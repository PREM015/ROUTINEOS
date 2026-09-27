import { z } from 'zod';
import { auth } from '@/lib/auth';
import { HabitService } from '@/server/services/habit.service';
import { habitQuerySchema } from '@/schemas/habit.schema';
import { NextRequest, NextResponse } from 'next/server';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const additionalFiltersSchema = z.object({
  date: z.string().regex(datePattern).optional(),
  energy: z.number().int().min(1).max(5).optional(),
});

/**
 * GET /api/filter/habits
 * Filter the authenticated user's habits by tier, category, status, date and energy
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const queryData = {
      status: searchParams.get('status')?.split(','),
      tier: searchParams.get('tier')?.split(','),
      categoryId: searchParams.get('categoryId') || undefined,
      search: searchParams.get('search') || undefined,
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortOrder: (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc',
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
      includeArchived: searchParams.get('includeArchived') === 'true',
    };

    const validated = habitQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const extra = additionalFiltersSchema.safeParse({
      date: searchParams.get('date') || undefined,
      energy: searchParams.get('energy')
        ? parseInt(searchParams.get('energy')!)
        : undefined,
    });
    if (!extra.success) {
      return NextResponse.json(
        { error: 'Invalid filter parameters', details: extra.error.flatten() },
        { status: 400 }
      );
    }

    const habits = await new HabitService().filterHabits(session.user.id, {
      ...validated.data,
      date: extra.data.date,
      energy: extra.data.energy,
    });

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
    console.error('Error filtering habits:', error);
    return NextResponse.json({ error: 'Failed to filter habits' }, { status: 500 });
  }
}
