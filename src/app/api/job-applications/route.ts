import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { CareerService } from '@/server/services/career.service';
import { handleError } from '@/lib/errors/error-handler';
import { z } from 'zod';
import { APPLICATION_STATUSES } from '@/constants/prisma-enums';

const createApplicationSchema = z.object({
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  jobUrl: z.string().url().max(500).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  workMode: z.string().trim().max(32).nullable().optional(),
  status: z.enum(APPLICATION_STATUSES as [string, ...string[]]).optional(),
  compensation: z.string().trim().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  rejectionReason: z.string().max(2000).nullable().optional(),
  rejectionFeedback: z.string().max(4000).nullable().optional(),
  followUpAt: z.coerce.date().nullable().optional(),
});

/**
 * GET  /api/job-applications — the caller's pipeline, plus a status summary.
 * POST /api/job-applications — record an application.
 *
 * The response carries `counts` from the caller's own rows only. There is no
 * benchmark, no "others have applied", no aggregate across users.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const service = new CareerService();

    const [applications, counts] = await Promise.all([
      service.listApplications(
        auth.auth.userId,
        status
          ? (status as (typeof APPLICATION_STATUSES)[number])
          : undefined
      ),
      service.applicationSummary(auth.auth.userId),
    ]);

    return NextResponse.json({
      success: true,
      data: { applications, counts },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const parsed = createApplicationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const application = await new CareerService().createApplication(
      auth.auth.userId,
      parsed.data as Parameters<CareerService['createApplication']>[1]
    );

    return NextResponse.json({ success: true, data: application }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}