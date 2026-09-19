import { auth } from '@/lib/auth';
import { MoodRepository } from '@/server/repositories/mood.repository';
import { energyLogSchema, energyQuerySchema } from '@/schemas/wellness.schema';
import {
  analyzeEnergyPatterns,
  type EnergyPoint,
} from '@/lib/wellness/energy-patterns';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Wellness: Energy Route
 * GET  /api/wellness/energy – list energy check-ins, optionally returning an
 *                            energy-pattern analysis when `analyze=true`
 * POST /api/wellness/energy – log an energy check-in
 */

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { startDate: toDateString(start), endDate: toDateString(end) };
}

function toEnergyPoint(log: { timestamp: Date; energyLevel: number }): EnergyPoint {
  return {
    date: log.timestamp.toISOString().slice(0, 10),
    time: log.timestamp.toISOString().slice(11, 16),
    energy: log.energyLevel,
  };
}

/**
 * GET /api/wellness/energy
 * List energy check-ins over a date range. With `?analyze=true`, returns the
 * analyzeEnergyPatterns() result (peaks/troughs and high/low energy hours).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryData = {
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      analyze: searchParams.get('analyze') === 'true',
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const validated = energyQuerySchema.safeParse(queryData);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const range = defaultRange();
    const from = validated.data.from ?? range.startDate;
    const to = validated.data.to ?? range.endDate;

    const moodRepository = new MoodRepository();

    if (validated.data.analyze) {
      const logs = await moodRepository.getEnergyRange(session.user.id, from, to);
      const analysis = analyzeEnergyPatterns(logs.map(toEnergyPoint));
      return NextResponse.json({
        success: true,
        data: analysis,
        meta: { startDate: from, endDate: to, sampleCount: logs.length },
      });
    }

    const logs = await moodRepository.findEnergyByUserId(session.user.id, {
      from,
      to,
      limit: validated.data.limit ?? 30,
      offset: validated.data.offset ?? 0,
    });

    return NextResponse.json({
      success: true,
      data: logs,
      meta: {
        total: logs.length,
        limit: validated.data.limit ?? 30,
        offset: validated.data.offset ?? 0,
        startDate: from,
        endDate: to,
      },
    });
  } catch (error) {
    console.error('Error fetching energy logs:', error);
    return NextResponse.json({ error: 'Failed to fetch energy logs' }, { status: 500 });
  }
}

/**
 * POST /api/wellness/energy
 * Log an energy check-in.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = energyLogSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const moodRepository = new MoodRepository();
    const log = await moodRepository.logEnergy(session.user.id, validated.data);

    return NextResponse.json({ success: true, data: log }, { status: 201 });
  } catch (error) {
    console.error('Error logging energy:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to log energy' }, { status: 500 });
  }
}