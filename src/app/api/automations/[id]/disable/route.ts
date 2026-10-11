import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { automationService } from '@/server/services/automation.service';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

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
      userIdFromSession(session),
      paramId,
      false
    );
    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    return handleError(error);
  }
}
