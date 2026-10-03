import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { RoutineService } from '@/server/services/routine.service';
import { z } from 'zod';
import { energyLevelSchema, timeSchema } from '@/lib/validation/routine.schema';
import { NotFoundError } from '@/lib/errors/app-error';
import { userIdFromSession } from '@/types/ids';

const routineService = new RoutineService();

/**
 * Block fields writable through the template-scoped path.
 *
 * `sortOrder` was missing from this schema once, and `z.object` strips unknown
 * keys: the reorder request sent `{ sortOrder }`, the value was silently
 * discarded, the PUT returned 200 with an unchanged block, and the arrows
 * appeared to do nothing.
 *
 * `type` / `isFlex` used to be accepted here but have no column on
 * `RoutineBlock`, so they were no-ops. Dropped: a field the API silently ignores
 * is worse than a 400.
 *
 * `energyLevel` is nullable so the level can be *cleared*, not only set — see
 * `energyLevelSchema`.
 */
const updateBlockSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  notes: z.string().max(10000).optional().nullable(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  color: z.string().max(20).optional().nullable(),
  icon: z.string().max(40).optional().nullable(),
  energyLevel: energyLevelSchema,
  trackCompletion: z.boolean().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

/**
 * PUT /api/routine/[id]/blocks/[blockId]
 * Update a block, or reorder it against `peerId` via `?peerId=`.
 *
 * A time clash comes back as `warnings` beside a 200. This path used to throw
 * `Time conflicts with "X"` and refuse the write, while its sibling
 * `updateBlockForUser` did not check at all — the same action rejected on one
 * route and silently accepted on the other.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, blockId } = await params;

  try {
    const body = await req.json();
    const data = updateBlockSchema.parse(body);

    // Reorder is a single atomic operation, not two independent PUTs. Doing it
    // client-side with two parallel requests meant a failure between them left
    // two blocks sharing a sortOrder.
    const peerId = req.nextUrl.searchParams.get('peerId');
    if (peerId) {
      const blocks = await routineService.reorderBlock(
        userIdFromSession(session),
        id,
        blockId,
        peerId
      );
      return NextResponse.json({ success: true, data: blocks });
    }

    const { block, warnings } = await routineService.updateBlock(
      userIdFromSession(session),
      id,
      blockId,
      data
    );

    return NextResponse.json({ success: true, data: block, warnings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.flatten() },
        { status: 400 }
      );
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error) {
      const status =
        error.message === 'Block not found'
          ? 404
          : error.message === 'Block belongs to a different template'
            ? 409
            : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error('Error updating routine block:', error);
    return NextResponse.json({ error: 'Failed to update block' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, blockId } = await params;

  try {
    await routineService.deleteBlock(userIdFromSession(session), id, blockId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error) {
      const status =
        error.message === 'Block not found'
          ? 404
          : error.message === 'Block belongs to a different template'
            ? 409
            : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error('Error deleting routine block:', error);
    return NextResponse.json({ error: 'Failed to delete block' }, { status: 500 });
  }
}