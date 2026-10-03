import { auth } from '@/lib/auth';
import { auditService } from '@/server/services/audit.service';
import { AuthorizationError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/users/[id]/activity
 * Fetch recent activity (events) for a user. Owner-only endpoint.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(searchParams.get('limit')) || 20, 1),
      100
    );
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    // `assertSelf` throws for a mismatched id; the 403 mapping moved to the
    // catch below so the check has exactly one implementation.
    const events = await auditService.activityFor(userIdFromSession(session), id, limit, offset);

    return NextResponse.json({
      success: true,
      data: events,
      meta: { total: events.length, limit, offset },
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);

    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch user activity' },
      { status: 500 }
    );
  }
}
