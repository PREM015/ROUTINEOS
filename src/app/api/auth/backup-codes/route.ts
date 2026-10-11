import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { NextResponse } from 'next/server';

const BACKUP_CODES_UNAVAILABLE = 'Two-factor backup codes are not available yet';

/**
 * GET /api/auth/backup-codes
 * List the two-factor backup codes for the authenticated user.
 *
 * NOTE: AuthService does not yet expose a backup-codes API, so this route
 * reports that the feature is unavailable rather than inventing logic here.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: BACKUP_CODES_UNAVAILABLE },
      { status: 400 }
    );
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/auth/backup-codes
 * Regenerate the two-factor backup codes for the authenticated user.
 *
 * NOTE: AuthService does not yet expose a backup-codes API, so this route
 * reports that the feature is unavailable rather than inventing logic here.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: BACKUP_CODES_UNAVAILABLE },
      { status: 400 }
    );
  } catch (error) {
    return handleError(error);
  }
}
