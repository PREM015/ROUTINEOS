import { auth } from '@/lib/auth';
import { adminService, ForbiddenError } from '@/server/services/admin.service';
import type { Role } from '@/generated/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

const ROLES = ['USER', 'ADMIN', 'MODERATOR'] as const;

/**
 * GET /api/admin/users
 * Get all users (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await adminService.requireAdmin(userIdFromSession(session));
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      throw error;
    }

    const { searchParams } = new URL(request.url);
    const roleParam = searchParams.get('role');
    const role = ROLES.includes(roleParam as (typeof ROLES)[number])
      ? (roleParam as Role)
      : undefined;

    const { users, meta } = await adminService.listUsers({
      search: searchParams.get('search') ?? undefined,
      role,
      limit: Number.parseInt(searchParams.get('limit') || '50', 10),
      offset: Number.parseInt(searchParams.get('offset') || '0', 10),
    });

    return NextResponse.json({ success: true, data: users, meta });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
