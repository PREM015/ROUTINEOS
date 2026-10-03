import { auth } from '@/lib/auth';
import { nutritionService } from '@/server/services/nutrition.service';
import { NotFoundError } from '@/lib/errors/app-error';
import { updateNutritionSchema } from '@/schemas/nutrition.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Nutrition Entry by ID Route
 * GET    /api/nutrition/[id] – fetch a single nutrition entry
 * PATCH  /api/nutrition/[id] – update a nutrition entry
 * DELETE /api/nutrition/[id] – delete a nutrition entry
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/nutrition/[id]
 * Fetch a single nutrition entry owned by the user.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id: paramId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entry = await nutritionService.getForUser(session.user.id, paramId);

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error fetching nutrition entry:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Nutrition entry not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to fetch nutrition entry' }, { status: 500 });
  }
}

/**
 * PATCH /api/nutrition/[id]
 * Update a nutrition entry owned by the user.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id: paramId } = await params;
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

    const entry = await nutritionService.update(
      session.user.id,
      paramId,
      validated.data
    );
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
  const { id: paramId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await nutritionService.delete(session.user.id, paramId);
    return NextResponse.json({ success: true, data: { id: paramId } });
  } catch (error) {
    console.error('Error deleting nutrition entry:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Nutrition entry not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete nutrition entry' }, { status: 500 });
  }
}
