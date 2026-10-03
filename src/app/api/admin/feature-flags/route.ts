import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { featureFlagService } from '@/server/services/feature-flag.service';
import { AuthorizationError, ConflictError } from '@/lib/errors/app-error';
import { createFeatureFlagSchema } from '@/schemas/feature-flag.schema';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/admin/feature-flags
 * List all feature flags (admin only).
 *
 * The `role !== 'ADMIN'` check was duplicated in both handlers; it is now
 * `FeatureFlagService.assertAdmin`, so the two cannot drift.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const flags = await featureFlagService.listAllForAdmin(userIdFromSession(session));

    return NextResponse.json({
      success: true,
      data: flags,
      meta: { total: flags.length },
    });
  } catch (error) {
    console.error('Error listing feature flags:', error);
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to list feature flags' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/feature-flags
 * Create a new feature flag (admin only).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createFeatureFlagSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const flag = await featureFlagService.createStrict(userIdFromSession(session), validated.data);

    return NextResponse.json(
      { success: true, data: flag },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating feature flag:', error);
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: 'Failed to create feature flag' },
      { status: 500 }
    );
  }
}
