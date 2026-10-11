import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { focusService } from '@/server/services/focus.service';
import { focusPresetInputSchema } from '@/schemas/focus.schema';
import { userIdFromSession } from '@/types/ids';

/**
 * /api/focus/presets/[id]
 *
 * A single preset. Every handler `await`s `params` - Next 15+ makes it a Promise, and
 * destructuring it synchronously is the mistake that silently broke several routes in
 * this app already.
 */

interface PresetContext {
  params: Promise<{ id: string }>;
}

/** PATCH - partial update. */
export async function PATCH(request: Request, { params }: PresetContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = focusPresetInputSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const preset = await focusService.updatePreset(
      userIdFromSession(session),
      id,
      parsed.data
    );
    return NextResponse.json({ success: true, data: preset });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE - archives when the preset is referenced, removes it otherwise.
 *
 * The repository decides which, so the route does not have to know; either way the
 * caller gets a truthful answer about what happened.
 */
export async function DELETE(_request: Request, { params }: PresetContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const result = await focusService.deletePreset(userIdFromSession(session), id);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleError(error);
  }
}