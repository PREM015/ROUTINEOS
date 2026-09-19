import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagRepository } from '@/server/repositories/feature-flag.repository';
import { checkFlag } from '@/lib/feature-flags/checker';
import { featureFlagKeySchema } from '@/schemas/feature-flag.schema';

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

    const flag = await new FeatureFlagRepository().findByKey(validated.data);
    if (!flag) {
      return NextResponse.json({ error: 'Feature flag not found' }, { status: 404 });
    }

    const result = await checkFlag(flag.key, {
      userId: session.user.id,
      role: (session.user as { role?: string }).role as
        | 'USER'
        | 'ADMIN'
        | 'MODERATOR'
        | undefined,
    });

    return NextResponse.json({
      success: true,
      data: { key: flag.key, enabled: result.isEnabled, reason: result.reason },
    });
  } catch (error) {
    console.error('Error checking feature flag:', error);
    return NextResponse.json(
      { error: 'Failed to check feature flag' },
      { status: 500 }
    );
  }
}