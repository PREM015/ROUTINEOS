import { auth } from '@/lib/auth';
import { HealthMetricRepository } from '@/server/repositories/health-metric.repository';
import { healthMetricSchema, healthMetricQuerySchema } from '@/schemas/health-metric.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Health Metric Route
 * GET  /api/health-metrics – list health metrics for the authenticated user
 * POST /api/health-metrics – create a health metric entry
 */

/**
 * GET /api/health-metrics
 * List health metrics, optionally filtered by date range, metric type,
 * time of day, or source, with pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryData = {
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
      metricType: searchParams.get('metricType') ?? undefined,
      timeOfDay: searchParams.get('timeOfDay') ?? undefined,
      source: searchParams.get('source') ?? undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const validated = healthMetricQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const healthMetricRepository = new HealthMetricRepository();
    const metrics = await healthMetricRepository.findAll(session.user.id, {
      startDate: validated.data.startDate,
      endDate: validated.data.endDate,
      metricType: validated.data.metricType,
      timeOfDay: validated.data.timeOfDay,
      source: validated.data.source,
      limit: validated.data.limit,
      offset: validated.data.offset,
    });

    return NextResponse.json({
      success: true,
      data: metrics,
      meta: {
        total: metrics.length,
        limit: validated.data.limit ?? 30,
        offset: validated.data.offset ?? 0,
      },
    });
  } catch (error) {
    console.error('Error fetching health metrics:', error);
    return NextResponse.json({ error: 'Failed to fetch health metrics' }, { status: 500 });
  }
}

/**
 * POST /api/health-metrics
 * Create a new health metric entry for the authenticated user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = healthMetricSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const healthMetricRepository = new HealthMetricRepository();
    const metric = await healthMetricRepository.create(session.user.id, validated.data);

    return NextResponse.json({ success: true, data: metric }, { status: 201 });
  } catch (error) {
    console.error('Error creating health metric:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create health metric' }, { status: 500 });
  }
}