import { auth } from '@/lib/auth';
import { automationService } from '@/server/services/automation.service';
import { automationQuerySchema } from '@/schemas/automation.schema';
import { ValidationError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * Automation Route
 * GET  /api/automations - list the authenticated user's rules
 * POST /api/automations - create a rule
 *
 * Thin handler: query validation, input validation and the JSON-string
 * serialisation of `triggerConfig`/`actionConfig` live in `AutomationService`.
 */

/**
 * GET /api/automations
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryData = {
      isActive:
        searchParams.get('isActive') !== null ? searchParams.get('isActive') === 'true' : undefined,
      triggerType: searchParams.get('triggerType') ?? undefined,
      actionType: searchParams.get('actionType') ?? undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };
    const validated = automationQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 },
      );
    }

    const rules = await automationService.list(userIdFromSession(session), validated.data);

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
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const rule = await automationService.create(userIdFromSession(session), body);

    return NextResponse.json({ success: true, data: rule }, { status: 201 });
  } catch (error) {
    console.error('Error creating automation:', error);
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create automation' }, { status: 500 });
  }
}
