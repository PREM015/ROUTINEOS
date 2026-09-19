import { auth, signOut } from '@/lib/auth';
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
    console.error('Error signing out:', error);
    return NextResponse.json(
      { error: 'Failed to sign out' },
      { status: 500 }
    );
  }
}