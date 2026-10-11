import { auth, signOut } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { AuthService } from '@/server/services/auth.service';
import { NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

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
    const result = await authService.logoutAll(userIdFromSession(session));
    await signOut({ redirect: false });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleError(error);
  }
}
