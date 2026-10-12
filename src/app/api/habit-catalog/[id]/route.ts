import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireAdmin } from '@/lib/auth/require-session';
import { HabitCatalogService } from '@/server/services/habit-catalog.service';
import { updateHabitDefinitionSchema } from '@/schemas/habit.schema';
import { handleError } from '@/lib/errors/error-handler';
import type { Prisma } from '@/generated/prisma';

/**
 * GET /api/habit-catalog/[id] — one catalogue entry.
 *
 * 404 when it does not exist or is inactive, so an inactive entry cannot be
 * distinguished from a missing one by a non-admin.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const definition = await new HabitCatalogService().getById(auth.auth.userId, id);

    if (!definition) {
      return NextResponse.json({ error: 'Habit definition not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: definition });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PATCH /api/habit-catalog/[id] — edit a suggestion.
 *
 * Admin only.
 *
 * Worth being explicit about what this does *not* do: it does not change any
 * personal habit. Selecting a catalogue entry copies its values onto the user's
 * own row, so editing a suggestion here cannot retroactively rewrite anyone's
 * targets, tiers or history. That is the entire reason `definitionId` is a
 * reference and not a live link.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateHabitDefinitionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await new HabitCatalogService().updateDefinition(
      auth.auth.session.user?.role,
      id,
      parsed.data as Prisma.HabitDefinitionUpdateInput
    );

    if (!updated) {
      return NextResponse.json({ error: 'Habit definition not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/habit-catalog/[id] — hide a catalogue entry.
 *
 * Admin only, and a **deactivate** rather than a delete: every personal habit
 * copied from it keeps working and keeps its provenance badge. A hard delete
 * would `SetNull` every `definitionId` and silently reclassify real habits as
 * custom, which is a data-loss-shaped outcome for an operation that only means
 * "stop suggesting this".
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const deactivated = await new HabitCatalogService().deactivateDefinition(
      auth.auth.session.user?.role,
      id
    );

    if (!deactivated) {
      return NextResponse.json({ error: 'Habit definition not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: deactivated });
  } catch (error) {
    return handleError(error);
  }
}
