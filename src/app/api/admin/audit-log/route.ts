import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { auditService } from '@/server/audit/audit.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/audit-log
 * Get audit logs (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const action = searchParams.get('action');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId parameter required' },
        { status: 400 }
      );
    }

    const logs = await auditService.getUserLogs(userId, {
      action: action as any,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: logs,
      meta: {
        total: logs.length,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}