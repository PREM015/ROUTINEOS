import { auth, signOut } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { NextResponse } from 'next/server';

/**
 * POST /api/auth/logout
 * End the current session for the authenticated user.
 */
export async function POST() {
  try {
    const session = await auth();
    if (session?.user) {
      await signOut({ redirect: false });
    }

    return NextResponse.json({ success: true, data: { loggedOut: true } });
  } catch (error) {
    return handleError(error);
  }
}
