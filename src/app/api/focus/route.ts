import { auth } from '@/lib/auth';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { createFocusSessionSchema, focusQuerySchema } from '@/schemas/focus.schema';
import { getFocusSessionStatus } from '@/types/focus';
import { NextRequest, NextResponse } from 'next/server';

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

    const repository = new FocusRepository();
    const sessions = await repository.findSessions(session.user.id, {
      from: validated.data.from,
      to: validated.data.to,
      limit: validated.data.limit,
      offset: validated.data.offset,
    });

    const statusFilter = validated.data.status;
    const filtered = statusFilter
      ? sessions.filter((item) => {
          const status = getFocusSessionStatus(item);
          if (statusFilter === 'ACTIVE' || statusFilter === 'IN_PROGRESS') {
            return status === 'IN_PROGRESS';
          }
          return status === statusFilter;
        })
      : sessions;

    const data = filtered.map((item) => ({
      ...item,
      status: getFocusSessionStatus(item),
    }));

    return NextResponse.json({
      success: true,
      data,
      meta: {
        total: filtered.length,
        limit: validated.data.limit,
        offset: validated.data.offset,
      },
    });
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

    const repository = new FocusRepository();
    const focusSession = await repository.createSession(session.user.id, {
      title: validated.data.title,
      description: validated.data.description,
      categoryId: validated.data.categoryId,
      plannedDuration: validated.data.plannedDuration,
      techniques: validated.data.techniques,
      energyBefore: validated.data.energyBefore,
      startedAt: validated.data.startedAt,
    });

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