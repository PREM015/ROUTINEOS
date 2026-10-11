import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { CareerService } from '@/server/services/career.service';
import { handleError } from '@/lib/errors/error-handler';
import { z } from 'zod';
import { APPLICATION_STATUSES } from '@/constants/prisma-enums';

const updateApplicationSchema = z.object({
  status: z.enum(APPLICATION_STATUSES as [string, ...string[]]).optional(),
  notes: z.string().max(2000).nullable().optional(),
  compensation: z.string().max(200).nullable().optional(),
  rejectionReason: z.string().max(2000).nullable().optional(),
  rejectionFeedback: z.string().max(4000).nullable().optional(),
  followUpAt: z.coerce.date().nullable().optional(),
});

/**
 * GET    /api/job-applications/[id]
 * PATCH  /api/job-applications/[id] — move it along the pipeline.
 * DELETE /api/job-applications/[id]
 *
 * Another user's application is a 404, identical to one that does not exist.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const application = await new CareerService().getApplication(
      auth.auth.userId,
      id
    );

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: application });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const parsed = updateApplicationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const application = await new CareerService().updateApplication(
      auth.auth.userId,
      id,
      parsed.data as Parameters<CareerService['updateApplication']>[2]
    );

    return NextResponse.json({ success: true, data: application });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    await new CareerService().deleteApplication(auth.auth.userId, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}