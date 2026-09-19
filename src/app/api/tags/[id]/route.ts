import { auth } from '@/lib/auth';
import { TagRepository } from '@/server/repositories/tag.repository';
import { updateTagSchema } from '@/schemas/tag.schema';
import { ConflictError, NotFoundError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Tag by ID Route
 * GET    /api/tags/[id] – fetch a single tag
 * PATCH  /api/tags/[id] – update a tag
 * DELETE /api/tags/[id] – delete a tag
 */

interface RouteContext {
  params: { id: string };
}

/**
 * GET /api/tags/[id]
 * Fetch a single tag owned by the user.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tagRepository = new TagRepository();
    const tag = await tagRepository.findById(session.user.id, params.id);

    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: tag });
  } catch (error) {
    console.error('Error fetching tag:', error);
    return NextResponse.json({ error: 'Failed to fetch tag' }, { status: 500 });
  }
}

/**
 * PATCH /api/tags/[id]
 * Update a tag owned by the user.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = updateTagSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const tagRepository = new TagRepository();
    const existing = await tagRepository.findById(session.user.id, params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    if (Object.keys(validated.data).length === 0) {
      return NextResponse.json({ success: true, data: existing });
    }

    const tag = await tagRepository.update(session.user.id, params.id, validated.data);
    return NextResponse.json({ success: true, data: tag });
  } catch (error) {
    console.error('Error updating tag:', error);
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update tag' }, { status: 500 });
  }
}

/**
 * DELETE /api/tags/[id]
 * Delete a tag owned by the user.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tagRepository = new TagRepository();
    const existing = await tagRepository.findById(session.user.id, params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    await tagRepository.delete(session.user.id, params.id);
    return NextResponse.json({ success: true, data: { id: params.id } });
  } catch (error) {
    console.error('Error deleting tag:', error);
    return NextResponse.json({ error: 'Failed to delete tag' }, { status: 500 });
  }
}