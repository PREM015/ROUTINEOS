import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { focusDayTypeTargetSchema } from '@/schemas/focus.schema';
import { userIdFromSession } from '@/types/ids';
import { AppError } from '@/lib/errors/app-error';

/**
 * GET /api/focus/day-type-targets
 *
 * Per-day-type target overrides, keyed by `DayTypeDefinition.id` (not the legacy
 * `DayType` enum), returned as a plain object rather than a `Map` so it serialises.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const targets = await focusService.listDayTypeTargets(userIdFromSession(session));
    return NextResponse.json({
      success: true,
      data: Object.fromEntries(targets),
    });
  } catch (error) {
    console.error('Error loading focus day-type targets:', error);
    return NextResponse.json({ error: 'Failed to load day-type targets' }, { status: 500 });
  }
}

/**
 * PUT /api/focus/day-type-targets
 *
 * `targetMinutes: null` clears the override. That is deliberately distinct from
 * `0`: "no override, fall back to the daily target" and "override to zero focus
 * minutes" mean opposite things, and collapsing them would let a bad save void a day's
 * goal instead of removing the override.
 */
export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = focusDayTypeTargetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await focusService.setDayTypeTarget(
      userIdFromSession(session),
      parsed.data.dayTypeId,
      parsed.data.targetMinutes ?? null
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating focus day-type target:', error);
    return NextResponse.json({ error: 'Failed to update day-type target' }, { status: 500 });
  }
}