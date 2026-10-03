import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { createFocusSessionSchema, focusQuerySchema } from '@/schemas/focus.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/focus
 * Fetch focus sessions for the authenticated user with date/status filters
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryData = {
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      status: searchParams.get('status') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
    };

    const validated = focusQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { data, meta } = await focusService.listSessions(
      userIdFromSession(session),
      validated.data
    );

    return NextResponse.json({ success: true, data, meta });
  } catch (error) {
    console.error('Error fetching focus sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch focus sessions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/focus
 * Create a new focus session
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createFocusSessionSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const focusSession = await focusService.createSession(
      userIdFromSession(session),
      validated.data
    );

    return NextResponse.json(
      { success: true, data: focusSession },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating focus session:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to create focus session' },
      { status: 500 }
    );
  }
}
