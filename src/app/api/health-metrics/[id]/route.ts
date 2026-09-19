import { auth } from '@/lib/auth';
import { HealthMetricRepository } from '@/server/repositories/health-metric.repository';
import { updateHealthMetricSchema } from '@/schemas/health-metric.schema';
import { NotFoundError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Health Metric by ID Route
 * GET    /api/health-metrics/[id] – fetch a single health metric
 * PATCH  /api/health-metrics/[id] – update a health metric
 * DELETE /api/health-metrics/[id] – delete a health metric
 */

interface RouteContext {
  params: { id: string };
}

/**
 * GET /api/health-metrics/[id]
 * Fetch a single health metric owned by the user.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const healthMetricRepository = new HealthMetricRepository();
    const metric = await healthMetricRepository.findById(session.user.id, params.id);

    if (!metric) {
      return NextResponse.json({ error: 'Health metric not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: metric });
  } catch (error) {
    console.error('Error fetching health metric:', error);
    return NextResponse.json({ error: 'Failed to fetch health metric' }, { status: 500 });
  }
}

/**
 * PATCH /api/health-metrics/[id]
 * Update a health metric owned by the user.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = updateHealthMetricSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const healthMetricRepository = new HealthMetricRepository();
    const existing = await healthMetricRepository.findById(session.user.id, params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Health metric not found' }, { status: 404 });
    }

    if (Object.keys(validated.data).length === 0) {
      return NextResponse.json({ success: true, data: existing });
    }

    const metric = await healthMetricRepository.update(session.user.id, params.id, validated.data);
    return NextResponse.json({ success: true, data: metric });
  } catch (error) {
    console.error('Error updating health metric:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Health metric not found' }, { status: 404 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update health metric' }, { status: 500 });
  }
}

/**
 * DELETE /api/health-metrics/[id]
 * Delete a health metric owned by the user.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const healthMetricRepository = new HealthMetricRepository();
    const existing = await healthMetricRepository.findById(session.user.id, params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Health metric not found' }, { status: 404 });
    }

    await healthMetricRepository.delete(session.user.id, params.id);
    return NextResponse.json({ success: true, data: { id: params.id } });
  } catch (error) {
    console.error('Error deleting health metric:', error);
    return NextResponse.json({ error: 'Failed to delete health metric' }, { status: 500 });
  }
}