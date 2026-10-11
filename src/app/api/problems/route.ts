import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { CareerService } from '@/server/services/career.service';
import { handleError } from '@/lib/errors/error-handler';
import { z } from 'zod';

const createProblemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  platform: z.string().trim().max(64).nullable().optional(),
  problemUrl: z.string().url().max(500).nullable().optional(),
  difficulty: z.string().trim().max(32).nullable().optional(),
  topicTags: z.string().trim().max(300).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  solved: z.boolean().optional(),
});

/**
 * GET  /api/problems — the caller's DSA log, optionally filtered to what is due.
 * POST /api/problems — log a solved problem and schedule its first review.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const problems = await new CareerService().listProblems(auth.auth.userId, {
      dueBefore: searchParams.get('dueBefore') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      limit: searchParams.get('limit')
        ? parseInt(searchParams.get('limit') as string, 10)
        : undefined,
    });

    return NextResponse.json({ success: true, data: problems });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const parsed = createProblemSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const problem = await new CareerService().createProblem(
      auth.auth.userId,
      parsed.data
    );

    return NextResponse.json({ success: true, data: problem }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}