import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { CareerService } from '@/server/services/career.service';
import { handleError } from '@/lib/errors/error-handler';
import { z } from 'zod';

const updateProblemSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  platform: z.string().trim().max(64).nullable().optional(),
  problemUrl: z.string().url().max(500).nullable().optional(),
  difficulty: z.string().trim().max(32).nullable().optional(),
  topicTags: z.string().trim().max(300).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: z.string().trim().max(32).optional(),
});

/**
 * GET    /api/problems/[id] — one problem.
 * PATCH  /api/problems/[id] — edit its details.
 * DELETE /api/problems/[id] — remove it.
 *
 * A problem belonging to another user is a 404, identical to one that does not
 * exist.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const problem = await new CareerService().getProblem(auth.auth.userId, id);

    if (!problem) {
      return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: problem });
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
    const parsed = updateProblemSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const problem = await new CareerService().updateProblem(
      auth.auth.userId,
      id,
      parsed.data
    );

    return NextResponse.json({ success: true, data: problem });
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
    await new CareerService().deleteProblem(auth.auth.userId, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}