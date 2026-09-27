import { auth } from '@/lib/auth';
import { adminService, ForbiddenError } from '@/server/services/admin.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/stats
 * Get system-wide statistics (admin only)
 */
export async function GET(_request: NextRequest) {
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

    const stats = await adminService.getStats();

    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
