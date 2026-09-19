import { auth } from '@/lib/auth';
import { UserService } from '@/server/services/user.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/users/search
 * Search for users by name, display name or email. The current user is
 * excluded from the results.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') ?? '';
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 25, 1), 100);

    const userService = new UserService();
    const users = await userService.searchUsers(query, limit);
    const results = users.filter((user) => user.id !== session.user.id);

    return NextResponse.json({
      success: true,
      data: results,
      meta: { total: results.length, limit: results.length },
    });
  } catch (error) {
    console.error('Error searching users:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to search users' },
      { status: 500 }
    );
  }
}