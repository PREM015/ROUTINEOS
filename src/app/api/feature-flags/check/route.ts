import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { featureFlagService } from '@/server/services/feature-flag.service';
import { NotFoundError } from '@/lib/errors/app-error';
import { featureFlagKeySchema } from '@/schemas/feature-flag.schema';
import type { Role } from '@/generated/prisma';

/**
 * GET /api/feature-flags/check?key=<flagKey>
 * Check whether a feature flag is enabled for the current user.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawKey = searchParams.get('key') ?? searchParams.get('name');

    const validated = featureFlagKeySchema.safeParse(rawKey);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Valid key query parameter is required' },
        { status: 400 }
      );
    }

    const data = await featureFlagService.checkForUser(
      validated.data,
      session.user.id,
      (session.user as { role?: string }).role as Role | undefined
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error checking feature flag:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Feature flag not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to check feature flag' },
      { status: 500 }
    );
  }
}
