import { auth } from '@/lib/auth';
import { tagService } from '@/server/services/tag.service';
import { createTagSchema } from '@/schemas/tag.schema';
import { ConflictError, NotFoundError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * Tag Route
 * GET  /api/tags – list the authenticated user's tags
 * POST /api/tags – create a tag
 *
 * Thin handler: validation and data access live in `TagService`.
 */

/**
 * GET /api/tags
 * List all tags for the user, oldest first.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tags = await tagService.list(userIdFromSession(session));

    return NextResponse.json({ success: true, data: tags });
  } catch (error) {
    console.error('Error fetching tags:', error);
    return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
  }
}

/**
 * POST /api/tags
 * Create a tag for the user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createTagSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 },
      );
    }

    const tag = await tagService.create(userIdFromSession(session), validated.data);

    return NextResponse.json({ success: true, data: tag }, { status: 201 });
  } catch (error) {
    console.error('Error creating tag:', error);
    if (error instanceof ConflictError || error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create tag' }, { status: 500 });
  }
}
