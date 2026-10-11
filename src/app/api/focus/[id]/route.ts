import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { focusService } from '@/server/services/focus.service';
import { updateFocusSessionSchema } from '@/schemas/focus.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/focus/[id]
 * Fetch a single focus session owned by the user
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const focusSession = await focusService.getSession(userIdFromSession(session), id);

    return NextResponse.json({ success: true, data: focusSession });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PATCH /api/focus/[id]
 * Update a focus session owned by the user
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const body = await request.json();
    const validated = updateFocusSessionSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const focusSession = await focusService.updateSession(
      userIdFromSession(session),
      id,
      validated.data
    );

    return NextResponse.json({ success: true, data: focusSession });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/focus/[id]
 * Delete a focus session owned by the user
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const deleted = await focusService.deleteSession(userIdFromSession(session), id);

    return NextResponse.json({ success: true, data: deleted });
  } catch (error) {
    return handleError(error);
  }
}
