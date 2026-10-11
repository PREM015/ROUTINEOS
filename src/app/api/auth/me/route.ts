import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { AuthService } from '@/server/services/auth.service';
import { NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/auth/me
 * Fetch the complete profile (with settings) for the authenticated user.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authService = new AuthService();
    const user = await authService.getCurrentUser(userIdFromSession(session));

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    return handleError(error);
  }
}
