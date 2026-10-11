import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { automationService } from '@/server/services/automation.service';
import { updateAutomationSchema } from '@/schemas/automation.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * Automation by ID Route
 * GET    /api/automations/[id] – fetch a single automation rule
 * PATCH  /api/automations/[id] – update an automation rule
 * DELETE /api/automations/[id] – delete an automation rule
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/automations/[id]
 * Fetch a single automation rule owned by the user.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id: paramId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rule = await automationService.get(userIdFromSession(session), paramId);

    if (!rule) {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PATCH /api/automations/[id]
 * Update an automation rule.
 *
 * The route used to re-implement the field-by-field mapping *and* the
 * object→JSON serialisation for `triggerConfig` / `actionConfig`, while
 * `AutomationService.update` did the identical work. Two copies of the same
 * mapping meant the repository's JSON columns were written two different ways;
 * the service's is the one that has to win, because the repository takes strings
 * and the service owns that translation (ERROR.md §1, recipe step 3).
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id: paramId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = updateAutomationSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const rule = await automationService.update(
      userIdFromSession(session),
      paramId,
      validated.data
    );

    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/automations/[id]
 * Delete an automation rule owned by the user.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id: paramId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await automationService.delete(userIdFromSession(session), paramId);
    return NextResponse.json({ success: true, data: { id: paramId } });
  } catch (error) {
    return handleError(error);
  }
}
