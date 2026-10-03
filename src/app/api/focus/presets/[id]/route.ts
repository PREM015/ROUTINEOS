import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { focusService } from '@/server/services/focus.service';
import { focusPresetInputSchema } from '@/schemas/focus.schema';
import { userIdFromSession } from '@/types/ids';
import { AppError } from '@/lib/errors/app-error';
import { z } from 'zod';

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
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.flatten() }, { status: 400 });
    }
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating focus preset:', error);
    return NextResponse.json({ error: 'Failed to update focus preset' }, { status: 500 });
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
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error deleting focus preset:', error);
    return NextResponse.json({ error: 'Failed to delete focus preset' }, { status: 500 });
  }
}