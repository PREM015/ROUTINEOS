import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { breakQuerySchema, createBreakSchema } from '@/schemas/focus.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/breaks
 * Fetch breaks for the authenticated user with date/type filters
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
      breakType: searchParams.get('breakType') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
    };

    const validated = breakQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { data, meta } = await focusService.listBreaks(
      userIdFromSession(session),
      validated.data
    );

    return NextResponse.json({ success: true, data, meta });
  } catch (error) {
    console.error('Error fetching breaks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch breaks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/breaks
 * Log a break (type, minutes, quality/mood, notes)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createBreakSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const record = await focusService.createBreak(userIdFromSession(session), validated.data);

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error) {
    console.error('Error logging break:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to log break' }, { status: 500 });
  }
}
