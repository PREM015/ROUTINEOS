import { auth } from '@/lib/auth';
import { BreakRepository } from '@/server/repositories/break.repository';
import { FocusRepository } from '@/server/repositories/focus.repository';
import { breakQuerySchema, createBreakSchema } from '@/schemas/focus.schema';
import { nextBreakAt } from '@/lib/focus/break-scheduler';
import { NextRequest, NextResponse } from 'next/server';

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

    const repository = new BreakRepository();
    const breaks = await repository.list(session.user.id, validated.data);
    const total = await repository.count(session.user.id, validated.data);

    let nextScheduledBreak: string | null = null;
    try {
      const focusRepository = new FocusRepository();
      const active = await focusRepository.findActiveByUserId(session.user.id);

      if (active) {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

        if (active.startedAt >= startOfToday && active.startedAt < endOfToday) {
          const next = nextBreakAt(active.startedAt, active.plannedDuration);
          nextScheduledBreak = next ? next.toISOString() : null;
        }
      }
    } catch {
      // Scheduled-break hint is best-effort; never fail the listing request
      nextScheduledBreak = null;
    }

    return NextResponse.json({
      success: true,
      data: breaks,
      meta: {
        total,
        limit: validated.data.limit,
        offset: validated.data.offset,
        nextScheduledBreak,
      },
    });
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

    const repository = new BreakRepository();
    const record = await repository.create(session.user.id, {
      focusSessionId: validated.data.focusSessionId,
      breakType: validated.data.breakType,
      startedAt: validated.data.startedAt,
      endedAt: validated.data.endedAt,
      durationMinutes: validated.data.durationMinutes,
      quality: validated.data.quality,
      notes: validated.data.notes,
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error) {
    console.error('Error logging break:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to log break' }, { status: 500 });
  }
}