import { auth } from '@/lib/auth';
import { AutomationRepository } from '@/server/repositories/automation.repository';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Automation Disable Route
 * POST /api/automations/[id]/disable – deactivate an automation rule
 */

interface RouteContext {
  params: { id: string };
}

/**
 * POST /api/automations/[id]/disable
 * Set an automation rule to inactive.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
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

    const rule = await automationRepository.setActive(session.user.id, params.id, false);
    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    console.error('Error disabling automation:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to disable automation' }, { status: 500 });
  }
}