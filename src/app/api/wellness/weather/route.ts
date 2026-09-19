import { auth } from '@/lib/auth';
import { WeatherRepository } from '@/server/repositories/weather.repository';
import { weatherLogSchema, weatherQuerySchema } from '@/schemas/wellness.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Wellness: Weather Route
 * GET  /api/wellness/weather – list weather logs for a date range
 * POST /api/wellness/weather – upsert a weather log for a date
 */

/**
 * GET /api/wellness/weather
 * Fetch weather logs for the authenticated user, oldest first.
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
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const validated = weatherQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const weatherRepository = new WeatherRepository();
    const logs = await weatherRepository.findByUserId(session.user.id, {
      startDate: validated.data.startDate,
      endDate: validated.data.endDate,
      limit: validated.data.limit,
      offset: validated.data.offset,
    });

    return NextResponse.json({
      success: true,
      data: logs,
      meta: {
        total: logs.length,
      },
    });
  } catch (error) {
    console.error('Error fetching weather logs:', error);
    return NextResponse.json({ error: 'Failed to fetch weather logs' }, { status: 500 });
  }
}

/**
 * POST /api/wellness/weather
 * Create or update a weather log for the user+date.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = weatherLogSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const weatherRepository = new WeatherRepository();
    const log = await weatherRepository.upsert(session.user.id, validated.data);

    return NextResponse.json({ success: true, data: log });
  } catch (error) {
    console.error('Error saving weather log:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to save weather log' }, { status: 500 });
  }
}