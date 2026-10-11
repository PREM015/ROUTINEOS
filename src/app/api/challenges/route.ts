import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { challengeService } from '@/server/services/challenge.service';
import { createChallengeSchema } from '@/schemas/challenge.schema';
import { userIdFromSession } from '@/types/ids';

/**
 * GET /api/challenges
 * List public challenges and challenges the user has joined.
 *
 * The response assembly (merging active + joined, de-duplicating by id, and
 * flattening the `creator` / `_count.members` relations onto the row) now lives in
 * `ChallengeService.listForUser`; this route only authenticates.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await challengeService.listForUser(userIdFromSession(session));

    return NextResponse.json({
      success: true,
      data,
      meta: { total: data.length },
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/challenges
 * Create a new challenge as the authenticated user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createChallengeSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const challenge = await challengeService.create(userIdFromSession(session), validated.data);

    return NextResponse.json(
      { success: true, data: challenge },
      { status: 201 }
    );
  } catch (error) {
    return handleError(error);
  }
}
