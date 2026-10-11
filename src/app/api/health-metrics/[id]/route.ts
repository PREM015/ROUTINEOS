import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { healthMetricService } from '@/server/services/health-metric.service';
import { updateHealthMetricSchema } from '@/schemas/health-metric.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

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

    const metric = await healthMetricService.getForUser(userIdFromSession(session), paramId);

    return NextResponse.json({ success: true, data: metric });
  } catch (error) {
    return handleError(error);
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
      userIdFromSession(session),
      paramId,
      validated.data
    );
    return NextResponse.json({ success: true, data: metric });
  } catch (error) {
    return handleError(error);
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

    await healthMetricService.delete(userIdFromSession(session), paramId);
    return NextResponse.json({ success: true, data: { id: paramId } });
  } catch (error) {
    return handleError(error);
  }
}
