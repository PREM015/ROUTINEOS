import { auth } from '@/lib/auth';
import { adminService, ForbiddenError } from '@/server/services/admin.service';
import { adminAnalyticsQuerySchema } from '@/schemas/admin.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

function toDateOnly(value: string): Date {
  const [y = '1970', m = '1', d = '1'] = value.split('-');
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

/**
 * GET /api/admin/analytics
 * System-wide analytics over an optional date range (admin only).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await adminService.requireAdmin(userIdFromSession(session));
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      throw error;
    }

    const { searchParams } = new URL(request.url);
    const validated = adminAnalyticsQuerySchema.safeParse({
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    });
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const from = validated.data.from ? toDateOnly(validated.data.from) : undefined;
    const to = validated.data.to ? toDateOnly(validated.data.to) : undefined;
    if (from && to && from > to) {
      return NextResponse.json(
        { error: 'from must be before or equal to to' },
        { status: 400 }
      );
    }

    const analytics = await adminService.getAnalytics({ gte: from, lte: to });

    return NextResponse.json({
      success: true,
      data: {
        period: { from: validated.data.from ?? null, to: validated.data.to ?? null },
        ...analytics,
      },
    });
  } catch (error) {
    console.error('Error fetching admin analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch admin analytics' },
      { status: 500 }
    );
  }
}
