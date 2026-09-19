import { auth } from '@/lib/auth';
import { AutomationRepository } from '@/server/repositories/automation.repository';
import { updateAutomationSchema } from '@/schemas/automation.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Automation by ID Route
 * GET    /api/automations/[id] – fetch a single automation rule
 * PATCH  /api/automations/[id] – update an automation rule
 * DELETE /api/automations/[id] – delete an automation rule
 */

interface RouteContext {
  params: { id: string };
}

/**
 * GET /api/automations/[id]
 * Fetch a single automation rule owned by the user.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const automationRepository = new AutomationRepository();
    const rule = await automationRepository.findById(session.user.id, params.id);

    if (!rule) {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    console.error('Error fetching automation:', error);
    return NextResponse.json({ error: 'Failed to fetch automation' }, { status: 500 });
  }
}

/**
 * PATCH /api/automations/[id]
 * Update an automation rule. Config objects are re-serialized when provided.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
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

    const automationRepository = new AutomationRepository();
    const existing = await automationRepository.findById(session.user.id, params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 });
    }

    if (Object.keys(validated.data).length === 0) {
      return NextResponse.json({ success: true, data: existing });
    }

    const rule = await automationRepository.update(session.user.id, params.id, {
      ...(validated.data.name !== undefined && { name: validated.data.name }),
      ...(validated.data.isActive !== undefined && { isActive: validated.data.isActive }),
      ...(validated.data.triggerType !== undefined && { triggerType: validated.data.triggerType }),
      ...(validated.data.triggerConfig !== undefined && {
        triggerConfig: JSON.stringify(validated.data.triggerConfig),
      }),
      ...(validated.data.actionType !== undefined && { actionType: validated.data.actionType }),
      ...(validated.data.actionConfig !== undefined && {
        actionConfig: JSON.stringify(validated.data.actionConfig),
      }),
    });

    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    console.error('Error updating automation:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update automation' }, { status: 500 });
  }
}

/**
 * DELETE /api/automations/[id]
 * Delete an automation rule owned by the user.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const automationRepository = new AutomationRepository();
    const existing = await automationRepository.findById(session.user.id, params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 });
    }

    await automationRepository.delete(session.user.id, params.id);
    return NextResponse.json({ success: true, data: { id: params.id } });
  } catch (error) {
    console.error('Error deleting automation:', error);
    return NextResponse.json({ error: 'Failed to delete automation' }, { status: 500 });
  }
}