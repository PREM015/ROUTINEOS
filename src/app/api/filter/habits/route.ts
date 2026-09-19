import { z } from 'zod';
import { auth } from '@/lib/auth';
import { HabitRepository } from '@/server/repositories/habit.repository';
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

    const habitRepository = new HabitRepository();
    const userId = session.user.id;

    let habits = await habitRepository.findAll(userId, {
      status: validated.data.status,
      tier: validated.data.tier,
      categoryId: validated.data.categoryId,
      includeArchived: validated.data.includeArchived,
      sortBy: validated.data.sortBy,
      sortOrder: validated.data.sortOrder,
      limit: validated.data.limit,
      offset: validated.data.offset,
    });

    if (validated.data.search) {
      const q = validated.data.search.toLowerCase();
      habits = habits.filter(
        (habit) =>
          habit.name.toLowerCase().includes(q) ||
          (habit.description?.toLowerCase().includes(q) ?? false)
      );
    }

    if (extra.data.date) {
      const target = new Date(`${extra.data.date}T00:00:00Z`);
      habits = habits.filter((habit) => {
        if (new Date(habit.startDate) > target) return false;
        if (habit.endDate && new Date(habit.endDate) < target) return false;
        return true;
      });
    }

    if (extra.data.energy !== undefined) {
      const energy = extra.data.energy;
      const matchingIds = new Set<string>();
      for (const habit of habits) {
        const withLogs = await habitRepository.findWithRelations(habit.id, userId);
        if (withLogs && withLogs.logs.some((log) => log.energyLevel === energy)) {
          matchingIds.add(habit.id);
        }
      }
      habits = habits.filter((habit) => matchingIds.has(habit.id));
    }

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