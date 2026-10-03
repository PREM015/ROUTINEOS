import { auth } from '@/lib/auth';
import { automationService } from '@/server/services/automation.service';
import { NotFoundError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Automation Disable Route
 * POST /api/automations/[id]/disable – deactivate an automation rule
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/automations/[id]/disable
 * Set an automation rule to inactive.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id: paramId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rule = await automationService.setActive(
      session.user.id,
      paramId,
      false
    );
    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    console.error('Error disabling automation:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to disable automation' }, { status: 500 });
  }
}
