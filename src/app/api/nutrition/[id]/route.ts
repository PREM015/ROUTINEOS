import { auth } from '@/lib/auth';
import { NutritionRepository } from '@/server/repositories/nutrition.repository';
import { updateNutritionSchema } from '@/schemas/nutrition.schema';
import { NotFoundError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Nutrition Entry by ID Route
 * GET    /api/nutrition/[id] – fetch a single nutrition entry
 * PATCH  /api/nutrition/[id] – update a nutrition entry
 * DELETE /api/nutrition/[id] – delete a nutrition entry
 */

interface RouteContext {
  params: { id: string };
}

/**
 * GET /api/nutrition/[id]
 * Fetch a single nutrition entry owned by the user.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const nutritionRepository = new NutritionRepository();
    const entry = await nutritionRepository.findById(session.user.id, params.id);

    if (!entry) {
      return NextResponse.json({ error: 'Nutrition entry not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error fetching nutrition entry:', error);
    return NextResponse.json({ error: 'Failed to fetch nutrition entry' }, { status: 500 });
  }
}

/**
 * PATCH /api/nutrition/[id]
 * Update a nutrition entry owned by the user.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = updateNutritionSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const nutritionRepository = new NutritionRepository();
    const existing = await nutritionRepository.findById(session.user.id, params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Nutrition entry not found' }, { status: 404 });
    }

    if (Object.keys(validated.data).length === 0) {
      return NextResponse.json({ success: true, data: existing });
    }

    const entry = await nutritionRepository.update(session.user.id, params.id, validated.data);
    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error updating nutrition entry:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Nutrition entry not found' }, { status: 404 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update nutrition entry' }, { status: 500 });
  }
}

/**
 * DELETE /api/nutrition/[id]
 * Delete a nutrition entry owned by the user.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const nutritionRepository = new NutritionRepository();
    const existing = await nutritionRepository.findById(session.user.id, params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Nutrition entry not found' }, { status: 404 });
    }

    await nutritionRepository.delete(session.user.id, params.id);
    return NextResponse.json({ success: true, data: { id: params.id } });
  } catch (error) {
    console.error('Error deleting nutrition entry:', error);
    return NextResponse.json({ error: 'Failed to delete nutrition entry' }, { status: 500 });
  }
}