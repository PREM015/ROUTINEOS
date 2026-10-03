import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { RoutineService } from '@/server/services/routine.service';
import { NotFoundError } from '@/lib/errors/app-error';
import { z } from 'zod';

/**
 * GET /api/routine/[id]              one template with its blocks
 * PUT /api/routine/[id]              rename / default flag / deactivate
 * DELETE /api/routine/[id]           delete the template (cascades its blocks)
 *
 * ## What changed here
 *
 * All three handlers queried Prisma through `@/lib/db` directly, bypassing the
 * repository layer entirely — the exact failure mode `FILE.MD` exists to
 * prevent, and the reason ownership, the one-default-per-day-type rule and the
 * slug rules had to be reimplemented here (and were, incorrectly: the `PUT`
 * compared `dayType` against the *stored* column, which is `'CUSTOM'` for every
 * template linked to a `DayTypeDefinition`, so "make this the default Workday"
 * cleared the default flag of templates that had nothing to do with Workday).
 *
 * `PUT` and `DELETE` now delegate to `RoutineService`, which owns both rules and
 * asserts ownership. `GET` gained a `RoutineService.getTemplate` so the read
 * goes through the repository too.
 */

const routineService = new RoutineService();

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isDefault: z.boolean().optional(),
  /** `isActive: false` hides the template from every resolver, `/today` included. */
  isActive: z.boolean().optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
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
    const template = await routineService.getTemplate(session.user.id, id);
    if (!template) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error('Error fetching routine template:', error);
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 });
  }
}

export async function PUT(
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
    const data = updateSchema.parse(body);

    // `updateTemplateForUser` re-checks ownership and preserves the
    // one-default-per-day-type invariant.
    const template = await routineService.updateTemplateForUser(session.user.id, id, data);
    return NextResponse.json({ success: true, data: template });
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
    if (error instanceof Error) {
      // Domain rule violations (e.g. duplicate default) are client errors.
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error updating routine template:', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Routes through the service so the block-vs-template disambiguation and the
    // ownership check are the same ones `DELETE /api/routine` uses. Deleting a
    // *block* through this path therefore cannot silently delete a template.
    const deleted = await routineService.deleteById(session.user.id, id);
    if (deleted !== 'template') {
      return NextResponse.json(
        { error: 'That id is a block, not a template. Use DELETE /api/routine.' },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }
    console.error('Error deleting routine template:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}