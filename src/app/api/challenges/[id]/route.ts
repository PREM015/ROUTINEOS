import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { challengeService } from '@/server/services/challenge.service';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import { updateChallengeProgressSchema } from '@/schemas/challenge.schema';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Challenge by ID Route
 * GET    /api/challenges/[id] – fetch a single challenge
 * PATCH  /api/challenges/[id] – update the caller's progress
 * DELETE /api/challenges/[id] – delete, creator only
 *
 * The existence / membership / creator checks moved into `ChallengeService`; the
 * `catch` blocks below only translate its typed errors back into the status codes
 * this API has always returned, so the response shape is unchanged.
 */

/**
 * GET /api/challenges/[id]
 * Fetch a single challenge with membership details.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid challenge id' }, { status: 400 });
    }

    const data = await challengeService.getForUser(id, session.user.id);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching challenge:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    // A private challenge the caller has not joined.
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch challenge' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/challenges/[id]
 * Update the authenticated user's progress in a challenge.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid challenge id' }, { status: 400 });
    }

    const body = await request.json();
    const validated = updateChallengeProgressSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const result = await challengeService.setProgress(
      id,
      session.user.id,
      validated.data
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error updating challenge progress:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    // "Join the challenge to update progress" — 403, not 400.
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to update challenge progress' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/challenges/[id]
 * Delete a challenge the authenticated user created.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid challenge id' }, { status: 400 });
    }

    await challengeService.delete(id, session.user.id);

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('Error deleting challenge:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    // "Only the challenge creator can delete it" — 403.
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to delete challenge' },
      { status: 500 }
    );
  }
}
