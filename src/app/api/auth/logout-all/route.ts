import { auth, signOut } from '@/lib/auth';
import { AuthService } from '@/server/services/auth.service';
import { NextResponse } from 'next/server';

/**
 * POST /api/auth/logout-all
 * Revoke every device session for the authenticated user and end the
 * current session.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authService = new AuthService();
    const result = await authService.logoutAll(session.user.id);
    await signOut({ redirect: false });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error revoking all sessions:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to revoke all sessions' },
      { status: 500 }
    );
  }
}