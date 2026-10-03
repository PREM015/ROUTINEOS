import { auth } from '@/lib/auth';
import { healthMetricService } from '@/server/services/health-metric.service';
import { NotFoundError } from '@/lib/errors/app-error';
import { updateHealthMetricSchema } from '@/schemas/health-metric.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Health Metric by ID Route
 * GET    /api/health-metrics/[id] – fetch a single health metric
 * PATCH  /api/health-metrics/[id] – update a health metric
 * DELETE /api/health-metrics/[id] – delete a health metric
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/health-metrics/[id]
 * Fetch a single health metric owned by the user.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id: paramId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const metric = await healthMetricService.getForUser(session.user.id, paramId);

    return NextResponse.json({ success: true, data: metric });
  } catch (error) {
    console.error('Error fetching health metric:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Health metric not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to fetch health metric' }, { status: 500 });
  }
}

/**
 * PATCH /api/health-metrics/[id]
 * Update a health metric owned by the user.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id: paramId } = await params;
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

    const metric = await healthMetricService.update(
      session.user.id,
      paramId,
      validated.data
    );
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
  const { id: paramId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await healthMetricService.delete(session.user.id, paramId);
    return NextResponse.json({ success: true, data: { id: paramId } });
  } catch (error) {
    console.error('Error deleting health metric:', error);
    // Previously unmapped, so a metric deleted between the existence check and
    // the delete surfaced as a 500 instead of the 404 the other two verbs return.
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Health metric not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete health metric' }, { status: 500 });
  }
}
