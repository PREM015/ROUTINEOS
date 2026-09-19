import { auth } from '@/lib/auth';
import { AuditRepository } from '@/server/repositories/audit.repository';
import { NextRequest, NextResponse } from 'next/server';

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

    if (session.user.id !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(searchParams.get('limit')) || 20, 1),
      100
    );
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    const auditRepository = new AuditRepository();
    const events = await auditRepository.findByUserId(id, { limit, offset });

    return NextResponse.json({
      success: true,
      data: events,
      meta: { total: events.length, limit, offset },
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch user activity' },
      { status: 500 }
    );
  }
}