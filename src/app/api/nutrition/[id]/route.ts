import { auth } from '@/lib/auth';
import { nutritionService } from '@/server/services/nutrition.service';
import { updateNutritionSchema } from '@/schemas/nutrition.schema';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

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

    const entry = await nutritionService.getForUser(userIdFromSession(session), paramId);

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    return handleError(error);
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
      userIdFromSession(session),
      paramId,
      validated.data
    );
    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    return handleError(error);
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

    await nutritionService.delete(userIdFromSession(session), paramId);
    return NextResponse.json({ success: true, data: { id: paramId } });
  } catch (error) {
    return handleError(error);
  }
}
