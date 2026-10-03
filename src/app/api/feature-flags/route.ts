import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { featureFlagService } from '@/server/services/feature-flag.service';
import { NotFoundError } from '@/lib/errors/app-error';
import { toggleUserFlagSchema } from '@/schemas/feature-flag.schema';
import type { Role } from '@/generated/prisma';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/feature-flags
 * List all feature flags with the current user's effective availability.
 *
 * Any signed-in user may read this. It is not the admin list — that is
 * `GET /api/admin/feature-flags`, which is admin-gated.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results = await featureFlagService.listForUser(
      userIdFromSession(session),
      (session.user as { role?: string }).role as Role | undefined
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
 *
 * This sets a *per-user* override. It is deliberately open to any signed-in
 * user, which is why it is a different endpoint from the admin flag API rather
 * than the same one with a weaker check.
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

    const flag = await featureFlagService.setForUser(
      validated.data.key,
      userIdFromSession(session),
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
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Feature flag not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to toggle feature flag' },
      { status: 500 }
    );
  }
}
