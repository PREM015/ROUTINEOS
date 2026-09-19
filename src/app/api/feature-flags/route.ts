import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { FeatureFlagRepository } from '@/server/repositories/feature-flag.repository';
import { toggleUserFlagSchema } from '@/schemas/feature-flag.schema';
import { checkFlag } from '@/lib/feature-flags/checker';

/**
 * GET /api/feature-flags
 * List all feature flags with the current user's effective availability.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const flags = await new FeatureFlagRepository().findAll();
    const results = await Promise.all(
      flags.map(async (flag) => {
        const result = await checkFlag(flag.key, {
          userId: session.user.id,
          role: (session.user as { role?: string }).role as
            | 'USER'
            | 'ADMIN'
            | 'MODERATOR'
            | undefined,
        });
        return {
          key: flag.key,
          name: flag.name,
          description: flag.description,
          isEnabled: flag.isEnabled,
          rolloutPercent: flag.rolloutPercent,
          enabled: result.isEnabled,
          reason: result.reason,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: results,
      meta: { total: results.length },
    });
  } catch (error) {
    console.error('Error listing feature flags:', error);
    return NextResponse.json(
      { error: 'Failed to list feature flags' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/feature-flags
 * Toggle a feature flag for the authenticated user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = toggleUserFlagSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const repository = new FeatureFlagRepository();
    const existing = await repository.findByKey(validated.data.key);
    if (!existing) {
      return NextResponse.json({ error: 'Feature flag not found' }, { status: 404 });
    }

    const flag = await repository.setForUser(
      validated.data.key,
      session.user.id,
      validated.data.enabled
    );

    return NextResponse.json({
      success: true,
      data: {
        key: flag.key,
        enabled: validated.data.enabled,
      },
    });
  } catch (error) {
    console.error('Error toggling feature flag:', error);
    return NextResponse.json(
      { error: 'Failed to toggle feature flag' },
      { status: 500 }
    );
  }
}