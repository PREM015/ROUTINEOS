import { auth } from '@/lib/auth';
import { templateService } from '@/server/services/template.service';
import { updateTemplateSchema } from '@/schemas/template.schema';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * Template by ID Route
 * GET    /api/templates/[id] – fetch a template (own, public, or official)
 * PATCH  /api/templates/[id] – update a user-owned template
 * DELETE /api/templates/[id] – delete a user-owned template
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/templates/[id]
 * Fetch a single template the user may access.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id: paramId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const template = await templateService.getForUser(userIdFromSession(session), paramId);

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PATCH /api/templates/[id]
 * Update a template owned by the user.
 *
 * The `template.userId !== session.user.id` → 403 check this used to have was
 * unreachable: `TemplateRepository.findById` is already scoped by `userId`, so a
 * template belonging to someone else came back `null` and produced the 404 above.
 * The ownership check now lives once, in `TemplateService.getForUser`.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id: paramId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = updateTemplateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    // An empty patch is a no-op, and the existing row is echoed back unchanged.
    if (Object.keys(validated.data).length === 0) {
      const existing = await templateService.getForUser(userIdFromSession(session), paramId);
      return NextResponse.json({ success: true, data: existing });
    }

    const updated = await templateService.update(
      userIdFromSession(session),
      paramId,
      validated.data
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/templates/[id]
 * Delete a template owned by the user.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id: paramId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await templateService.delete(userIdFromSession(session), paramId);
    return NextResponse.json({ success: true, data: { id: paramId } });
  } catch (error) {
    return handleError(error);
  }
}
