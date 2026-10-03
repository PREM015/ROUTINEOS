import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { RoutineService } from '@/server/services/routine.service';
import { NotFoundError } from '@/lib/errors/app-error';
import { ValidationError } from '@/lib/errors/app-error';
import { timeSchema, energyLevelSchema } from '@/lib/validation/routine.schema';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

/**
 * GET  /api/routine/[id]/blocks   the template's blocks, in time order
 * POST /api/routine/[id]/blocks   add a block to a named template
 *
 * ## What changed here
 *
 * Both handlers queried Prisma through `@/lib/db` directly, and the `POST`
 * schema required a `type` field — `WORK | REST | LEARNING | EXERCISE | ROUTINE
 * | FLEX` — that **is not a column on `RoutineBlock`**. The handler then
 * destructured `type` out of the parsed data and spread the rest, so the field
 * was dropped and the block was created without it. A schema that demands a
 * value and then throws it away is worse than no schema: it tells the caller
 * their request was validated when it was silently rewritten.
 *
 * It now delegates to `RoutineService.addBlock`, which verifies template
 * ownership, uses the canonical overlap check, reports overlaps as warnings
 * rather than rejecting the write, and appends at `max(sortOrder) + 1` instead of
 * the literal `0` this handler used (which put every block created without an
 * explicit position at the head of the template in an arbitrary order).
 */

const routineService = new RoutineService();

/*
 * F8. The `HH:mm` pattern and the energy enum were re-declared inline here while
 * `timeSchema` and `energyLevelSchema` already existed in the shared module and
 * were used by the sibling route one directory up. Same rule, two spellings —
 * and the inline copy is the one that had drifted, since it lacked the
 * `energyLevelSchema` nullability that makes clearing a level possible.
 */
const createBlockSchema = z.object({
  title: z.string().min(1).max(100),
  startTime: timeSchema,
  endTime: timeSchema,
  description: z.string().max(2000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  energyLevel: energyLevelSchema.optional(),
  trackCompletion: z.boolean().optional(),
  isRecurring: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Ownership first: the service refuses a template the caller does not own,
    // so this cannot be used to enumerate another account's block ids.
    const template = await routineService.getTemplate(userIdFromSession(session), id);
    if (!template) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    const blocks = await routineService.getBlocks(userIdFromSession(session), id);
    return NextResponse.json({ success: true, data: blocks });
  } catch (error) {
    console.error('Error fetching routine blocks:', error);
    return NextResponse.json({ error: 'Failed to fetch blocks' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const data = createBlockSchema.parse(body);

    const { block, warnings } = await routineService.addBlock(userIdFromSession(session), id, {
      title: data.title,
      startTime: data.startTime,
      endTime: data.endTime,
      description: data.description ?? undefined,
      notes: data.notes ?? undefined,
      color: data.color ?? undefined,
      icon: data.icon ?? undefined,
      categoryId: data.categoryId ?? undefined,
      energyLevel: data.energyLevel ?? undefined,
      trackCompletion: data.trackCompletion,
      isRecurring: data.isRecurring,
      sortOrder: data.sortOrder,
    });

    // Overlaps are legal, so this is a 201 with a warning, not a rejection.
    return NextResponse.json(
      { success: true, data: block, warnings },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.flatten() },
        { status: 400 }
      );
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error creating routine block:', error);
    return NextResponse.json({ error: 'Failed to create block' }, { status: 500 });
  }
}