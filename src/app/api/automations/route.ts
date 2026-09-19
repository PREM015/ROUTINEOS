import { auth } from '@/lib/auth';
import { AutomationRepository } from '@/server/repositories/automation.repository';
import { automationSchema, automationQuerySchema } from '@/schemas/automation.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Automation Route
 * GET  /api/automations – list automation rules for the authenticated user
 * POST /api/automations – create an automation rule
 */

/**
 * GET /api/automations
 * List automation rules, optionally filtered by active status or type.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryData = {
      isActive: searchParams.get('isActive') !== null ? searchParams.get('isActive') === 'true' : undefined,
      triggerType: searchParams.get('triggerType') ?? undefined,
      actionType: searchParams.get('actionType') ?? undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const validated = automationQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const automationRepository = new AutomationRepository();
    const rules = await automationRepository.findByUserId(session.user.id, {
      isActive: validated.data.isActive,
      triggerType: validated.data.triggerType,
      actionType: validated.data.actionType,
      limit: validated.data.limit,
      offset: validated.data.offset,
    });

    return NextResponse.json({
      success: true,
      data: rules,
      meta: {
        total: rules.length,
        limit: validated.data.limit ?? 30,
        offset: validated.data.offset ?? 0,
      },
    });
  } catch (error) {
    console.error('Error fetching automations:', error);
    return NextResponse.json({ error: 'Failed to fetch automations' }, { status: 500 });
  }
}

/**
 * POST /api/automations
 * Create an automation rule. Config objects are serialized for storage.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = automationSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const automationRepository = new AutomationRepository();
    const rule = await automationRepository.create(session.user.id, {
      name: validated.data.name,
      triggerType: validated.data.triggerType,
      triggerConfig: JSON.stringify(validated.data.triggerConfig),
      actionType: validated.data.actionType,
      actionConfig: JSON.stringify(validated.data.actionConfig),
      isActive: validated.data.isActive,
    });

    return NextResponse.json({ success: true, data: rule }, { status: 201 });
  } catch (error) {
    console.error('Error creating automation:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create automation' }, { status: 500 });
  }
}