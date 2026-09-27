import { auth } from '@/lib/auth';
import { adminService, ForbiddenError } from '@/server/services/admin.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/audit-log
 * Get audit logs for a user (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await adminService.requireAdmin(session.user.id);
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      throw error;
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId parameter required' },
        { status: 400 }
      );
    }

    const limit = Number.parseInt(searchParams.get('limit') || '100', 10);
    const offset = Number.parseInt(searchParams.get('offset') || '0', 10);

    const logs = await adminService.getAuditLogs(userId, { limit, offset });

    return NextResponse.json({
      success: true,
      data: logs,
      meta: { total: logs.length, limit, offset },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
