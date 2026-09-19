import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { UserRepository } from '@/server/repositories/user.repository';
import { FeatureFlagRepository } from '@/server/repositories/feature-flag.repository';
import { createFeatureFlagSchema } from '@/schemas/feature-flag.schema';

/**
 * GET /api/admin/feature-flags
 * List all feature flags (admin only).
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await new UserRepository().findById(session.user.id);
    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const flags = await new FeatureFlagRepository().findAll();

    return NextResponse.json({
      success: true,
      data: flags,
      meta: { total: flags.length },
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
 * POST /api/admin/feature-flags
 * Create a new feature flag (admin only).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await new UserRepository().findById(session.user.id);
    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validated = createFeatureFlagSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const repository = new FeatureFlagRepository();
    const existing = await repository.findByKey(validated.data.key);
    if (existing) {
      return NextResponse.json(
        { error: 'Feature flag with this key already exists' },
        { status: 409 }
      );
    }

    const flag = await repository.create(validated.data);

    return NextResponse.json(
      { success: true, data: flag },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating feature flag:', error);
    return NextResponse.json(
      { error: 'Failed to create feature flag' },
      { status: 500 }
    );
  }
}