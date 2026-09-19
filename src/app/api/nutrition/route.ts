import { auth } from '@/lib/auth';
import { NutritionRepository } from '@/server/repositories/nutrition.repository';
import { createNutritionSchema, nutritionQuerySchema } from '@/schemas/nutrition.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Nutrition Route
 * GET  /api/nutrition – list nutrition entries for the authenticated user
 * POST /api/nutrition – create one or more nutrition entries for a meal
 */

/**
 * GET /api/nutrition
 * List nutrition entries, optionally filtered by date range or meal type.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryData = {
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
      mealType: searchParams.get('mealType') ?? undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const validated = nutritionQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const nutritionRepository = new NutritionRepository();
    const entries = await nutritionRepository.findAll(session.user.id, {
      startDate: validated.data.startDate,
      endDate: validated.data.endDate,
      mealType: validated.data.mealType,
      limit: validated.data.limit,
      offset: validated.data.offset,
    });

    const totals = entries.reduce(
      (acc, entry) => {
        acc.calories += entry.calories ?? 0;
        acc.protein += entry.protein ?? 0;
        acc.carbs += entry.carbs ?? 0;
        acc.fat += entry.fat ?? 0;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    return NextResponse.json({
      success: true,
      data: entries,
      meta: {
        total: entries.length,
        limit: validated.data.limit ?? 30,
        offset: validated.data.offset ?? 0,
        totals,
      },
    });
  } catch (error) {
    console.error('Error fetching nutrition entries:', error);
    return NextResponse.json({ error: 'Failed to fetch nutrition entries' }, { status: 500 });
  }
}

/**
 * POST /api/nutrition
 * Create nutrition entries for a meal (date + mealType + items[]).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createNutritionSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { date, mealType, items } = validated.data;
    const nutritionRepository = new NutritionRepository();
    const entries = await nutritionRepository.createMany(session.user.id, date, mealType, items);

    return NextResponse.json({ success: true, data: entries }, { status: 201 });
  } catch (error) {
    console.error('Error creating nutrition entries:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create nutrition entries' }, { status: 500 });
  }
}