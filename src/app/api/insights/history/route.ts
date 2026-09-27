import { auth } from '@/lib/auth';
import { insightReadService } from '@/server/services/insight.service';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';
import { UserService } from '@/server/services/user.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const historyQuerySchema = z
  .object({
    startDate: z.string().regex(DATE, 'startDate must be YYYY-MM-DD').optional(),
    endDate: z.string().regex(DATE, 'endDate must be YYYY-MM-DD').optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine(
    (data) =>
      !data.startDate || !data.endDate || data.startDate <= data.endDate,
    { message: 'startDate must be before or equal to endDate' }
  );

/** Default window when the caller supplies neither bound: last 30 days. */
function defaultWindow(timezone: string) {
  const end = getTodayString(timezone);
  const startDate = new Date(`${end}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - 29);
  return { startDate: startDate.toISOString().slice(0, 10), endDate: end };
}

/**
 * GET /api/insights/history?startDate=&endDate=&limit=
 *
 * Returns the signed-in user's generated insights for a calendar window, newest
 * first.
 *
 * This route used to be a three-line stub that answered `200 { ok: true, data: [] }`
 * for every caller — indistinguishable from "you have no insights", and it also
 * broke the `{ success, data }` response contract. It is now backed by
 * `InsightReadService` / `InsightRepository`.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const validated = historyQuerySchema.safeParse({
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      limit: searchParams.get('limit') || undefined,
    });

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const timezone = await new UserService()
      .getTimezone(session.user.id)
      .catch(() => DEFAULT_TZ);
    const fallback = defaultWindow(timezone);

    const startDate = validated.data.startDate ?? fallback.startDate;
    const endDate = validated.data.endDate ?? fallback.endDate;

    const insights = await insightReadService.getInsightHistory(
      session.user.id,
      startDate,
      endDate
    );

    return NextResponse.json({
      success: true,
      data: validated.data.limit ? insights.slice(0, validated.data.limit) : insights,
      meta: { startDate, endDate, total: insights.length },
    });
  } catch (error) {
    console.error('Error fetching insight history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch insight history' },
      { status: 500 }
    );
  }
}
