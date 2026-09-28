import { auth } from '@/lib/auth';
import { AutomationRepository } from '@/server/repositories/automation.repository';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Automation Enable Route
 * POST /api/automations/[id]/enable – activate an automation rule
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/automations/[id]/enable
 * Set an automation rule to active.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id: paramId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const automationRepository = new AutomationRepository();
    const existing = await automationRepository.findById(session.user.id, paramId);
    if (!existing) {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 });
    }

    const rule = await automationRepository.setActive(session.user.id, paramId, true);
    return NextResponse.json({ success: true, data: rule });
  } catch (error) {
    console.error('Error enabling automation:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to enable automation' }, { status: 500 });
  }
}