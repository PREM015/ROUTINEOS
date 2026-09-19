import { auth } from '@/lib/auth';
import { adminRepository } from '@/server/repositories/admin.repository';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/users
 * List users with pagination and optional search. Admin-only endpoint.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const limit = Math.min(
      Math.max(Number(searchParams.get('limit')) || 25, 1),
      100
    );
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    const [users, total] = await Promise.all([
      adminRepository.listUsers({ limit, offset, search }),
      adminRepository.countUsers(search),
    ]);

    return NextResponse.json({
      success: true,
      data: users,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Error listing users:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to list users' },
      { status: 500 }
    );
  }
}