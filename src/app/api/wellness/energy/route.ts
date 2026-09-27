import { auth } from '@/lib/auth';
import { wellnessService } from '@/server/services/wellness.service';
import { energyLogSchema, energyQuerySchema } from '@/schemas/wellness.schema';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Wellness: Energy Route
 * GET  /api/wellness/energy – list energy check-ins, optionally returning an
 *                            energy-pattern analysis when `analyze=true`
 * POST /api/wellness/energy – log an energy check-in
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

    const result = await wellnessService.getEnergyLogs(session.user.id, {
      from: validated.data.from,
      to: validated.data.to,
      analyze: validated.data.analyze,
      limit: validated.data.limit,
      offset: validated.data.offset,
    });

    // Analysis mode returns the analysis as `data`; list mode returns the rows.
    if (validated.data.analyze) {
      return NextResponse.json({
        success: true,
        data: result.analysis,
        meta: result.meta,
      });
    }

    return NextResponse.json({ success: true, data: result.data, meta: result.meta });
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

    const log = await wellnessService.logEnergy(session.user.id, validated.data);

    return NextResponse.json({ success: true, data: log }, { status: 201 });
  } catch (error) {
    console.error('Error logging energy:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to log energy' }, { status: 500 });
  }
}
